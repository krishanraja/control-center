import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

// POST /api/visibility-targets/:id/enrich-deep
// Fires Nova's Visibility Deep Enrich N8N workflow for a single target.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const webhook = process.env.N8N_VISIBILITY_DEEP_ENRICH_WEBHOOK_URL
  if (!webhook) {
    return res.status(503).json({ ok: false, error: 'N8N_VISIBILITY_DEEP_ENRICH_WEBHOOK_URL not configured' })
  }

  const idParam = req.query?.id
  const id = Array.isArray(idParam) ? idParam[0] : idParam
  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })

  const { data: target, error } = await supabase
    .from('visibility_targets')
    .select('id, name, source_url, raw_data')
    .eq('id', id)
    .single()
  if (error || !target) return res.status(404).json({ ok: false, error: 'target not found' })

  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_id: target.id, name: target.name, source_url: target.source_url }),
    })
    const body = await r.text()
    if (!r.ok) return res.status(502).json({ ok: false, error: `N8N ${r.status}`, body: body.slice(0, 300) })
    return res.status(202).json({ ok: true, queued: true })
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: `N8N call failed: ${e?.message || String(e)}` })
  }
}
