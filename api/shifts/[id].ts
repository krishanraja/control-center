import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { preamble, pathId } from '../_content.js'

// PATCH /api/shifts/:id   body: { action, merge_into?, note? }
//
// Krish's rulings on the register (the shift_proposal / shift_fading decision
// cards, spec §5). Actions:
//   accept        proposed -> active
//   dismiss       proposed -> deleted (a proposal Krish rejects never lingers)
//   merge         proposed's evidence moves into merge_into, proposal deleted
//   retire        active/fading -> retired (settled verdict, keeps its dossier)
//   library       retired/fading -> library (tap-anytime evergreen)
//   keep_watching fading -> active
// Every ruling lands in shifts.decision and resolves the matching pending
// content_decisions row, so the queue and the register never disagree.

const ACTIONS = new Set(['accept', 'dismiss', 'merge', 'retire', 'library', 'keep_watching'])

async function refreshTotals(shiftId: string) {
  const { data } = await supabase.from('shift_evidence')
    .select('occurred_on, source').eq('shift_id', shiftId).limit(5000)
  const rows = data || []
  await supabase.from('shifts').update({
    story_count: rows.length,
    day_span_total: new Set(rows.map(r => r.occurred_on)).size,
    source_count_total: new Set(rows.map(r => (r.source || 'unknown').toLowerCase())).size,
  }).eq('id', shiftId)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'PATCH, OPTIONS')) return
  if (req.method !== 'PATCH') return res.status(405).json({ ok: false, error: 'PATCH only' })
  const id = pathId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const b = (req.body || {}) as { action?: string; merge_into?: string; note?: string }
  if (!b.action || !ACTIONS.has(b.action)) return res.status(400).json({ ok: false, error: 'bad action' })

  const { data: shift, error } = await supabase.from('shifts').select('id, status, title').eq('id', id).single()
  if (error || !shift) return res.status(404).json({ ok: false, error: 'shift not found' })

  const nowIso = new Date().toISOString()
  const decision = { action: b.action, at: nowIso, note: b.note || null }
  let outcome = ''

  if (b.action === 'accept') {
    await supabase.from('shifts').update({ status: 'active', decision }).eq('id', id)
    outcome = 'active'
  } else if (b.action === 'keep_watching') {
    await supabase.from('shifts').update({ status: 'active', decision }).eq('id', id)
    outcome = 'active'
  } else if (b.action === 'retire') {
    await supabase.from('shifts').update({ status: 'retired', decision }).eq('id', id)
    outcome = 'retired'
  } else if (b.action === 'library') {
    await supabase.from('shifts').update({ status: 'library', decision }).eq('id', id)
    outcome = 'library'
  } else if (b.action === 'dismiss') {
    await supabase.from('content_ideas').update({ shift_id: null }).eq('shift_id', id)
    await supabase.from('shifts').delete().eq('id', id)
    outcome = 'deleted'
  } else if (b.action === 'merge') {
    const target = b.merge_into
    if (!target || target === id) return res.status(400).json({ ok: false, error: 'merge_into required' })
    const { data: tgt } = await supabase.from('shifts').select('id').eq('id', target).single()
    if (!tgt) return res.status(404).json({ ok: false, error: 'merge target not found' })
    // Move evidence + feed links, then drop the proposal. The unique evidence
    // index may collide on duplicates; move row-by-row, ignoring collisions.
    const { data: ev } = await supabase.from('shift_evidence').select('*').eq('shift_id', id).limit(5000)
    for (const e of ev || []) {
      await supabase.from('shift_evidence').upsert(
        { ...e, id: undefined, shift_id: target },
        { onConflict: 'shift_id,occurred_on,headline', ignoreDuplicates: true },
      )
    }
    await supabase.from('shift_evidence').delete().eq('shift_id', id)
    await supabase.from('content_ideas').update({ shift_id: target }).eq('shift_id', id)

    // Beats follow their evidence. Collisions on (shift_id, occurred_on,
    // origin_key) are expected when both arcs already carried the same origin,
    // and are the reason this is a per-row upsert rather than one update.
    const { data: beats } = await supabase.from('shift_beats').select('*').eq('shift_id', id).limit(5000)
    for (const bt of beats || []) {
      await supabase.from('shift_beats').upsert(
        { ...bt, id: undefined, shift_id: target },
        { onConflict: 'shift_id,occurred_on,origin_key', ignoreDuplicates: true },
      )
    }
    await supabase.from('shift_beats').delete().eq('shift_id', id)

    // KEEP the source arc. "Merging must be reversible and logged" (final
    // brief, section 1). Deleting it made a wrong merge unrecoverable and threw
    // away the record of what was folded into what, which is the same fault as
    // deleting a decayed arc instead of resolving it. The row is marked instead,
    // and every reader excludes superseded_by is not null.
    const { data: tgtRow } = await supabase.from('shifts').select('supersedes').eq('id', target).single()
    const already: string[] = Array.isArray(tgtRow?.supersedes) ? tgtRow!.supersedes : []
    await supabase.from('shifts')
      .update({ supersedes: Array.from(new Set([...already, id])) })
      .eq('id', target)
    await supabase.from('shifts')
      .update({ superseded_by: target, merged_at: nowIso, arc_state: 'resolved', decision })
      .eq('id', id)

    await refreshTotals(target)
    outcome = `merged into ${target}`
  }

  await supabase.from('content_decisions')
    .update({ status: 'done', resolved_at: nowIso, resolution: decision })
    .eq('ref', id).eq('status', 'pending').in('kind', ['shift_proposal', 'shift_fading'])

  await supabase.from('audit_log').insert({
    event_type: 'shift_ruling',
    actor: 'krish',
    details: { shift_id: id, title: shift.title, ...decision, outcome },
  })

  return res.json({ ok: true, action: b.action, outcome })
}
