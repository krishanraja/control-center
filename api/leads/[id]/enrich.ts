import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { researchBrief } from '../../_enrich.js'

// POST /api/leads/:id/enrich
// Deep-enriches a lead. Prefers the Agatha Lead Deep Enrich N8N workflow when
// configured and healthy; auto-falls back to a direct (Perplexity + Claude)
// research brief when n8n is down or unset, and honours an explicit
// { mode: 'direct' } to skip n8n entirely. The direct path is additive: it writes
// the brief into raw_extraction.direct_research without touching the n8n shape.

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
  const webhook = process.env.N8N_LEAD_DEEP_ENRICH_WEBHOOK_URL

  const { data: lead, error } = await supabase
    .from('leads')
    .select('id, full_name, email, company, title, linkedin_url, source_url, why_relevant, raw_extraction')
    .eq('id', id)
    .single()
  if (error || !lead) return res.status(404).json({ ok: false, error: 'lead not found' })

  // Optimistic state flip so the UI can render a pending state either way.
  await supabase.from('leads').update({ enrichment_status: 'enriching' }).eq('id', id)

  // n8n path (unless forced direct or unconfigured); fall through to direct on failure.
  if (!forceDirect && webhook) {
    try {
      const r = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual_trigger: true, lead_id: id }),
      })
      if (r.ok) return res.status(202).json({ ok: true, queued: true, mode: 'n8n' })
      // non-200 → fall through to direct
    } catch {
      // network error → fall through to direct
    }
  }

  // Direct path.
  try {
    const { summary, sources } = await researchBrief({
      kind: 'person',
      name: lead.full_name || lead.company || '',
      company: lead.company,
      title: lead.title,
      url: lead.linkedin_url || lead.source_url,
      email: lead.email,
      extra: lead.why_relevant,
    })
    const raw = (lead.raw_extraction && typeof lead.raw_extraction === 'object') ? lead.raw_extraction : {}
    await supabase.from('leads').update({
      enrichment_status: 'enriched',
      deep_enriched_at: new Date().toISOString(),
      why_relevant: lead.why_relevant || summary,
      raw_extraction: { ...raw, direct_research: { summary, sources, at: new Date().toISOString() } },
    }).eq('id', id)
    return res.status(200).json({ ok: true, mode: 'direct', summary, sources })
  } catch (e: any) {
    await supabase.from('leads').update({ enrichment_status: 'failed' }).eq('id', id)
    return res.status(502).json({ ok: false, error: `Enrich failed: ${e?.message || String(e)}` })
  }
}
