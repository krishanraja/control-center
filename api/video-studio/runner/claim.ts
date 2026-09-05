import { createHash, randomBytes } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardVideoStudioRunner, videoStudioRunnerIdentity } from '../../_videoStudioAuth.js'
import { supabase } from '../../_supabase.js'
import { VIDEO_STUDIO_CONTROL_SCHEMA_VERSION, sendVideoStudioError } from '../_contracts.js'
import { enforceVideoStudioRateLimit, stablePayloadHash } from '../_data.js'
import {
  parseRunnerClaimRequest,
  normalizeDatabaseTimestamp,
  projectClaimedCommand,
  runnerCommandHashInputV1,
  type RunnerCommandHashInputV1,
} from '../_runnerContracts.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioRunner(req, res, ['POST'])) return
  const body = parseRunnerClaimRequest(req.body)
  if (!body) return sendVideoStudioError(res, 400, 'invalid_claim_request')

  const runnerIdentity = videoStudioRunnerIdentity(body.runner_id)
  if (await enforceVideoStudioRateLimit(res, 'runner:claim', runnerIdentity, 120, 60)) return

  const leaseToken = randomBytes(32).toString('base64url')
  const leaseTokenHash = createHash('sha256').update(leaseToken).digest('hex')
  const { data, error } = await supabase.rpc('video_studio_claim_command', {
    p_runner_id_hash: runnerIdentity,
    p_lease_token_hash: leaseTokenHash,
    p_lease_seconds: body.lease_seconds,
  })
  if (error) return sendVideoStudioError(res, 503, 'command_store_unavailable')

  const raw = Array.isArray(data) ? data[0] : data
  if (!raw) {
    return res.status(200).json({
      ok: true,
      schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
      command: null,
    })
  }
  const command = projectClaimedCommand(raw)
  const leaseExpiresAt = normalizeDatabaseTimestamp(raw.lease_expires_at)
  if (!command || !leaseExpiresAt || stablePayloadHash(command.payload) !== command.payload_hash) {
    return sendVideoStudioError(res, 503, 'malformed_command_projection')
  }
  const expectedCommandHash = stablePayloadHash(
    runnerCommandHashInputV1(command as unknown as RunnerCommandHashInputV1),
  )
  if (expectedCommandHash !== command.command_hash) {
    return sendVideoStudioError(res, 503, 'malformed_command_projection')
  }
  return res.status(200).json({
    ok: true,
    schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
    command,
    lease: {
      token: leaseToken,
      expires_at: leaseExpiresAt,
    },
  })
}
