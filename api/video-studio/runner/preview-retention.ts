import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardVideoStudioRunner, videoStudioRunnerIdentity } from '../../_videoStudioAuth.js'
import { supabase } from '../../_supabase.js'
import {
  UUID_RE,
  VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
  safeErrorCode,
  sendVideoStudioError,
} from '../_contracts.js'
import { enforceVideoStudioRateLimit } from '../_data.js'
import { configuredPreviewStore } from '../_previewStorage.js'
import { parseRunnerPreviewRetentionRequest } from '../_runnerContracts.js'

const RECOVERY_GRACE_MS = 7 * 24 * 60 * 60 * 1_000

type RetentionCandidate = {
  slot_id: string
  command_id: string
  object_key: string
  retention_after: string
}

function validObjectKey(commandId: string, value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^commands\/([0-9a-f-]{36})\/previews\/(before|after)\/([a-f0-9]{64})\.mp4$/.exec(value)
  return Boolean(match && match[1]?.toLowerCase() === commandId)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioRunner(req, res, ['POST'])) return
  const body = parseRunnerPreviewRetentionRequest(req.body)
  if (!body) return sendVideoStudioError(res, 400, 'invalid_retention_request')
  const runnerIdentity = videoStudioRunnerIdentity(body.runner_id)
  if (await enforceVideoStudioRateLimit(res, 'runner:preview-retention', runnerIdentity, 6, 60 * 60)) return

  const previewStore = await configuredPreviewStore()
  if (!previewStore.config) return sendVideoStudioError(res, 503, previewStore.error || 'preview_store_unavailable')
  const cutoff = new Date(Date.now() - RECOVERY_GRACE_MS).toISOString()
  const { data, error } = await supabase.rpc('video_studio_preview_retention_candidates', {
    p_cutoff: cutoff,
    p_limit: body.limit,
  })
  if (error) return sendVideoStudioError(res, 503, safeErrorCode(error))

  const rawRows = Array.isArray(data) ? data : []
  const candidates: RetentionCandidate[] = []
  for (const raw of rawRows) {
    const row = raw as Record<string, unknown>
    const slotId = String(row.slot_id || '').toLowerCase()
    const commandId = String(row.command_id || '').toLowerCase()
    const retentionAfter = String(row.retention_after || '')
    if (
      !UUID_RE.test(slotId)
      || !UUID_RE.test(commandId)
      || !validObjectKey(commandId, row.object_key)
      || !Number.isFinite(Date.parse(retentionAfter))
      || Date.parse(retentionAfter) > Date.parse(cutoff)
    ) return sendVideoStudioError(res, 503, 'retention_store_unavailable')
    candidates.push({
      slot_id: slotId,
      command_id: commandId,
      object_key: row.object_key,
      retention_after: retentionAfter,
    })
  }

  if (!candidates.length) {
    return res.status(200).json({
      ok: true,
      schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
      reviewed: 0,
      deleted_objects: 0,
      cutoff,
    })
  }

  const objectKeys = [...new Set(candidates.map((candidate) => candidate.object_key))]
  const removed = await supabase.storage.from(previewStore.config.bucket).remove(objectKeys)
  if (removed.error) return sendVideoStudioError(res, 503, 'preview_retention_unavailable')

  const recorded = await Promise.all(candidates.map((candidate) => supabase.rpc(
    'video_studio_record_preview_retention',
    {
      p_slot_id: candidate.slot_id,
      p_command_id: candidate.command_id,
      p_retention_after: candidate.retention_after,
      p_deleted_object_count: 1,
    },
  )))
  if (recorded.some((result) => result.error)) {
    return sendVideoStudioError(res, 503, 'preview_retention_record_unavailable')
  }

  return res.status(200).json({
    ok: true,
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    reviewed: candidates.length,
    deleted_objects: objectKeys.length,
    cutoff,
  })
}
