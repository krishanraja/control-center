import { createHash } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardVideoStudioRunner, videoStudioRunnerIdentity } from '../../_videoStudioAuth.js'
import { supabase } from '../../_supabase.js'
import {
  VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
  safeErrorCode,
  sendVideoStudioError,
} from '../_contracts.js'
import { enforceVideoStudioRateLimit } from '../_data.js'
import {
  configuredPreviewStore,
  isSignedPreviewUrlAllowed,
  verifyStoredPreview,
} from '../_previewStorage.js'
import {
  normalizeDatabaseTimestamp,
  parseRunnerPreviewUploadRequest,
  videoStudioPreviewObjectKey,
} from '../_runnerContracts.js'

const SIGNED_UPLOAD_TTL_SECONDS = 2 * 60 * 60

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioRunner(req, res, ['POST'])) return
  const body = parseRunnerPreviewUploadRequest(req.body)
  if (!body) return sendVideoStudioError(res, 400, 'invalid_preview_upload_request')

  const runnerIdentity = videoStudioRunnerIdentity(body.runner_id)
  if (await enforceVideoStudioRateLimit(res, 'runner:preview-upload', runnerIdentity, 120, 60)) return

  const previewStore = await configuredPreviewStore()
  if (!previewStore.config) return sendVideoStudioError(res, 503, previewStore.error || 'preview_store_unavailable')

  const leaseTokenHash = createHash('sha256').update(body.lease_token).digest('hex')
  const expectedObjectKey = videoStudioPreviewObjectKey(body.command_id, body.side, body.sha256)
  const { data, error } = await supabase.rpc('video_studio_reserve_preview_upload', {
    p_command_id: body.command_id,
    p_runner_id_hash: runnerIdentity,
    p_lease_token_hash: leaseTokenHash,
    p_command_hash: body.command_hash,
    p_side: body.side,
    p_content_sha256: body.sha256,
    p_content_md5: body.md5,
    p_byte_size: body.byte_size,
    p_content_type: body.content_type,
  })
  if (error) {
    const code = safeErrorCode(error)
    const status = ['lease_conflict', 'lease_expired', 'preview_slot_conflict'].includes(code)
      ? 409
      : code === 'command_not_found' ? 404 : 503
    return sendVideoStudioError(res, status, code)
  }
  const row = Array.isArray(data) ? data[0] : data
  const slotExpiresAt = normalizeDatabaseTimestamp(row?.slot_expires_at)
  if (
    !row
    || row.object_key !== expectedObjectKey
    || typeof row.duplicate !== 'boolean'
    || !slotExpiresAt
  ) return sendVideoStudioError(res, 503, 'preview_slot_store_unavailable')
  if (Date.parse(slotExpiresAt) <= Date.now()) {
    return sendVideoStudioError(res, 409, 'preview_slot_expired')
  }

  const stored = await verifyStoredPreview(
    previewStore.config.bucket,
    expectedObjectKey,
    body.byte_size,
    body.md5,
  )
  if (stored === 'mismatch') return sendVideoStudioError(res, 409, 'preview_object_conflict')
  if (stored === 'integrity_unavailable') return sendVideoStudioError(res, 503, 'preview_integrity_unavailable')
  if (stored === 'unavailable') return sendVideoStudioError(res, 503, 'preview_store_unavailable')

  let signedUploadUrl: string | null = null
  let uploadExpiresAt: string | null = null
  if (stored === 'missing') {
    const signed = await supabase.storage
      .from(previewStore.config.bucket)
      .createSignedUploadUrl(expectedObjectKey, { upsert: false })
    if (
      signed.error
      || !signed.data?.signedUrl
      || !isSignedPreviewUrlAllowed(signed.data.signedUrl, previewStore.config.supabaseOrigin)
    ) return sendVideoStudioError(res, 503, 'preview_store_unavailable')
    signedUploadUrl = signed.data.signedUrl
    uploadExpiresAt = new Date(Math.min(
      Date.now() + SIGNED_UPLOAD_TTL_SECONDS * 1000,
      Date.parse(slotExpiresAt),
    )).toISOString()
  }

  return res.status(200).json({
    ok: true,
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    duplicate: row.duplicate,
    existing_verified: stored === 'verified',
    slot: {
      command_id: body.command_id,
      side: body.side,
      sha256: body.sha256,
      md5: body.md5,
      byte_size: body.byte_size,
      content_type: body.content_type,
      object_key: expectedObjectKey,
      slot_expires_at: slotExpiresAt,
      upload: {
        method: 'PUT',
        url: signedUploadUrl,
        headers: { 'Content-Type': body.content_type },
        expires_at: uploadExpiresAt,
      },
    },
  })
}
