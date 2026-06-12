import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

// POST /api/visibility-targets/:id/apply
// Marks a visibility target as applied, creates a follow-up task for Nova,
// writes an audit_log entry.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const idParam = req.query?.id
  const id = Array.isArray(idParam) ? idParam[0] : idParam
  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })

  const { data: target, error: getErr } = await supabase
    .from('visibility_targets')
    .select('id, name, source_url')
    .eq('id', id)
    .single()
  if (getErr || !target) return res.status(404).json({ ok: false, error: 'target not found' })

  const now = new Date().toISOString()

  const { error: updErr } = await supabase
    .from('visibility_targets')
    .update({ status: 'applied', applied_at: now })
    .eq('id', id)
  if (updErr) return res.status(500).json({ ok: false, error: updErr.message })

  await supabase.from('tasks').insert({
    title: `Follow up on visibility application: ${target.name}`,
    description: `Krish marked this target as applied on ${now}. Track response.`,
    status: 'todo',
    owner: 'nova',
    agent: 'nova',
    venture: 'mindmaker',
    workstream: 'visibility',
    link_primary: target.source_url || null,
    origin: 'user',
    created: now,
  })

  await supabase.from('audit_log').insert({
    actor: 'krish',
    event_type: 'visibility_target_applied',
    target: `visibility_target:${id}`,
    details: JSON.stringify({ target_id: id, name: target.name, applied_at: now }),
    display_message: `Marked visibility target applied: ${target.name}`,
  })

  return res.status(200).json({ ok: true, target_id: id, applied_at: now })
}
