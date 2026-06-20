import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { researchBrief } from '../../_enrich.js'

// POST /api/contacts/:id/enrich
// One-click, opt-in deep research for a single Relationship Engine contact.
// Default path queues the contact for the "Mindmaker OS | RE Dossier Engine"
// workflow (5-pass dossier). With { mode: 'direct' } it instead builds a research
// brief directly (Perplexity + Claude) and writes a minimal, dossier-compatible
// shape so outreach drafting still has grounding when n8n is unavailable.
// Nothing is enriched automatically — Krish picks which leads are worth it.

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

  const forceDirect = !!(req.body && req.body.mode === 'direct')

  const { data: contact, error } = await supabase
    .from('contacts')
    .select('id, dossier, enrichment_status, full_name, first_name, email, company, title, linkedin_url')
    .eq('id', id)
    .single()
  if (error || !contact) return res.status(404).json({ ok: false, error: 'contact not found' })
  if (contact.dossier) return res.status(409).json({ ok: false, error: 'already_enriched' })

  // Direct path — build the brief now and write a dossier-compatible shape that
  // outreach drafting's researchFromDossier() can read (pass5.who_they_are).
  if (forceDirect) {
    await supabase.from('contacts').update({ enrichment_status: 'enriching' }).eq('id', id)
    try {
      const { summary, sources } = await researchBrief({
        kind: 'person',
        name: contact.full_name || contact.first_name || '',
        company: contact.company,
        title: contact.title,
        url: contact.linkedin_url,
        email: contact.email,
      })
      const dossier = {
        pass5_meeting_weapon: { who_they_are: summary },
        _direct: { sources, at: new Date().toISOString() },
      }
      await supabase.from('contacts').update({
        enrichment_status: 'enriched',
        deep_enriched_at: new Date().toISOString(),
        dossier,
      }).eq('id', id)
      return res.status(200).json({ ok: true, mode: 'direct', summary, sources })
    } catch (e: any) {
      await supabase.from('contacts').update({ enrichment_status: 'failed' }).eq('id', id)
      return res.status(502).json({ ok: false, error: `Enrich failed: ${e?.message || String(e)}` })
    }
  }

  // Default: queue for the Dossier Engine poll. triage_status must be 'triaged'
  // to qualify for "Fetch Hot Contacts".
  const { error: upErr } = await supabase
    .from('contacts')
    .update({ enrichment_status: 'queued', triage_status: 'triaged' })
    .eq('id', id)
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message })

  return res.status(202).json({ ok: true, queued: true, mode: 'n8n' })
}
