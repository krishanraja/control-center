import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

/**
 * POST /api/triage/promote
 * body: { source_table, source_id, agent? }
 *
 * Promotes a triage item from suggestion to commitment:
 *  - content_ideas: state seeded -> researching
 *  - leads: quality_score null -> 'amber' (Apollo can re-score later) + status new -> ready
 *  - visibility_targets: status queued -> applied AND set proposed_talk={accepted:true} stub
 *  - guests: status scouted/enriched -> pitched
 *
 * Then writes a feedback_queue row with vote=1 so Vera's positive reinforcement loop sees it.
 */
const ALLOWED = new Set(['content_ideas', 'leads', 'visibility_targets', 'guests'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })
  const body = (req.body || {}) as { source_table?: string; source_id?: string; agent?: string }
  if (!body.source_table || !ALLOWED.has(body.source_table)) {
    return res.status(400).json({ ok: false, error: 'invalid source_table' })
  }
  if (!body.source_id) return res.status(400).json({ ok: false, error: 'source_id required' })

  let updatePayload: Record<string, unknown> = {}
  if (body.source_table === 'content_ideas') updatePayload = { state: 'researching' }
  if (body.source_table === 'leads') updatePayload = { status: 'ready', quality_score: 'amber' }
  if (body.source_table === 'visibility_targets') updatePayload = { status: 'applied', applied_at: new Date().toISOString() }
  if (body.source_table === 'guests') updatePayload = { status: 'pitched' }

  const { error: upErr } = await supabase
    .from(body.source_table)
    .update(updatePayload)
    .eq('id', body.source_id)
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message })

  // Positive feedback signal for Vera
  await supabase.from('feedback_queue').insert({
    source_table: body.source_table,
    source_id: body.source_id,
    agent_id: body.agent || null,
    original_agent: body.agent || null,
    original_item_id: body.source_id,
    vote: 1,
    reason_code: 'triage_promote',
    reason_text: null,
    status: 'pending',
  })

  return res.json({ ok: true, promoted: true })
}
