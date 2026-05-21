import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// PR 3 of os-rebuild: approve a pending Vera correction.
//
// POST /api/corrections/approve
//   body: { correction_id: string }
//
// On approve:
//   1. Append proposed_brief_edit to agents.brief_content
//   2. Mark consumed_feedback_ids rows in feedback_queue as status='consumed'
//   3. Update corrections: approval_state='approved', approved_at=NOW()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const { correction_id } = (req.body || {}) as { correction_id?: string }
  if (!correction_id) return res.status(400).json({ ok: false, error: 'correction_id required' })

  const { data: correction, error: fetchErr } = await supabase
    .from('corrections')
    .select('id, agent_id, proposed_brief_edit, consumed_feedback_ids, approval_state')
    .eq('id', correction_id)
    .single()
  if (fetchErr || !correction) return res.status(404).json({ ok: false, error: fetchErr?.message || 'correction not found' })
  if (correction.approval_state !== 'pending') {
    return res.status(409).json({ ok: false, error: `correction already ${correction.approval_state}` })
  }
  if (!correction.proposed_brief_edit) {
    return res.status(400).json({ ok: false, error: 'correction has no proposed_brief_edit' })
  }

  const { data: agent, error: agentErr } = await supabase
    .from('agents')
    .select('id, brief_content')
    .eq('id', correction.agent_id)
    .single()
  if (agentErr || !agent) return res.status(404).json({ ok: false, error: agentErr?.message || 'agent not found' })

  const updatedBrief = (agent.brief_content || '') + '\n\n' + correction.proposed_brief_edit
  const { error: briefErr } = await supabase
    .from('agents')
    .update({ brief_content: updatedBrief })
    .eq('id', correction.agent_id)
  if (briefErr) return res.status(500).json({ ok: false, error: `brief update failed: ${briefErr.message}` })

  const consumedIds = Array.isArray(correction.consumed_feedback_ids) ? correction.consumed_feedback_ids : []
  if (consumedIds.length > 0) {
    const { error: fqErr } = await supabase
      .from('feedback_queue')
      .update({ status: 'consumed' })
      .in('id', consumedIds)
    if (fqErr) {
      console.warn('feedback_queue consume failed:', fqErr.message)
    }
  }

  const { error: corrErr } = await supabase
    .from('corrections')
    .update({ approval_state: 'approved', approved_at: new Date().toISOString() })
    .eq('id', correction_id)
  if (corrErr) return res.status(500).json({ ok: false, error: `correction update failed: ${corrErr.message}` })

  return res.json({ ok: true, correction_id, agent_id: correction.agent_id, feedback_consumed: consumedIds.length })
}
