import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardVideoStudioOperatorRead, videoStudioOperatorIdentity } from '../../../../_videoStudioAuth.js'
import { supabase } from '../../../../_supabase.js'
import { UUID_RE, sendVideoStudioError } from '../../../_contracts.js'
import { enforceVideoStudioRateLimit, previewObjectForReview } from '../../../_data.js'
import { configuredPreviewStore, isSignedPreviewUrlAllowed } from '../../../_previewStorage.js'

function queryValue(req: VercelRequest, key: string): string {
  const value = req.query[key]
  return Array.isArray(value) ? value[0] || '' : value || ''
}

function safeObjectKey(commandId: string, side: 'before' | 'after', value: string): boolean {
  const match = /^commands\/([0-9a-f-]{36})\/previews\/(before|after)\/([a-f0-9]{64})\.mp4$/.exec(value)
  return Boolean(match)
    && match?.[1]?.toLowerCase() === commandId.toLowerCase()
    && match?.[2] === side
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioOperatorRead(req, res, ['GET'])) return
  if (await enforceVideoStudioRateLimit(res, 'operator:reviews:preview', videoStudioOperatorIdentity(req), 240, 60)) return

  const rawReviewId = queryValue(req, 'id')
  const side = queryValue(req, 'side')
  if (!UUID_RE.test(rawReviewId)) return sendVideoStudioError(res, 400, 'invalid_review_id')
  const reviewId = rawReviewId.toLowerCase()
  if (side !== 'before' && side !== 'after') return sendVideoStudioError(res, 400, 'invalid_preview_side')

  const previewStore = await configuredPreviewStore()
  if (!previewStore.config) {
    return sendVideoStudioError(res, 503, previewStore.error || 'preview_store_unavailable')
  }

  const result = await previewObjectForReview(reviewId, side)
  if (result.error) return sendVideoStudioError(res, 503, 'preview_store_unavailable')
  if (!result.objectKey || !result.sourceCommandId || !safeObjectKey(result.sourceCommandId, side, result.objectKey)) {
    return sendVideoStudioError(res, 404, 'preview_not_found')
  }

  const signed = await supabase.storage.from(previewStore.config.bucket).createSignedUrl(result.objectKey, 60)
  if (signed.error || !signed.data?.signedUrl) return sendVideoStudioError(res, 503, 'preview_store_unavailable')
  if (!isSignedPreviewUrlAllowed(signed.data.signedUrl, previewStore.config.supabaseOrigin)) {
    return sendVideoStudioError(res, 502, 'preview_origin_rejected')
  }
  return res.redirect(307, signed.data.signedUrl)
}
