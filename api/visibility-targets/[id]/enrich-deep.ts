import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { researchBrief } from '../../_enrich.js'

// POST /api/visibility-targets/:id/enrich-deep
// Deep-enriches a visibility target. Prefers Nova's Visibility Deep Enrich N8N
// workflow when configured and healthy; auto-falls back to a direct (Perplexity +
// Claude) research brief when n8n is down or unset, and honours { mode: 'direct' }
// to skip n8n. The direct path is additive: writes raw_data.direct_research and
// fills why_relevant only when empty.

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
  const webhook = process.env.N8N_VISIBILITY_DEEP_ENRICH_WEBHOOK_URL

  const { data: target, error } = await supabase
    .from('visibility_targets')
    .select('id, title, source_url, event_url, why_relevant, raw_data')
    .eq('id', id)
    .single()
  if (error || !target) return res.status(404).json({ ok: false, error: 'target not found' })

  // n8n path (unless forced direct or unconfigured); fall through to direct on failure.
  if (!forceDirect && webhook) {
    try {
      const r = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: target.id, title: target.title, source_url: target.source_url }),
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
      kind: 'event',
      name: target.title || '',
      url: target.source_url || target.event_url,
      extra: target.why_relevant,
    })
    const raw = (target.raw_data && typeof target.raw_data === 'object') ? target.raw_data : {}
    await supabase.from('visibility_targets').update({
      deep_enriched_at: new Date().toISOString(),
      why_relevant: target.why_relevant || summary,
      raw_data: { ...raw, direct_research: { summary, sources, at: new Date().toISOString() } },
    }).eq('id', id)
    return res.status(200).json({ ok: true, mode: 'direct', summary, sources })
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: `Enrich failed: ${e?.message || String(e)}` })
  }
}
