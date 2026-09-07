import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardVideoStudioRunner, videoStudioRunnerIdentity } from '../../_videoStudioAuth.js'
import { supabase } from '../../_supabase.js'
import { contentRevisionHash, jsonRecord, readProductionApproval } from '../../_productionBrief.js'
import { VIDEO_STUDIO_CONTROL_SCHEMA_VERSION, sendVideoStudioError } from '../_contracts.js'
import { enforceVideoStudioRateLimit } from '../_data.js'
import {
  leaseTokenMatches,
  PRODUCTION_BRIEF_RESULT_STATUSES,
  readProductionBriefEnvelope,
} from '../_productionBriefQueue.js'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardVideoStudioRunner(req, res, ['POST'])) return
  const body = jsonRecord(req.body)
  const runnerId = text(body.runner_id)
  const contentIdeaId = text(body.content_idea_id)
  const briefId = text(body.brief_id)
  const briefHash = text(body.brief_hash)
  const leaseToken = text(body.lease_token)
  const status = text(body.status)
  const jobId = body.job_id === null || body.job_id === undefined ? null : text(body.job_id)
  const safeCode = body.safe_code === null || body.safe_code === undefined ? null : text(body.safe_code)
  if (
    body.schema_version !== VIDEO_STUDIO_CONTROL_SCHEMA_VERSION
    || !/^[a-z0-9][a-z0-9_-]{1,95}$/i.test(runnerId)
    || !/^[0-9a-f-]{36}$/i.test(contentIdeaId)
    || !/^[a-z0-9][a-z0-9_-]{1,95}$/i.test(briefId)
    || !/^[a-f0-9]{64}$/.test(briefHash)
    || leaseToken.length < 24 || leaseToken.length > 256
    || !PRODUCTION_BRIEF_RESULT_STATUSES.includes(status as typeof PRODUCTION_BRIEF_RESULT_STATUSES[number])
    || (jobId !== null && !/^[a-z0-9][a-z0-9_-]{5,80}$/i.test(jobId))
    || (safeCode !== null && !/^[a-z][a-z0-9_]{0,79}$/.test(safeCode))
    || (status === 'failed' && safeCode === null)
    || (status !== 'failed' && safeCode !== null)
  ) return sendVideoStudioError(res, 400, 'invalid_production_brief_receipt')

  const runnerIdentity = videoStudioRunnerIdentity(runnerId)
  if (await enforceVideoStudioRateLimit(res, 'runner:production-brief-complete', runnerIdentity, 60, 60)) return

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const read = await supabase.from('content_ideas')
      .select('id,idea,thesis,body,lane,lane_slot,meta,transformed_outputs,updated_at')
      .eq('id', contentIdeaId)
      .single()
    if (read.error || !read.data) return sendVideoStudioError(res, 404, 'production_brief_not_found')
    const row = read.data as { id: string; idea: string; thesis: string | null; body: string | null; lane: string | null; lane_slot: string | null; meta: unknown; transformed_outputs: unknown; updated_at: string }
    const outputs = jsonRecord(row.transformed_outputs)
    const briefs = jsonRecord(outputs.production_briefs)
    const rawEnvelope = jsonRecord(briefs[briefId])
    const envelope = readProductionBriefEnvelope(rawEnvelope)
    if (!envelope || envelope.brief_hash !== briefHash) return sendVideoStudioError(res, 409, 'production_brief_conflict')
    if (envelope.status === status && envelope.completed_at) {
      if ((envelope.job_id || null) !== jobId || (envelope.safe_code || null) !== safeCode) {
        return sendVideoStudioError(res, 409, 'production_brief_receipt_conflict')
      }
      return res.status(200).json({ ok: true, schema_version: 1, duplicate: true, brief_id: briefId, status, job_id: envelope.job_id || null })
    }
    const approval = readProductionApproval(jsonRecord(row.meta).production_approval)
    const currentRevisionHash = contentRevisionHash(row)
    if (!approval || approval.content_revision_hash !== currentRevisionHash || envelope.brief.content_revision_hash !== currentRevisionHash) {
      return sendVideoStudioError(res, 409, 'production_brief_revision_retired')
    }
    if (
      envelope.status !== 'leased'
      || !envelope.lease
      || envelope.lease.runner_id_hash !== runnerIdentity
      || !leaseTokenMatches(envelope.lease.token_hash, leaseToken)
      || Date.parse(envelope.lease.expires_at) <= Date.now()
    ) return sendVideoStudioError(res, 409, 'production_brief_lease_conflict')

    const { lease: _lease, ...withoutLease } = rawEnvelope
    const completedAt = new Date().toISOString()
    const nextEnvelope = {
      ...withoutLease,
      brief: envelope.brief,
      brief_hash: envelope.brief_hash,
      status,
      completed_at: completedAt,
      ...(jobId ? { job_id: jobId } : {}),
      ...(safeCode ? { safe_code: safeCode } : {}),
    }
    const nextOutputs = { ...outputs, production_briefs: { ...briefs, [briefId]: nextEnvelope } }
    const write = await supabase.from('content_ideas')
      .update({ transformed_outputs: nextOutputs, updated_at: completedAt })
      .eq('id', contentIdeaId)
      .eq('updated_at', row.updated_at)
      .select('id')
    if (write.error) return sendVideoStudioError(res, 503, 'production_brief_store_unavailable')
    if ((write.data || []).length === 1) {
      return res.status(200).json({ ok: true, schema_version: 1, duplicate: false, brief_id: briefId, status, job_id: jobId })
    }
  }

  return sendVideoStudioError(res, 409, 'production_brief_changed_retry')
}
