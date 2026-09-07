import { randomBytes } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardVideoStudioRunner, videoStudioRunnerIdentity } from '../../_videoStudioAuth.js'
import { supabase } from '../../_supabase.js'
import { contentRevisionHash, jsonRecord, readProductionApproval } from '../../_productionBrief.js'
import { VIDEO_STUDIO_CONTROL_SCHEMA_VERSION, sendVideoStudioError } from '../_contracts.js'
import { enforceVideoStudioRateLimit } from '../_data.js'
import {
  hashLeaseToken,
  productionBriefCanBeClaimed,
  readProductionBriefEnvelope,
} from '../_productionBriefQueue.js'
import { parseRunnerClaimRequest } from '../_runnerContracts.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioRunner(req, res, ['POST'])) return
  const body = parseRunnerClaimRequest(req.body)
  if (!body) return sendVideoStudioError(res, 400, 'invalid_claim_request')

  const runnerIdentity = videoStudioRunnerIdentity(body.runner_id)
  if (await enforceVideoStudioRateLimit(res, 'runner:production-brief-claim', runnerIdentity, 60, 60)) return

  const read = await supabase.from('content_ideas')
    .select('id,idea,thesis,body,lane,lane_slot,meta,transformed_outputs,updated_at')
    .not('transformed_outputs->production_briefs', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(100)
  if (read.error) return sendVideoStudioError(res, 503, 'production_brief_store_unavailable')

  const now = new Date()
  for (const rawRow of read.data || []) {
    const row = rawRow as { id: string; idea: string; thesis: string | null; body: string | null; lane: string | null; lane_slot: string | null; meta: unknown; transformed_outputs: unknown; updated_at: string }
    const outputs = jsonRecord(row.transformed_outputs)
    const briefs = jsonRecord(outputs.production_briefs)
    const approval = readProductionApproval(jsonRecord(row.meta).production_approval)
    const currentRevisionHash = contentRevisionHash(row)
    for (const [briefId, rawEnvelope] of Object.entries(briefs)) {
      const envelope = readProductionBriefEnvelope(rawEnvelope)
      if (!envelope || envelope.brief.brief_id !== briefId || envelope.brief.content_idea_id !== row.id) continue
      if (!approval || approval.content_revision_hash !== currentRevisionHash || envelope.brief.content_revision_hash !== currentRevisionHash) continue
      if (!productionBriefCanBeClaimed(envelope, now)) continue

      const leaseToken = randomBytes(32).toString('base64url')
      const claimedAt = now.toISOString()
      const expiresAt = new Date(now.getTime() + body.lease_seconds * 1000).toISOString()
      const nextEnvelope = {
        ...jsonRecord(rawEnvelope),
        brief: envelope.brief,
        brief_hash: envelope.brief_hash,
        status: 'leased',
        lease: {
          runner_id_hash: runnerIdentity,
          token_hash: hashLeaseToken(leaseToken),
          software_commit: body.software_commit,
          claimed_at: claimedAt,
          expires_at: expiresAt,
        },
      }
      const nextOutputs = {
        ...outputs,
        production_briefs: { ...briefs, [briefId]: nextEnvelope },
      }
      const updatedAt = new Date().toISOString()
      const write = await supabase.from('content_ideas')
        .update({ transformed_outputs: nextOutputs, updated_at: updatedAt })
        .eq('id', row.id)
        .eq('updated_at', row.updated_at)
        .select('id')
      if (write.error) return sendVideoStudioError(res, 503, 'production_brief_store_unavailable')
      if ((write.data || []).length !== 1) continue
      return res.status(200).json({
        ok: true,
        schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION,
        item: {
          content_idea_id: row.id,
          brief: envelope.brief,
          brief_hash: envelope.brief_hash,
          lease: { token: leaseToken, expires_at: expiresAt },
        },
      })
    }
  }

  return res.status(200).json({ ok: true, schema_version: VIDEO_STUDIO_CONTROL_SCHEMA_VERSION, item: null })
}
