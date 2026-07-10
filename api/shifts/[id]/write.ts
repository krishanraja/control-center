import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { preamble, sanitizeVoice } from '../../_content.js'

// POST /api/shifts/:id/write
//
// "Write from this shift" (spec §5, mockup pin 9): opens a Composer piece
// seeded with the dossier. Creates one evergreen content_ideas row whose
// materials are the shift's dated evidence, so every generation grounds in
// the receipts. Returns the new idea id for the deep link.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  const id = ((req.query.id || '') as string).trim()
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const { data: shift, error } = await supabase.from('shifts').select('*').eq('id', id).single()
  if (error || !shift) return res.status(404).json({ ok: false, error: 'shift not found' })

  const { data: evidence } = await supabase
    .from('shift_evidence')
    .select('occurred_on, headline, source, url, provenance')
    .eq('shift_id', id)
    .order('occurred_on', { ascending: false })
    .limit(60)

  const dossier = (evidence || [])
    .map(e => `- ${e.occurred_on} · ${e.headline} (${e.source || 'unknown'}${e.url ? `, ${e.url}` : ''}) [${e.provenance}]`)
    .join('\n')

  const materials = [{
    kind: 'note',
    title: `Shift dossier: ${shift.title}`,
    url: null,
    content: `SUMMARY: ${shift.summary}\n\nIMPLICATION: ${shift.implication}\n\nEVIDENCE (dated, provenance-labeled):\n${dossier}`,
    added_at: new Date().toISOString(),
  }]

  const { data: idea, error: insErr } = await supabase
    .from('content_ideas')
    .insert({
      idea: sanitizeVoice(shift.title),
      thesis: sanitizeVoice(shift.summary),
      source_type: 'manual',
      source_ref: `shift:${shift.slug}`,
      source_snippet: sanitizeVoice(shift.implication),
      source_captured_at: new Date().toISOString(),
      state: 'drafting',
      origin: 'user',
      horizon: 'evergreen',
      shift_id: id,
      meta: { materials, shift_seed: { id, slug: shift.slug, title: shift.title } },
    })
    .select('id')
    .single()
  if (insErr || !idea) return res.status(500).json({ ok: false, error: insErr?.message || 'insert failed' })

  return res.json({ ok: true, idea_id: idea.id })
}
