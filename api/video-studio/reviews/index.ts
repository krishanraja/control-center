import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardVideoStudioOperatorRead, videoStudioOperatorIdentity } from '../../_videoStudioAuth.js'
import {
  REVIEW_STATUSES,
  VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
  sendVideoStudioError,
} from '../_contracts.js'
import { enforceVideoStudioRateLimit, listReviews, reviewListProjection } from '../_data.js'

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioOperatorRead(req, res, ['GET'])) return
  if (await enforceVideoStudioRateLimit(res, 'operator:reviews:list', videoStudioOperatorIdentity(req), 120, 60)) return

  const status = first(req.query.status) || 'pending'
  if (status !== 'actionable' && !REVIEW_STATUSES.includes(status as typeof REVIEW_STATUSES[number])) {
    return sendVideoStudioError(res, 400, 'invalid_status')
  }
  const parsedLimit = Number.parseInt(first(req.query.limit), 10)
  const limit = Number.isFinite(parsedLimit) ? Math.min(50, Math.max(1, parsedLimit)) : 20
  const result = await listReviews(status, limit)
  if (result.error) return sendVideoStudioError(res, 503, 'review_store_unavailable')

  const projected = result.reviews.map(({ review, job }) => job ? reviewListProjection(review, job) : null)
  const reviews = projected.filter((item): item is Record<string, unknown> => item !== null)
  const quarantined = projected.length - reviews.length
  return res.status(200).json({
    ok: true,
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    reviews,
    ...(quarantined ? { warnings: [{ code: 'malformed_review_projection', count: quarantined }] } : {}),
    server_time: new Date().toISOString(),
  })
}
