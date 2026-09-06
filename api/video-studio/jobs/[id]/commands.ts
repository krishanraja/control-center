import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  guardVideoStudioOperatorMutation,
  videoStudioOperatorIdentity,
} from '../../../_videoStudioAuth.js'
import { supabase } from '../../../_supabase.js'
import {
  VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
  UUID_RE,
  commandTargetToSelection,
  isSha256,
  parseBrowserCommandBody,
  safeErrorCode,
  sendVideoStudioError,
} from '../../_contracts.js'
import { enforceVideoStudioRateLimit, fetchJob, stablePayloadHash } from '../../_data.js'
import { runnerCommandHashInputV1 } from '../../_runnerContracts.js'

function jobId(req: VercelRequest): string {
  const value = req.query.id
  return Array.isArray(value) ? value[0] || '' : value || ''
}

async function staleParentExtras(id: string, platform: string): Promise<Record<string, unknown>> {
  const current = await fetchJob(id, platform)
  if (!current.data) return {}
  return {
    ...(isSha256(current.data.active_revision_hash)
      ? { current_revision_hash: current.data.active_revision_hash }
      : {}),
    ...(isSha256(current.data.active_artifact_hash)
      ? { current_parent_artifact_hash: current.data.active_artifact_hash }
      : {}),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioOperatorMutation(req, res, ['POST'])) return
  if (await enforceVideoStudioRateLimit(res, 'operator:commands:create', videoStudioOperatorIdentity(req), 30, 60)) return

  const id = jobId(req)
  if (!/^[a-z0-9][a-z0-9_-]{1,95}$/i.test(id)) return sendVideoStudioError(res, 400, 'invalid_job_id')
  const body = parseBrowserCommandBody(req.body)
  if (!body) return sendVideoStudioError(res, 400, 'invalid_command')

  const current = await fetchJob(id, body.platform)
  if (current.error) return sendVideoStudioError(res, 503, 'job_store_unavailable')
  if (!current.data) return sendVideoStudioError(res, 404, 'job_not_found')
  if (current.data.platform !== body.platform) return sendVideoStudioError(res, 409, 'platform_mismatch')
  const activeCandidateHash = current.data.active_candidate_hash === null
    ? null
    : isSha256(current.data.active_candidate_hash) ? current.data.active_candidate_hash : undefined
  if (activeCandidateHash === undefined) return sendVideoStudioError(res, 422, 'malformed_job_projection')

  const candidateHash = body.kind === 'magic_edit_prepare' ? null : activeCandidateHash
  const semanticTargetMapHash = body.kind === 'magic_edit_prepare'
    ? body.intent.semantic_target_map_hash
    : null
  const payload = body.kind === 'magic_edit_prepare'
    ? {
        schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
        direction_id: body.idempotency_key,
        job_id: id,
        platform: body.platform,
        expected_parent_revision_hash: body.parent_revision_hash,
        expected_parent_artifact_hash: body.parent_artifact_hash,
        semantic_target_map_hash: body.intent.semantic_target_map_hash,
        selection: commandTargetToSelection(body.intent.target),
        instruction: body.intent.instruction,
        protections: {
          preserve_spoken_words: true,
          preserve_spoken_order: true,
          preserve_claims: true,
          preserve_evidence: true,
          preserve_rights: true,
        },
        requested_profile: 'preview',
        submitted_by: 'Krish',
        submitted_at: body.submitted_at,
      }
    : {
        schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
        return_id: body.idempotency_key,
        job_id: id,
        platform: body.platform,
        expected_parent_revision_hash: body.parent_revision_hash,
        expected_parent_artifact_hash: body.parent_artifact_hash,
        target_parent_revision_hash: body.intent.target_parent_revision_hash,
        target_parent_artifact_hash: body.intent.target_parent_artifact_hash,
        returned_by: 'Krish',
        occurred_at: body.submitted_at,
      }
  const payloadHash = stablePayloadHash(payload)
  const commandHash = stablePayloadHash(runnerCommandHashInputV1({
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    job_id: id,
    command_kind: body.kind,
    platform: body.platform,
    candidate_hash: candidateHash,
    expected_parent_revision_hash: body.parent_revision_hash,
    expected_parent_artifact_hash: body.parent_artifact_hash,
    semantic_target_map_hash: semanticTargetMapHash,
    payload_hash: payloadHash,
    idempotency_key: body.idempotency_key,
  }))

  const { data, error } = await supabase.rpc('video_studio_enqueue_command', {
    p_job_id: id,
    p_platform: body.platform,
    p_source_review_id: body.kind === 'magic_edit_prepare' ? body.source_review_id : null,
    p_command_kind: body.kind,
    p_candidate_hash: candidateHash,
    p_expected_parent_revision_hash: body.parent_revision_hash,
    p_expected_parent_artifact_hash: body.parent_artifact_hash,
    p_semantic_target_map_hash: semanticTargetMapHash,
    p_payload: payload,
    p_payload_hash: payloadHash,
    p_command_hash: commandHash,
    p_idempotency_key: body.idempotency_key,
    p_requested_by: 'operator',
  })
  if (error) {
    const code = safeErrorCode(error)
    const extras = code === 'stale_parent' ? await staleParentExtras(id, body.platform) : {}
    const status = [
      'stale_parent', 'invalid_lineage', 'idempotency_conflict',
      'source_review_conflict', 'invalid_command_shape',
      'cross_platform_magic_lineage', 'command_in_flight',
    ].includes(code) ? 409
      : code === 'job_not_found' ? 404
        : 503
    return sendVideoStudioError(res, status, code, extras)
  }

  const row = Array.isArray(data) ? data[0] : data
  if (
    !UUID_RE.test(String(row?.command_id || ''))
    || !['queued', 'leased', 'succeeded', 'failed', 'attention', 'cancelled'].includes(String(row.command_status || ''))
    || typeof row.created_at !== 'string'
    || !Number.isFinite(Date.parse(row.created_at))
    || typeof row.duplicate !== 'boolean'
  ) {
    return sendVideoStudioError(res, 503, 'command_store_unavailable')
  }
  const duplicate = row.duplicate === true
  return res.status(duplicate ? 200 : 202).json({
    ok: true,
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    duplicate,
    result_action: body.kind === 'magic_edit_prepare' ? 'edit_queued' : 'return_to_parent_queued',
    command: {
      id: row.command_id,
      job_id: id,
      platform: body.platform,
      kind: body.kind,
      status: row.command_status,
      parent_revision_hash: body.parent_revision_hash,
      parent_artifact_hash: body.parent_artifact_hash,
      source_review_id: body.kind === 'magic_edit_prepare' ? body.source_review_id : null,
      created_at: row.created_at,
    },
  })
}
