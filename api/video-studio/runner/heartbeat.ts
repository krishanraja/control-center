import { createHash } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardVideoStudioRunner, videoStudioRunnerIdentity } from '../../_videoStudioAuth.js'
import { supabase } from '../../_supabase.js'
import { VIDEO_STUDIO_CONTROL_SCHEMA_VERSION, sendVideoStudioError } from '../_contracts.js'
import { enforceVideoStudioRateLimit } from '../_data.js'
import { normalizeDatabaseTimestamp, parseRunnerHeartbeatRequest } from '../_runnerContracts.js'

const HEARTBEAT_LEASE_SECONDS = 120

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioRunner(req, res, ['POST'])) return
  const body = parseRunnerHeartbeatRequest(req.body)
  if (!body) return sendVideoStudioError(res, 400, 'invalid_heartbeat')

  const runnerIdentity = videoStudioRunnerIdentity(body.runner_id)
  if (await enforceVideoStudioRateLimit(res, 'runner:heartbeat', runnerIdentity, 240, 60)) return
  const leaseTokenHash = body.lease_token
    ? createHash('sha256').update(body.lease_token).digest('hex')
    : null
  const { data, error } = await supabase.rpc('video_studio_record_heartbeat', {
    p_runner_id_hash: runnerIdentity,
    p_runner_status: body.status,
    p_software_commit: body.software_commit,
    p_command_schema_versions: body.command_schema_versions,
    p_drive_state: body.drive_state,
    p_active_command_id: body.active_command_id,
    p_pending_receipts: body.pending_receipts,
    p_occurred_at: body.occurred_at,
    p_lease_token_hash: leaseTokenHash,
    p_lease_seconds: HEARTBEAT_LEASE_SECONDS,
  })
  if (error) return sendVideoStudioError(res, 503, 'heartbeat_store_unavailable')
  const row = Array.isArray(data) ? data[0] : data
  if (!row || row.accepted !== true) return sendVideoStudioError(res, 409, 'lease_conflict')
  const leaseExpiresAt = row.lease_expires_at
    ? normalizeDatabaseTimestamp(row.lease_expires_at)
    : null
  if (row.lease_expires_at && !leaseExpiresAt) {
    return sendVideoStudioError(res, 503, 'heartbeat_store_unavailable')
  }
  return res.status(200).json({
    ok: true,
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    accepted: true,
    ...(leaseExpiresAt ? { lease_expires_at: leaseExpiresAt } : {}),
    server_time: new Date().toISOString(),
  })
}
