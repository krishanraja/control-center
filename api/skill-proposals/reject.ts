import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

/*
 * POST /api/skill-proposals/reject
 * body: { skill_proposal_id: string | number }
 *
 * Sets status='rejected'. The underlying win evidence is untouched, so a
 * stronger pattern can be re-proposed by a later Vera sweep.
 * Idempotent: a proposal must be status='proposed', else 409.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as { skill_proposal_id?: string | number; id?: string | number }
  const id = body.skill_proposal_id ?? body.id
  if (id == null) return res.status(400).json({ ok: false, error: 'skill_proposal_id required' })

  const { data: sp, error: fetchErr } = await supabase
    .from('skill_proposals')
    .select('id, status, skill_title, target_agent_id')
    .eq('id', id)
    .single()
  if (fetchErr || !sp) return res.status(404).json({ ok: false, error: fetchErr?.message || 'not found' })
  if (sp.status !== 'proposed') return res.status(409).json({ ok: false, error: `skill proposal already ${sp.status}` })

  const nowIso = new Date().toISOString()
  const { error: spErr } = await supabase
    .from('skill_proposals')
    .update({ status: 'rejected', rejected_at: nowIso })
    .eq('id', sp.id)
  if (spErr) return res.status(500).json({ ok: false, error: spErr.message })

  const { error: logErr } = await supabase
    .from('audit_log')
    .insert({
      event_type: 'krish_reject_skill_proposal',
      actor: 'krish',
      target: String(sp.id),
      display_message: `Krish rejected induced skill "${sp.skill_title}" for ${sp.target_agent_id} via Control Center`,
      details: JSON.stringify({ skill_proposal_id: sp.id, agent_id: sp.target_agent_id }),
    })
  if (logErr) console.warn('[skill-proposals/reject] audit_log insert failed:', logErr.message)

  return res.json({ ok: true, skill_proposal_id: sp.id })
}
