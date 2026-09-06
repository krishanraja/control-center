import { createHash } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  guardVideoStudioRunner,
  rejectVideoStudioRunnerReceipt,
  verifyVideoStudioRunnerReceipt,
  videoStudioRunnerIdentity,
} from '../../_videoStudioAuth.js'
import { supabase } from '../../_supabase.js'
import {
  VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
  safeErrorCode,
  sendVideoStudioError,
} from '../_contracts.js'
import { enforceVideoStudioRateLimit, stablePayloadHash } from '../_data.js'
import { configuredPreviewStore, verifyStoredPreview } from '../_previewStorage.js'
import {
  parseRunnerCompleteRequest,
  runnerReceiptHashInput,
} from '../_runnerContracts.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioRunner(req, res, ['POST'])) return
  const body = parseRunnerCompleteRequest(req.body)
  if (!body) return sendVideoStudioError(res, 400, 'invalid_receipt')

  const expectedReceiptHash = stablePayloadHash(runnerReceiptHashInput(body.receipt))
  if (expectedReceiptHash !== body.receipt.receipt_hash) {
    return sendVideoStudioError(res, 400, 'receipt_hash_mismatch')
  }
  const signature = verifyVideoStudioRunnerReceipt(body.receipt.receipt_hash, body.receipt.receipt_signature)
  if (signature !== 'valid') return rejectVideoStudioRunnerReceipt(res, signature)

  const runnerIdentity = videoStudioRunnerIdentity(body.runner_id)
  if (await enforceVideoStudioRateLimit(res, 'runner:complete', runnerIdentity, 120, 60)) return
  const leaseTokenHash = createHash('sha256').update(body.lease_token).digest('hex')
  const receipt = body.receipt

  const existingResult = await supabase
    .from('video_studio_command_receipts')
    .select('command_id,job_id,runner_id_hash,command_hash,receipt_signature')
    .eq('receipt_hash', receipt.receipt_hash)
    .maybeSingle()
  if (existingResult.error) return sendVideoStudioError(res, 503, 'receipt_store_unavailable')
  const existing = existingResult.data
  if (existing && (
    existing.command_id !== receipt.command_id
    || existing.job_id !== receipt.job_id
    || existing.runner_id_hash !== runnerIdentity
    || existing.command_hash !== receipt.command_hash
    || existing.receipt_signature !== receipt.receipt_signature
  )) return sendVideoStudioError(res, 409, 'receipt_conflict')

  if (!existing && receipt.result_refs) {
    const refs = receipt.result_refs
    const sides = ['before', 'after'] as const
    for (const side of sides) {
      const objectKey = refs[`${side}_preview_object_key`]
      const byteSize = refs[`${side}_preview_byte_size`]
      const md5 = refs[`${side}_preview_md5`]
      if (typeof objectKey !== 'string' || typeof byteSize !== 'number' || typeof md5 !== 'string') continue
      const previewStore = await configuredPreviewStore()
      if (!previewStore.config) {
        return sendVideoStudioError(res, 503, previewStore.error || 'preview_store_unavailable')
      }
      const stored = await verifyStoredPreview(previewStore.config.bucket, objectKey, byteSize, md5)
      if (stored === 'missing') return sendVideoStudioError(res, 409, 'preview_not_uploaded')
      if (stored === 'mismatch') return sendVideoStudioError(res, 409, 'preview_object_conflict')
      if (stored === 'integrity_unavailable') {
        return sendVideoStudioError(res, 503, 'preview_integrity_unavailable')
      }
      if (stored === 'unavailable') return sendVideoStudioError(res, 503, 'preview_store_unavailable')
    }
  }

  const { data, error } = await supabase.rpc('video_studio_complete_command', {
    p_command_id: receipt.command_id,
    p_job_id: receipt.job_id,
    p_runner_id_hash: runnerIdentity,
    p_lease_token_hash: leaseTokenHash,
    p_command_hash: receipt.command_hash,
    p_receipt_hash: receipt.receipt_hash,
    p_receipt_signature: receipt.receipt_signature,
    p_receipt_status: receipt.status,
    p_result_revision_hash: receipt.result_revision_hash,
    p_result_artifact_hash: receipt.result_artifact_hash,
    p_result_refs: receipt.result_refs || {},
    p_hard_gates: receipt.hard_gates,
    p_retryable: receipt.retryable,
    p_safe_code: receipt.safe_code,
    p_started_at: receipt.started_at,
    p_finished_at: receipt.finished_at,
  })
  if (error) {
    const code = safeErrorCode(error)
    const status = [
      'lease_conflict', 'lease_expired', 'receipt_conflict', 'preview_slot_missing',
      'invalid_preview_refs', 'invalid_editorial_route', 'invalid_lineage',
      'source_review_conflict', 'invalid_receipt', 'invalid_recovery_receipt',
      'invalid_review_binding_transition', 'cross_platform_magic_lineage',
      'command_in_flight', 'stale_parent', 'stale_event_count', 'recovery_exists',
    ].includes(code)
      ? 409
      : code === 'command_not_found' ? 404 : 503
    return sendVideoStudioError(res, status, code)
  }
  const row = Array.isArray(data) ? data[0] : data
  if (
    !row
    || typeof row.duplicate !== 'boolean'
    || !['succeeded', 'failed', 'attention'].includes(String(row.command_status || ''))
  ) {
    return sendVideoStudioError(res, 503, 'receipt_store_unavailable')
  }
  return res.status(200).json({
    ok: true,
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    duplicate: row.duplicate === true,
    command_id: receipt.command_id,
    receipt_hash: receipt.receipt_hash,
    command_status: row.command_status,
  })
}
