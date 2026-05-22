import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

/**
 * POST  /api/nell-candidates/:id/schedule        → schedules Nell outreach.
 * PATCH /api/nell-candidates/:id/schedule        → body { skipped: true } soft-skips.
 *
 * Schedule creates a tasks row for `nell` and links via scheduled_task_id.
 * Skip flips skipped_at + status='skipped' so the candidate stops surfacing.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = (req.query.id as string | undefined) || (req.url?.split('/').slice(-2, -1)[0])
  if (!id) {
    res.status(400).json({ error: 'id required' })
    return
  }

  if (req.method === 'PATCH') {
    const body = (req.body ?? {}) as { skipped?: boolean }
    if (!body.skipped) {
      res.status(400).json({ error: 'unsupported_patch' })
      return
    }
    const { error: skipErr } = await supabase
      .from('nell_candidates')
      .update({ status: 'skipped', skipped_at: new Date().toISOString() })
      .eq('id', id)
    if (skipErr) { res.status(500).json({ error: skipErr.message }); return }
    res.status(200).json({ ok: true, skipped: true })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const { data: c, error: lookupErr } = await supabase
    .from('nell_candidates')
    .select('id, name, podcast_target, signal_type, best_channel, scheduled_task_id')
    .eq('id', id)
    .maybeSingle()
  if (lookupErr || !c) {
    res.status(404).json({ error: lookupErr?.message || 'candidate_not_found' })
    return
  }
  if (c.scheduled_task_id) {
    res.status(200).json({ task_id: c.scheduled_task_id, already_scheduled: true })
    return
  }

  const podLabel =
    c.podcast_target === 'signal-and-noise' ? 'Signal & Noise' :
    c.podcast_target === 'builder-economy'  ? 'Builder Economy' :
    c.podcast_target || 'Krish’s podcast'

  const title = `Outreach: ${c.name ?? 'guest'} for ${podLabel}`
  const description = [
    c.signal_type ? `Signal: ${c.signal_type}` : null,
    c.best_channel ? `Best channel: ${c.best_channel}` : null,
  ].filter(Boolean).join('\n')

  const { data: task, error: insertErr } = await supabase
    .from('tasks')
    .insert({
      title,
      description,
      status: 'active',
      workstream: 'content',
      group_label: 'Content',
      agent: 'nell',
      owner: 'krish',
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (insertErr || !task) {
    res.status(500).json({ error: insertErr?.message || 'task_insert_failed' })
    return
  }

  const { error: patchErr } = await supabase
    .from('nell_candidates')
    .update({ scheduled_task_id: task.id, status: 'scheduled' })
    .eq('id', id)
  if (patchErr) {
    res.status(500).json({ error: patchErr.message })
    return
  }

  res.status(200).json({ task_id: task.id, already_scheduled: false })
}
