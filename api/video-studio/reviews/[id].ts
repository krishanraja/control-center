import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardVideoStudioOperatorRead, videoStudioOperatorIdentity } from '../../_videoStudioAuth.js'
import { UUID_RE, VIDEO_STUDIO_CONTROL_SCHEMA_VERSION, sendVideoStudioError } from '../_contracts.js'
import {
  enforceVideoStudioRateLimit,
  fetchReview,
  reviewDecisionCommandContext,
  reviewDetailProjection,
} from '../_data.js'

function pathId(req: VercelRequest): string {
  const value = req.query.id
  return Array.isArray(value) ? value[0] || '' : value || ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioOperatorRead(req, res, ['GET'])) return
  if (await enforceVideoStudioRateLimit(res, 'operator:reviews:detail', videoStudioOperatorIdentity(req), 180, 60)) return

  const rawReviewId = pathId(req)
  if (!UUID_RE.test(rawReviewId)) return sendVideoStudioError(res, 400, 'invalid_review_id')
  const reviewId = rawReviewId.toLowerCase()
  const result = await fetchReview(reviewId)
  if (result.error) return sendVideoStudioError(res, 503, 'review_store_unavailable')
  if (!result.review) return sendVideoStudioError(res, 404, 'review_not_found')
  if (!result.job) return sendVideoStudioError(res, 422, 'malformed_review_projection')
  const review = reviewDetailProjection(result.review, result.job)
  if (!review) return sendVideoStudioError(res, 422, 'malformed_review_projection')
  const commandContext = await reviewDecisionCommandContext(result.review, result.job)
  if (!commandContext) return sendVideoStudioError(res, 422, 'malformed_review_projection')
  return res.status(200).json({
    ok: true,
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    review: { ...review, ...commandContext },
  })
}
