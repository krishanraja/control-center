import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

/*
 * POST /api/skill-proposals/approve
 * body: { skill_proposal_id: string | number }
 *
 * Generative learning loop, approval-to-write path. Agent scope only (Phase 1).
 * On approve:
 *   1. Append the induced skill as a delimited "Learned play" block to the
 *      target agent's agents.brief_content. The existing render pipeline turns
 *      brief_content into skills/agent-{id}/SKILL.md every 15 min, so this is
 *      the same write target the corrective loop uses. No new skill store.
 *   2. Mark the skill_proposals row status='completed' with attribution.
 *   3. Log a learning_events row (event_type=skill_induction, classification=applied)
 *      so the loop is bidirectional, not only corrective.
 *   4. Write audit_log.
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
    .select('id, scope, target_agent_id, skill_title, skill_body, pattern_key, evidence_refs, evidence_count, status')
    .eq('id', id)
    .single()
  if (fetchErr || !sp) return res.status(404).json({ ok: false, error: fetchErr?.message || 'not found' })
  if (sp.status !== 'proposed') return res.status(409).json({ ok: false, error: `skill proposal already ${sp.status}` })
  if (sp.scope !== 'agent' || !sp.target_agent_id) {
    return res.status(400).json({ ok: false, error: 'only agent-scope proposals can be approved in Phase 1' })
  }
  if (!sp.skill_body) return res.status(400).json({ ok: false, error: 'proposal has no skill_body' })

  // 1. Append the induced skill as a delimited, retireable block to the brief.
  const { data: agent, error: agentErr } = await supabase
    .from('agents')
    .select('brief_content')
    .eq('id', sp.target_agent_id)
    .single()
  if (agentErr || !agent) return res.status(404).json({ ok: false, error: `agent ${sp.target_agent_id} not found` })

  const block = [
    '',
    '',
    `<!-- induced-skill id=${sp.id} pattern=${sp.pattern_key} -->`,
    `## Learned play: ${sp.skill_title}`,
    '',
    sp.skill_body,
    `<!-- /induced-skill id=${sp.id} -->`,
  ].join('\n')
  const nowIso = new Date().toISOString()

  // Idempotency: if a retry already appended this skill's block (status flip
  // can fail after the brief write, since these are separate non-atomic writes),
  // skip the append so the play is not duplicated in the brief.
  const alreadyAppended = (agent.brief_content || '').includes(`induced-skill id=${sp.id} `)
  if (!alreadyAppended) {
    const updatedBrief = (agent.brief_content || '') + block
    const { error: briefErr } = await supabase
      .from('agents')
      .update({ brief_content: updatedBrief, brief_updated_at: nowIso })
      .eq('id', sp.target_agent_id)
    if (briefErr) return res.status(500).json({ ok: false, error: briefErr.message })
  }

  // 2. Mark the proposal completed with full attribution.
  const writtenRef = `agents.brief_content#induced-skill-${sp.id}`
  const { error: spErr } = await supabase
    .from('skill_proposals')
    .update({
      status: 'completed',
      approved_by: 'krish',
      approved_at: nowIso,
      executed_at: nowIso,
      completed_at: nowIso,
      written_ref: writtenRef,
    })
    .eq('id', sp.id)
  if (spErr) return res.status(500).json({ ok: false, error: spErr.message })

  // 3. Generative learning event (best-effort, non-blocking).
  const { error: leErr } = await supabase
    .from('learning_events')
    .insert({
      event_type: 'win',
      source: 'manual',
      agent_id: sp.target_agent_id,
      artifact_type: 'brief',
      classification: 'win_pattern',
      pattern_text: sp.skill_title,
      evidence: {
        pattern_key: sp.pattern_key,
        evidence_refs: sp.evidence_refs,
        evidence_count: sp.evidence_count,
        skill_proposal_id: sp.id,
      },
      recommended_target: 'agents.brief_content',
      proposed_change_text: sp.skill_body,
      status: 'applied',
      proposed_by: 'vera',
      applied_at: nowIso,
      applied_by: 'krish',
      notes: `skill_induction: approved skill_proposal ${sp.id} via Vera success sweep`,
    })
  if (leErr) console.warn('[skill-proposals/approve] learning_events insert failed:', leErr.message)

  // 4. Audit (best-effort, non-blocking).
  const { error: logErr } = await supabase
    .from('audit_log')
    .insert({
      event_type: 'krish_approve_skill_proposal',
      actor: 'krish',
      target: String(sp.id),
      display_message: `Krish approved induced skill "${sp.skill_title}" for ${sp.target_agent_id} via Control Center`,
      details: JSON.stringify({
        skill_proposal_id: sp.id,
        agent_id: sp.target_agent_id,
        pattern_key: sp.pattern_key,
        written_ref: writtenRef,
      }),
    })
  if (logErr) console.warn('[skill-proposals/approve] audit_log insert failed:', logErr.message)

  return res.json({ ok: true, skill_proposal_id: sp.id, agent_id: sp.target_agent_id, written_ref: writtenRef })
}
