import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

/**
 * POST /api/triage/reject
 * body: { source_table, source_id, agent?, reason_code?, reason_text? }
 *
 * Drops the suggestion: source row -> status 'superseded' (or equivalent terminal)
 * + writes feedback_queue vote=-1 so Vera's correction loop learns the pattern.
 */
const ALLOWED = new Set(['content_ideas', 'leads', 'visibility_targets', 'guests', 'tasks'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })
  const body = (req.body || {}) as {
    source_table?: string; source_id?: string; agent?: string;
    reason_code?: string; reason_text?: string
  }
  if (!body.source_table || !ALLOWED.has(body.source_table)) {
    return res.status(400).json({ ok: false, error: 'invalid source_table' })
  }
  if (!body.source_id) return res.status(400).json({ ok: false, error: 'source_id required' })

  let updatePayload: Record<string, unknown> = {}
  if (body.source_table === 'content_ideas') updatePayload = { state: 'dropped' }
  if (body.source_table === 'leads') updatePayload = { status: 'closed_lost', quality_score: 'red' }
  if (body.source_table === 'visibility_targets') updatePayload = { status: 'dropped', rejected_at: new Date().toISOString() }
  if (body.source_table === 'guests') updatePayload = { status: 'skipped', skipped_at: new Date().toISOString() }
  if (body.source_table === 'tasks') updatePayload = { status: 'superseded', krish_reviewed: true }

  const { error: upErr } = await supabase
    .from(body.source_table)
    .update(updatePayload)
    .eq('id', body.source_id)
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message })

  await supabase.from('feedback_queue').insert({
    source_table: body.source_table,
    source_id: body.source_id,
    agent_id: body.agent || null,
    original_agent: body.agent || null,
    original_item_id: body.source_id,
    vote: -1,
    reason_code: body.reason_code || null,
    reason_text: body.reason_text || null,
    status: 'pending',
  })

  return res.json({ ok: true, rejected: true })
}
