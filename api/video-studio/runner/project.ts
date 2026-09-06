import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardVideoStudioRunner, videoStudioRunnerIdentity } from '../../_videoStudioAuth.js'
import { supabase } from '../../_supabase.js'
import {
  VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
  safeErrorCode,
  sendVideoStudioError,
} from '../_contracts.js'
import { enforceVideoStudioRateLimit, stablePayloadHash } from '../_data.js'
import { parseRunnerProjectRequest } from '../_runnerContracts.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioRunner(req, res, ['POST'])) return
  const body = parseRunnerProjectRequest(req.body)
  if (!body) return sendVideoStudioError(res, 400, 'invalid_projection')
  if (stablePayloadHash(body.projection) !== body.projection_hash) {
    return sendVideoStudioError(res, 400, 'projection_hash_mismatch')
  }

  const runnerIdentity = videoStudioRunnerIdentity(body.runner_id)
  if (await enforceVideoStudioRateLimit(res, 'runner:project', runnerIdentity, 60, 60)) return
  const { data, error } = await supabase.rpc('video_studio_project_review', {
    p_runner_id_hash: runnerIdentity,
    p_software_commit: body.software_commit,
    p_idempotency_key: body.idempotency_key,
    p_projection_hash: body.projection_hash,
    p_projection: body.projection,
  })
  if (error) {
    const code = safeErrorCode(error)
    const status = [
      'idempotency_conflict', 'projection_conflict', 'command_in_flight',
      'cross_platform_magic_lineage',
    ].includes(code) ? 409 : 503
    return sendVideoStudioError(res, status, code)
  }
  const row = Array.isArray(data) ? data[0] : data
  if (
    !row
    || typeof row.duplicate !== 'boolean'
    || row.job_id !== body.projection.job.job_id
    || row.platform !== body.projection.platform_state.platform
    || row.review_id !== body.projection.review.id
  ) return sendVideoStudioError(res, 503, 'projection_store_unavailable')
  return res.status(200).json({
    ok: true,
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    duplicate: row.duplicate,
    projection_hash: body.projection_hash,
    job_id: row.job_id,
    platform: row.platform,
  })
}
