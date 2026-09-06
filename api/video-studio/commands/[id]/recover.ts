import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  guardVideoStudioOperatorMutation,
  videoStudioOperatorIdentity,
} from '../../../_videoStudioAuth.js'
import { supabase } from '../../../_supabase.js'
import {
  REVIEW_GATES,
  UUID_RE,
  VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
  isSha256,
  parseRecoverFailedCommandBody,
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

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioOperatorMutation(req, res, ['POST'])) return
  if (await enforceVideoStudioRateLimit(
    res,
    'operator:commands:recover',
    videoStudioOperatorIdentity(req),
    10,
    60,
  )) return

  const rawCommandId = pathId(req)
  if (!UUID_RE.test(rawCommandId)) return sendVideoStudioError(res, 400, 'invalid_command_id')
  const commandId = rawCommandId.toLowerCase()
  const body = parseRecoverFailedCommandBody(req.body)
  if (!body) return sendVideoStudioError(res, 400, 'invalid_recovery_request')

  const commandResult = await supabase
    .from('video_studio_commands')
    .select([
      'id', 'job_id', 'platform', 'review_id', 'command_kind', 'status', 'safe_code',
      'command_hash', 'expected_parent_revision_hash', 'expected_parent_artifact_hash',
    ].join(','))
    .eq('id', commandId)
    .maybeSingle()
  if (commandResult.error) return sendVideoStudioError(res, 503, 'command_store_unavailable')
  const sourceCommand = commandResult.data as unknown as Record<string, unknown> | null
  if (!sourceCommand) return sendVideoStudioError(res, 404, 'command_not_found')
  if (
    sourceCommand.job_id !== body.job_id
    || sourceCommand.platform !== body.platform
    || !['magic_edit_activate', 'review_decision_record'].includes(String(sourceCommand.command_kind || ''))
    || !UUID_RE.test(String(sourceCommand.review_id || ''))
    || !isSha256(sourceCommand.command_hash)
    || sourceCommand.expected_parent_revision_hash !== body.parent_revision_hash
    || sourceCommand.expected_parent_artifact_hash !== body.parent_artifact_hash
    || (
      sourceCommand.status !== 'failed'
      && !(
        sourceCommand.status === 'attention'
        && ['attempts_exhausted', 'command_expired'].includes(String(sourceCommand.safe_code || ''))
      )
    )
  ) return sendVideoStudioError(res, 409, 'recovery_not_available')

  const sourceReviewId = String(sourceCommand.review_id).toLowerCase()
  const current = await fetchReview(sourceReviewId)
  if (current.error) return sendVideoStudioError(res, 503, 'review_store_unavailable')
  if (!current.review || !current.job) return sendVideoStudioError(res, 409, 'recovery_conflict')
  if (!reviewDetailProjection(current.review, current.job)) {
    return sendVideoStudioError(res, 422, 'malformed_review_projection')
  }
  const generation = Number(current.review.recovery_generation)
  const rootCommandId = current.review.recovery_root_command_id === null
    ? commandId
    : UUID_RE.test(String(current.review.recovery_root_command_id || ''))
      ? String(current.review.recovery_root_command_id).toLowerCase()
      : null
  const gate = REVIEW_GATES.includes(current.review.gate as typeof REVIEW_GATES[number])
    ? current.review.gate as typeof REVIEW_GATES[number]
    : null
  const candidateHash = current.review.candidate_hash === null
    ? null
    : isSha256(current.review.candidate_hash) ? current.review.candidate_hash : undefined
  const semanticTargetMapHash = isSha256(current.review.semantic_target_map_hash)
    ? current.review.semantic_target_map_hash
    : null
  if (
    current.review.job_id !== body.job_id
    || current.review.platform !== body.platform
    || current.review.parent_revision_hash !== body.parent_revision_hash
    || current.review.parent_artifact_hash !== body.parent_artifact_hash
    || current.review.binding_state !== 'ready'
    || !Number.isSafeInteger(generation)
    || generation < 0
    || generation >= 3
    || !rootCommandId
    || !gate
    || candidateHash === undefined
    || !semanticTargetMapHash
    || !isSha256(current.review.revision_hash)
    || !isSha256(current.review.artifact_hash)
    || body.idempotency_key === sourceReviewId
  ) return sendVideoStudioError(res, 409, 'recovery_conflict')

  const recoveryReviewId = body.idempotency_key
  const recoveryGeneration = generation + 1
  const sourceTerminalReason = sourceCommand.status === 'failed'
    ? 'runner_failed_receipt'
    : sourceCommand.safe_code as 'attempts_exhausted' | 'command_expired'
  const runnerPayload = {
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    recovery_id: body.idempotency_key,
    job_id: body.job_id,
    platform: body.platform,
    source_review_id: sourceReviewId,
    recovery_review_id: recoveryReviewId,
    source_command_id: commandId,
    source_command_hash: sourceCommand.command_hash,
    source_terminal_reason: sourceTerminalReason,
    recovery_root_command_id: rootCommandId,
    recovery_generation: recoveryGeneration,
    gate,
    expected_parent_revision_hash: body.parent_revision_hash,
    expected_parent_artifact_hash: body.parent_artifact_hash,
    review_revision_hash: current.review.revision_hash,
    review_artifact_hash: current.review.artifact_hash,
    candidate_hash: candidateHash,
    semantic_target_map_hash: semanticTargetMapHash,
    recovered_by: 'Krish',
    occurred_at: body.submitted_at,
  }
  const runnerPayloadHash = stablePayloadHash(runnerPayload)
  const runnerCommandHash = stablePayloadHash(runnerCommandHashInputV1({
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    command_kind: 'review_recovery_record',
    job_id: body.job_id,
    platform: body.platform,
    candidate_hash: candidateHash,
    expected_parent_revision_hash: body.parent_revision_hash,
    expected_parent_artifact_hash: body.parent_artifact_hash,
    semantic_target_map_hash: semanticTargetMapHash,
    idempotency_key: body.idempotency_key,
    payload_hash: runnerPayloadHash,
  }))

  const recoveryHash = stablePayloadHash({
    source_command_id: commandId,
    ...body,
  })
  const { data, error } = await supabase.rpc('video_studio_recover_failed_review', {
    p_command_id: commandId,
    p_job_id: body.job_id,
    p_platform: body.platform,
    p_expected_parent_revision_hash: body.parent_revision_hash,
    p_expected_parent_artifact_hash: body.parent_artifact_hash,
    p_idempotency_key: body.idempotency_key,
    p_submitted_at: body.submitted_at,
    p_recovery_hash: recoveryHash,
    p_recovery_review_id: recoveryReviewId,
    p_runner_payload: runnerPayload,
    p_runner_payload_hash: runnerPayloadHash,
    p_runner_command_hash: runnerCommandHash,
  })
  if (error) {
    const code = safeErrorCode(error)
    const status = code === 'command_not_found'
      ? 404
      : ['stale_parent', 'idempotency_conflict', 'recovery_not_available', 'recovery_exists',
          'recovery_conflict', 'recovery_limit_reached', 'recovery_preview_expired',
          'cross_platform_magic_lineage', 'command_in_flight'].includes(code)
        ? 409
        : code === 'invalid_recovery_request' ? 400 : 503
    return sendVideoStudioError(res, status, code)
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  if (
    !row
    || typeof row.duplicate !== 'boolean'
    || !UUID_RE.test(String(row.recovery_review_id || ''))
    || String(row.recovery_review_id).toLowerCase() !== recoveryReviewId
    || row.recovery_generation !== recoveryGeneration
    || row.job_id !== body.job_id
    || row.platform !== body.platform
    || row.review_status !== 'pending'
    || row.parent_revision_hash !== body.parent_revision_hash
    || row.parent_artifact_hash !== body.parent_artifact_hash
    || !validDate(row.created_at)
    || !UUID_RE.test(String(row.binding_command_id || ''))
    || !['queued', 'leased', 'succeeded', 'failed', 'attention', 'cancelled'].includes(String(row.binding_command_status || ''))
    || !validDate(row.binding_command_created_at)
  ) return sendVideoStudioError(res, 503, 'recovery_store_unavailable')

  return res.status(row.duplicate ? 200 : 202).json({
    ok: true,
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    duplicate: row.duplicate,
    result_action: 'recovery_binding_requested',
    source_command_id: commandId,
    source_review_id: sourceReviewId,
    recovery_review_id: String(row.recovery_review_id).toLowerCase(),
    recovery_generation: recoveryGeneration,
    command: {
      id: String(row.binding_command_id).toLowerCase(),
      job_id: body.job_id,
      platform: body.platform,
      kind: 'review_recovery_record',
      status: row.binding_command_status,
      parent_revision_hash: body.parent_revision_hash,
      parent_artifact_hash: body.parent_artifact_hash,
      source_review_id: sourceReviewId,
      result_review_id: row.binding_command_status === 'succeeded'
        ? String(row.recovery_review_id).toLowerCase()
        : null,
      created_at: row.binding_command_created_at,
    },
  })
}
