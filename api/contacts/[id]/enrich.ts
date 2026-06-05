import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

// POST /api/contacts/:id/enrich
// One-click, opt-in deep research for a single Relationship Engine contact.
// Queues the contact for the "Mindmaker OS | RE Dossier Engine" workflow, which
// polls for contacts where triage_status='triaged' AND enrichment_status='queued'
// AND dossier IS NULL, then runs the 5-pass dossier (Brave + Perplexity + Gmail
// private graph + two Sonnet passes) and writes it back. Nothing is enriched
// automatically — Krish picks which leads are worth the credits.

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

  const { data: contact, error } = await supabase
    .from('contacts')
    .select('id, dossier, enrichment_status')
    .eq('id', id)
    .single()
  if (error || !contact) return res.status(404).json({ ok: false, error: 'contact not found' })
  if (contact.dossier) return res.status(409).json({ ok: false, error: 'already_enriched' })

  // Mark triaged + queued so the Dossier Engine's poll picks it up. triage_status
  // must be 'triaged' to qualify for "Fetch Hot Contacts".
  const { error: upErr } = await supabase
    .from('contacts')
    .update({ enrichment_status: 'queued', triage_status: 'triaged' })
    .eq('id', id)
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message })

  return res.status(202).json({ ok: true, queued: true })
}
