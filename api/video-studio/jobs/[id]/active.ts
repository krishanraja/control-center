import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardVideoStudioOperatorRead, videoStudioOperatorIdentity } from '../../../_videoStudioAuth.js'
import { VIDEO_STUDIO_CONTROL_SCHEMA_VERSION, sendVideoStudioError } from '../../_contracts.js'
import {
  activeJobProjection,
  enforceVideoStudioRateLimit,
  fetchJob,
} from '../../_data.js'

function jobId(req: VercelRequest): string {
  const value = req.query.id
  return Array.isArray(value) ? value[0] || '' : value || ''
}

function platformId(req: VercelRequest): string {
  const value = req.query.platform
  return Array.isArray(value) ? value[0] || '' : value || ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioOperatorRead(req, res, ['GET'])) return
  if (await enforceVideoStudioRateLimit(res, 'operator:jobs:active', videoStudioOperatorIdentity(req), 180, 60)) return

  const id = jobId(req)
  if (!/^[a-z0-9][a-z0-9_-]{1,95}$/i.test(id)) return sendVideoStudioError(res, 400, 'invalid_job_id')
  const platform = platformId(req)
  if (!['youtube_shorts', 'linkedin', 'tiktok', 'instagram_reels'].includes(platform)) {
    return sendVideoStudioError(res, 400, 'invalid_platform')
  }
  const result = await fetchJob(id, platform)
  if (result.error) return sendVideoStudioError(res, 503, 'job_store_unavailable')
  if (!result.data) return sendVideoStudioError(res, 404, 'job_not_found')
  const job = activeJobProjection(result.data)
  if (!job) return sendVideoStudioError(res, 422, 'malformed_job_projection')
  return res.status(200).json({
    ok: true,
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    job,
    server_time: new Date().toISOString(),
  })
}
