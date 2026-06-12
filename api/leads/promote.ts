import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

/**
 * POST /api/leads/promote
 * body: { lead_id: string }
 *
 * Promotes a lead into a tasks row owned by lead.assignee_agent, then links
 * the lead via leads.promoted_task_id and bumps status to 'conversation'.
 *
 * Idempotent: if the lead already has promoted_task_id, returns the existing
 * task without creating a duplicate.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const { lead_id } = (req.body ?? {}) as { lead_id?: string }
  if (!lead_id) {
    res.status(400).json({ error: 'lead_id required' })
    return
  }

  const { data: lead, error: lookupErr } = await supabase
    .from('leads')
    .select('id, full_name, company, title, assignee_agent, why_relevant, next_step, promoted_task_id')
    .eq('id', lead_id)
    .maybeSingle()
  if (lookupErr || !lead) {
    res.status(404).json({ error: lookupErr?.message || 'lead_not_found' })
    return
  }

  if (lead.promoted_task_id) {
    res.status(200).json({ task_id: lead.promoted_task_id, already_promoted: true })
    return
  }

  const agent = lead.assignee_agent || 'felix'
  const subject = [lead.full_name, lead.company].filter(Boolean).join(' · ') || 'Unnamed lead'
  const title = `Opportunity: ${subject}`
  const description = [
    lead.why_relevant ? `Why: ${lead.why_relevant}` : null,
    lead.next_step ? `Next: ${lead.next_step}` : null,
  ].filter(Boolean).join('\n\n')

  const { data: task, error: insertErr } = await supabase
    .from('tasks')
    .insert({
      title,
      description,
      status: 'active',
      workstream: 'advisory_sales',
      group_label: 'Leads',
      agent,
      owner: 'krish',
      link_primary: null,
      origin: 'user',
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (insertErr || !task) {
    res.status(500).json({ error: insertErr?.message || 'task_insert_failed' })
    return
  }

  const { error: patchErr } = await supabase
    .from('leads')
    .update({
      promoted_task_id: task.id,
      status: 'conversation',
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead_id)
  if (patchErr) {
    res.status(500).json({ error: patchErr.message })
    return
  }

  res.status(200).json({ task_id: task.id, already_promoted: false })
}
