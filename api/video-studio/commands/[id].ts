import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardVideoStudioOperatorRead, videoStudioOperatorIdentity } from '../../_videoStudioAuth.js'
import { supabase } from '../../_supabase.js'
import {
  UUID_RE,
  VIDEO_PLATFORMS,
  VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
  isSha256,
  sendVideoStudioError,
} from '../_contracts.js'
import {
  enforceVideoStudioRateLimit,
  fetchReview,
  reviewDecisionCommandContext,
  reviewDetailProjection,
} from '../_data.js'

const COMMAND_KINDS = [
  'magic_edit_prepare',
  'magic_edit_activate',
  'magic_edit_return_to_parent',
  'review_decision_record',
  'review_recovery_record',
] as const
const COMMAND_STATUSES = ['queued', 'leased', 'succeeded', 'failed', 'attention', 'cancelled'] as const
const SAFE_CODE_RE = /^[a-z][a-z0-9_]{0,79}$/

function queryValue(req: VercelRequest, key: string): string {
  const value = req.query[key]
  return Array.isArray(value) ? value[0] || '' : value || ''
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioOperatorRead(req, res, ['GET'])) return
  if (await enforceVideoStudioRateLimit(res, 'operator:commands:status', videoStudioOperatorIdentity(req), 240, 60)) return

  const rawCommandId = queryValue(req, 'id')
  const jobId = queryValue(req, 'job_id')
  const platform = queryValue(req, 'platform')
  if (!UUID_RE.test(rawCommandId)) return sendVideoStudioError(res, 400, 'invalid_command_id')
  const commandId = rawCommandId.toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]{1,95}$/i.test(jobId)) return sendVideoStudioError(res, 400, 'invalid_job_id')
  if (!VIDEO_PLATFORMS.includes(platform as typeof VIDEO_PLATFORMS[number])) {
    return sendVideoStudioError(res, 400, 'invalid_platform')
  }

  const commandResult = await supabase
    .from('video_studio_commands')
    .select([
      'id', 'job_id', 'platform', 'review_id', 'command_kind', 'status',
      'expected_parent_revision_hash', 'expected_parent_artifact_hash',
      'safe_code', 'created_at', 'completed_at',
    ].join(','))
    .eq('id', commandId)
    .eq('job_id', jobId)
    .eq('platform', platform)
    .maybeSingle()
  if (commandResult.error) return sendVideoStudioError(res, 503, 'command_store_unavailable')
  const command = commandResult.data as unknown as Record<string, unknown> | null
  if (!command) return sendVideoStudioError(res, 404, 'command_not_found')

  const kind = COMMAND_KINDS.includes(command.command_kind as typeof COMMAND_KINDS[number])
    ? command.command_kind as typeof COMMAND_KINDS[number]
    : null
  const status = COMMAND_STATUSES.includes(command.status as typeof COMMAND_STATUSES[number])
    ? command.status as typeof COMMAND_STATUSES[number]
    : null
  let sourceReviewId: string | null | undefined = kind === 'magic_edit_prepare' && UUID_RE.test(String(command.review_id || ''))
    ? String(command.review_id).toLowerCase()
    : kind === 'magic_edit_prepare' ? undefined : null
  const boundReviewId = command.review_id === null
    ? null
    : UUID_RE.test(String(command.review_id || ''))
      ? String(command.review_id).toLowerCase()
      : undefined
  const safeCode = command.safe_code === null
    ? null
    : typeof command.safe_code === 'string' && SAFE_CODE_RE.test(command.safe_code)
      ? command.safe_code
      : undefined
  const completedAt = command.completed_at === null
    ? null
    : validDate(command.completed_at) ? command.completed_at : undefined
  if (
    command.id !== commandId
    || command.job_id !== jobId
    || command.platform !== platform
    || !kind
    || !status
    || sourceReviewId === undefined
    || boundReviewId === undefined
    || (['magic_edit_activate', 'review_decision_record', 'review_recovery_record'].includes(kind) && boundReviewId === null)
    || safeCode === undefined
    || !isSha256(command.expected_parent_revision_hash)
    || !isSha256(command.expected_parent_artifact_hash)
    || !validDate(command.created_at)
    || completedAt === undefined
  ) return sendVideoStudioError(res, 422, 'malformed_command_projection')

  let resultReviewId: string | null = null
  if (kind === 'magic_edit_prepare') {
    const reviewResult = await supabase
      .from('video_studio_review_requests')
      .select('id,job_id,platform,source_command_id')
      .eq('source_command_id', commandId)
      .maybeSingle()
    if (reviewResult.error) return sendVideoStudioError(res, 503, 'review_store_unavailable')
    const resultReview = reviewResult.data as unknown as Record<string, unknown> | null
    if (resultReview) {
      if (
        !UUID_RE.test(String(resultReview.id || ''))
        || resultReview.job_id !== jobId
        || resultReview.platform !== platform
        || resultReview.source_command_id !== commandId
      ) return sendVideoStudioError(res, 422, 'malformed_review_projection')
      resultReviewId = String(resultReview.id).toLowerCase()
    }
    if (
      (status === 'succeeded' && resultReviewId === null)
      || (['queued', 'leased', 'failed', 'cancelled'].includes(status) && resultReviewId !== null)
    ) return sendVideoStudioError(res, 422, 'malformed_command_projection')

    const sourceResult = await fetchReview(sourceReviewId)
    if (sourceResult.error) return sendVideoStudioError(res, 503, 'review_store_unavailable')
    if (!sourceResult.review || !sourceResult.job || !reviewDetailProjection(sourceResult.review, sourceResult.job)) {
      return sendVideoStudioError(res, 422, 'malformed_command_projection')
    }
    if (
      sourceResult.review.job_id !== jobId
      || sourceResult.review.platform !== platform
      || sourceResult.review.parent_revision_hash !== command.expected_parent_revision_hash
      || sourceResult.review.parent_artifact_hash !== command.expected_parent_artifact_hash
      || (resultReviewId !== null && sourceResult.review.status !== 'superseded')
      || (['queued', 'leased'].includes(status) && sourceResult.review.status !== 'pending')
    ) return sendVideoStudioError(res, 422, 'malformed_command_projection')
  }

  if (kind === 'review_recovery_record' && boundReviewId) {
    const recoveryResult = await supabase
      .from('video_studio_command_recoveries')
      .select('source_review_id,recovery_review_id,binding_command_id')
      .eq('binding_command_id', commandId)
      .maybeSingle()
    if (recoveryResult.error) return sendVideoStudioError(res, 503, 'recovery_store_unavailable')
    const recovery = recoveryResult.data as unknown as Record<string, unknown> | null
    if (
      !recovery
      || !UUID_RE.test(String(recovery.source_review_id || ''))
      || recovery.recovery_review_id !== boundReviewId
      || recovery.binding_command_id !== commandId
      || recovery.source_review_id === recovery.recovery_review_id
    ) return sendVideoStudioError(res, 422, 'malformed_command_projection')
    sourceReviewId = String(recovery.source_review_id).toLowerCase()
    const reviewResult = await supabase
      .from('video_studio_review_requests')
      .select('id,job_id,platform,status,binding_state')
      .eq('id', boundReviewId)
      .maybeSingle()
    if (reviewResult.error) return sendVideoStudioError(res, 503, 'review_store_unavailable')
    const recoveryReview = reviewResult.data as unknown as Record<string, unknown> | null
    const expectedBindingState = status === 'succeeded'
      ? 'ready'
      : ['failed', 'attention'].includes(status) ? 'failed' : 'queued'
    if (
      !recoveryReview
      || recoveryReview.id !== boundReviewId
      || recoveryReview.job_id !== jobId
      || recoveryReview.platform !== platform
      || recoveryReview.status !== 'pending'
      || recoveryReview.binding_state !== expectedBindingState
    ) return sendVideoStudioError(res, 422, 'malformed_command_projection')

    const sourceResult = await fetchReview(sourceReviewId)
    if (sourceResult.error) return sendVideoStudioError(res, 503, 'review_store_unavailable')
    if (!sourceResult.review || !sourceResult.job) {
      return sendVideoStudioError(res, 422, 'malformed_command_projection')
    }
    if (!reviewDetailProjection(sourceResult.review, sourceResult.job)) {
      return sendVideoStudioError(res, 422, 'malformed_command_projection')
    }
    const sourceContext = await reviewDecisionCommandContext(sourceResult.review, sourceResult.job)
    const bindingContext = sourceContext?.recovery.binding_command as Record<string, unknown> | null | undefined
    if (
      !bindingContext
      || sourceContext?.recovery.recovery_review_id !== boundReviewId
      || bindingContext.id !== commandId
      || bindingContext.status !== status
      || bindingContext.source_review_id !== sourceReviewId
      || bindingContext.result_review_id !== (status === 'succeeded' ? boundReviewId : null)
    ) return sendVideoStudioError(res, 422, 'malformed_command_projection')
    resultReviewId = status === 'succeeded' ? boundReviewId : null
  }

  let recovery: Record<string, unknown> = {
    available: false,
    of_command_id: null,
    current_generation: 0,
    max_generation: 3,
    recovery_review_id: null,
    recovered_review_id: null,
    binding_command: null,
  }
  if ((kind === 'magic_edit_activate' || kind === 'review_decision_record') && boundReviewId) {
    const reviewResult = await fetchReview(boundReviewId)
    if (reviewResult.error) return sendVideoStudioError(res, 503, 'review_store_unavailable')
    if (!reviewResult.review || !reviewResult.job) {
      return sendVideoStudioError(res, 422, 'malformed_command_projection')
    }
    if (!reviewDetailProjection(reviewResult.review, reviewResult.job)) {
      return sendVideoStudioError(res, 422, 'malformed_command_projection')
    }
    const context = await reviewDecisionCommandContext(reviewResult.review, reviewResult.job)
    if (!context || context.decision_command?.id !== commandId) {
      return sendVideoStudioError(res, 422, 'malformed_command_projection')
    }
    recovery = context.recovery
  }

  return res.status(200).json({
    ok: true,
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    command: {
      id: commandId.toLowerCase(),
      job_id: jobId,
      platform,
      kind,
      status,
      parent_revision_hash: command.expected_parent_revision_hash,
      parent_artifact_hash: command.expected_parent_artifact_hash,
      source_review_id: sourceReviewId,
      result_review_id: resultReviewId,
      safe_code: safeCode,
      created_at: command.created_at,
      completed_at: completedAt,
      recovery,
    },
    server_time: new Date().toISOString(),
  })
}
