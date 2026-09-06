import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  guardVideoStudioOperatorMutation,
  videoStudioOperatorIdentity,
} from '../../../_videoStudioAuth.js'
import { supabase } from '../../../_supabase.js'
import {
  UUID_RE,
  REVIEW_GATES,
  VIDEO_PLATFORMS,
  VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
  isSha256,
  parseReviewDecisionBody,
  safeErrorCode,
  sendVideoStudioError,
} from '../../_contracts.js'
import {
  enforceVideoStudioRateLimit,
  fetchReview,
  reviewDetailProjection,
  stablePayloadHash,
} from '../../_data.js'
import { runnerCommandHashInputV1 } from '../../_runnerContracts.js'

function pathId(req: VercelRequest): string {
  const value = req.query.id
  return Array.isArray(value) ? value[0] || '' : value || ''
}

async function staleParentExtras(reviewId: string): Promise<Record<string, unknown>> {
  const current = await fetchReview(reviewId)
  if (!current.job) return {}
  return {
    ...(isSha256(current.job.active_revision_hash)
      ? { current_revision_hash: current.job.active_revision_hash }
      : {}),
    ...(isSha256(current.job.active_artifact_hash)
      ? { current_parent_artifact_hash: current.job.active_artifact_hash }
      : {}),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioOperatorMutation(req, res, ['POST'])) return
  if (await enforceVideoStudioRateLimit(res, 'operator:reviews:decision', videoStudioOperatorIdentity(req), 30, 60)) return

  const rawReviewId = pathId(req)
  if (!UUID_RE.test(rawReviewId)) return sendVideoStudioError(res, 400, 'invalid_review_id')
  const reviewId = rawReviewId.toLowerCase()
  const body = parseReviewDecisionBody(req.body)
  if (!body) return sendVideoStudioError(res, 400, 'invalid_decision')
  const currentReview = await fetchReview(reviewId)
  if (currentReview.error) return sendVideoStudioError(res, 503, 'review_store_unavailable')
  if (!currentReview.review) return sendVideoStudioError(res, 404, 'review_not_found')
  if (!currentReview.job) return sendVideoStudioError(res, 422, 'malformed_review_projection')
  if (!reviewDetailProjection(currentReview.review, currentReview.job)) {
    return sendVideoStudioError(res, 422, 'malformed_review_projection')
  }
  const currentJobId = String(currentReview.review.job_id || '')
  if (!/^[a-z0-9][a-z0-9_-]{1,95}$/i.test(currentJobId)) {
    return sendVideoStudioError(res, 422, 'malformed_review_projection')
  }
  const platform = VIDEO_PLATFORMS.includes(currentReview.review.platform as typeof VIDEO_PLATFORMS[number])
    && currentReview.review.platform === currentReview.job.platform
    ? currentReview.review.platform as typeof VIDEO_PLATFORMS[number]
    : null
  const candidateHash = currentReview.review.candidate_hash === null
    ? null
    : isSha256(currentReview.review.candidate_hash) ? currentReview.review.candidate_hash : undefined
  const semanticTargetMapHash = isSha256(currentReview.review.semantic_target_map_hash)
    ? currentReview.review.semantic_target_map_hash
    : null
  const queuesActivation = currentReview.review.queues_activation
  const gate = REVIEW_GATES.includes(currentReview.review.gate as typeof REVIEW_GATES[number])
    ? currentReview.review.gate as typeof REVIEW_GATES[number]
    : null
  if (
    !platform
    || candidateHash === undefined
    || !semanticTargetMapHash
    || !gate
    || typeof queuesActivation !== 'boolean'
    || (body.decision === 'use_candidate' && queuesActivation && !candidateHash)
  ) {
    return sendVideoStudioError(res, 422, 'malformed_review_projection')
  }
  if (
    (gate === 'learning' && !body.learning_confirmation)
    || (gate !== 'learning' && body.learning_confirmation !== undefined)
  ) return sendVideoStudioError(res, 400, 'invalid_decision')

  const decisionHash = stablePayloadHash({ review_id: reviewId, ...body })
  const shouldActivate = body.decision === 'use_candidate' && queuesActivation
  const runnerCommandKind = shouldActivate ? 'magic_edit_activate' : 'review_decision_record'
  const runnerPayload = shouldActivate
    ? {
        schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
        activation_id: body.idempotency_key,
        job_id: currentJobId,
        platform,
        candidate_hash: candidateHash,
        expected_parent_revision_hash: body.parent_revision_hash,
        expected_parent_artifact_hash: body.parent_artifact_hash,
        prepared_treatment_artifact_hash: body.artifact_hash,
        decision: 'activate',
        approved_by: 'Krish',
        confirmation_ref: `control-center-confirmation:treatment:${body.artifact_hash}:review:${reviewId}:decision:${body.idempotency_key}`,
        occurred_at: body.submitted_at,
      }
    : {
        schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
        decision_id: body.idempotency_key,
        job_id: currentJobId,
        platform,
        review_id: reviewId,
        gate,
        candidate_hash: candidateHash,
        semantic_target_map_hash: semanticTargetMapHash,
        expected_parent_revision_hash: body.parent_revision_hash,
        expected_parent_artifact_hash: body.parent_artifact_hash,
        review_revision_hash: body.revision_hash,
        review_artifact_hash: body.artifact_hash,
        decision: body.decision,
        feedback: body.feedback || null,
        override_reason: body.override_reason || null,
        learning_confirmation: body.learning_confirmation || null,
        decided_by: 'Krish',
        occurred_at: body.submitted_at,
      }
  const runnerPayloadHash = stablePayloadHash(runnerPayload)
  const runnerCommandHash = stablePayloadHash(runnerCommandHashInputV1({
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    job_id: currentJobId,
    command_kind: runnerCommandKind,
    platform,
    candidate_hash: candidateHash,
    expected_parent_revision_hash: body.parent_revision_hash,
    expected_parent_artifact_hash: body.parent_artifact_hash,
    semantic_target_map_hash: semanticTargetMapHash,
    payload_hash: runnerPayloadHash,
    idempotency_key: body.idempotency_key,
  }))

  const { data, error } = await supabase.rpc('video_studio_record_decision', {
    p_review_id: reviewId,
    p_idempotency_key: body.idempotency_key,
    p_expected_parent_revision_hash: body.parent_revision_hash,
    p_expected_parent_artifact_hash: body.parent_artifact_hash,
    p_revision_hash: body.revision_hash,
    p_artifact_hash: body.artifact_hash,
    p_decision: body.decision,
    p_feedback: body.feedback || null,
    p_override_reason: body.override_reason || null,
    p_learning_confirmation: body.learning_confirmation || null,
    p_submitted_at: body.submitted_at,
    p_decision_hash: decisionHash,
    p_runner_payload: runnerPayload,
    p_runner_payload_hash: runnerPayloadHash,
    p_runner_command_hash: runnerCommandHash,
  })
  if (error) {
    const code = safeErrorCode(error)
    const extras = code === 'stale_parent' ? await staleParentExtras(reviewId) : {}
    const status = [
      'stale_parent', 'idempotency_conflict', 'review_not_pending', 'review_expired',
      'review_binding_pending', 'review_in_progress', 'hard_gate_blocked', 'invalid_decision_payload',
      'cross_platform_magic_lineage', 'command_in_flight',
    ].includes(code)
      ? 409
      : code === 'review_not_found' || code === 'job_not_found' ? 404 : 503
    return sendVideoStudioError(res, status, code, extras)
  }

  const row = Array.isArray(data) ? data[0] : data
  if (
    !['approved', 'rejected'].includes(String(row?.review_status || ''))
    || !['use_candidate', 'keep_current'].includes(String(row?.result_action || ''))
    || row.result_action !== body.decision
    || row.review_status !== (body.decision === 'use_candidate' ? 'approved' : 'rejected')
    || typeof row?.decided_at !== 'string'
    || !Number.isFinite(Date.parse(row.decided_at))
    || !UUID_RE.test(String(row.command_id || ''))
    || !['queued', 'leased', 'succeeded', 'failed', 'attention', 'cancelled'].includes(String(row.command_status || ''))
    || typeof row.command_created_at !== 'string'
    || !Number.isFinite(Date.parse(row.command_created_at))
    || typeof row.duplicate !== 'boolean'
  ) {
    return sendVideoStudioError(res, 503, 'review_store_unavailable')
  }
  const duplicate = row.duplicate === true
  const response = {
    ok: true,
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    duplicate,
    result_action: row.result_action,
    review: {
      id: reviewId,
      job_id: currentJobId,
      platform,
      status: row.review_status,
      parent_revision_hash: body.parent_revision_hash,
      parent_artifact_hash: body.parent_artifact_hash,
      revision_hash: body.revision_hash,
      artifact_hash: body.artifact_hash,
      decided_at: row.decided_at,
    },
    command: {
      id: row.command_id,
      job_id: currentJobId,
      platform,
      kind: runnerCommandKind,
      status: row.command_status,
      parent_revision_hash: body.parent_revision_hash,
      parent_artifact_hash: body.parent_artifact_hash,
      created_at: row.command_created_at,
    },
  }
  return res.status(!duplicate ? 202 : 200).json(response)
}
