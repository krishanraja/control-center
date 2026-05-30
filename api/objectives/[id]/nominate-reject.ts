import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

// POST /api/objectives/:id/nominate-reject
// body: { reason_text? }
// Drops a Marcus-nominated objective (status -> dropped, completed_at stamped)
// and writes a feedback_queue row with reason_code=marcus_objective_nomination_rejected.
// This is the objective altitude in the three-altitude feedback model: it tells
// Marcus his cluster-detection produced a false positive, distinct from a
// daily or milestone rejection.

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const body = (req.body || {}) as { reason_text?: string | null }
  const reasonText = (body.reason_text || '').trim().slice(0, 2000) || null

  const { data, error } = await supabase
    .from('goals')
    .update({ status: 'dropped', completed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'proposed')
    .select()
    .single()

  if (error) return res.status(500).json({ ok: false, error: error.message })
  if (!data) return res.status(409).json({ ok: false, error: 'objective not in proposed state' })

  await supabase.from('feedback_queue').insert({
    source_table: 'goals',
    source_id: id,
    agent_id: 'marcus',
    original_agent: 'marcus',
    original_item_id: id,
    vote: -1,
    reason_code: 'marcus_objective_nomination_rejected',
    reason_text: reasonText,
    meta: {
      title: data.title,
      venture: data.venture,
      objective_kind: data.objective_kind,
      source: data.source,
      captured_at: new Date().toISOString(),
    },
    status: 'pending',
  })

  return res.json({ ok: true, objective: data })
}
