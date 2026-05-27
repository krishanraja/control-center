import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

// PR 3 of os-rebuild: thumbs-up/down feedback endpoint.
//
// POST /api/feedback
//   body: { source_table, source_id, agent_id?, vote: 1 | -1, reason_code?, reason_text?, meta? }
//
// Writes to feedback_queue. Vera's weekly audit (PR 5 cron) consumes
// unconsumed rows where vote=-1 with the same (agent_id, reason_code)
// and proposes a corrections row when count >= 3.
//
// `meta` is optional structured context. For marcus_priority_override
// (Phase 0 of the focus brief) the swap UI on Home posts an override of
// one of Marcus's top_three picks and packs the original pick + Krish's
// replacement into meta so Vera's aggregation has the full pattern.

const ALLOWED_TABLES = new Set([
  'leads',
  'content_ideas',
  'nova_target_conferences',
  'visibility_targets',
  'guests',
  'tasks',
  'customers',
  'bets',
  'opportunities',
  'corrections',
  'home_intelligence',
])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as {
    source_table?: string
    source_id?: string
    agent_id?: string | null
    vote?: number
    reason_code?: string | null
    reason_text?: string | null
    meta?: Record<string, unknown> | null
  }

  if (!body.source_table || !ALLOWED_TABLES.has(body.source_table)) {
    return res.status(400).json({ ok: false, error: 'invalid source_table' })
  }
  if (!body.source_id) {
    return res.status(400).json({ ok: false, error: 'source_id required' })
  }
  if (body.vote !== 1 && body.vote !== -1) {
    return res.status(400).json({ ok: false, error: 'vote must be 1 or -1' })
  }
  if (body.meta != null && (typeof body.meta !== 'object' || Array.isArray(body.meta))) {
    return res.status(400).json({ ok: false, error: 'meta must be an object' })
  }

  const { data, error } = await supabase
    .from('feedback_queue')
    .insert({
      source_table: body.source_table,
      source_id: body.source_id,
      agent_id: body.agent_id || null,
      original_agent: body.agent_id || null,
      original_item_id: body.source_id,
      vote: body.vote,
      reason_code: body.reason_code || null,
      reason_text: body.reason_text || null,
      meta: body.meta || {},
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    return res.status(500).json({ ok: false, error: error.message })
  }
  return res.json({ ok: true, feedback: data })
}
