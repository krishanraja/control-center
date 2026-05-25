import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

// POST /api/leads/:id/enrich
// Proxies to the Agatha Lead Deep Enrich N8N workflow. Optimistically sets
// enrichment_status='enriching' so the UI can render a pending state.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const webhook = process.env.N8N_LEAD_DEEP_ENRICH_WEBHOOK_URL
  if (!webhook) {
    return res.status(503).json({ ok: false, error: 'N8N_LEAD_DEEP_ENRICH_WEBHOOK_URL not configured' })
  }

  const idParam = req.query?.id
  const id = Array.isArray(idParam) ? idParam[0] : idParam
  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })

  await supabase.from('leads').update({ enrichment_status: 'enriching' }).eq('id', id)

  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: id }),
    })
    const body = await r.text()
    if (!r.ok) {
      await supabase.from('leads').update({ enrichment_status: 'failed' }).eq('id', id)
      return res.status(502).json({ ok: false, error: `N8N ${r.status}`, body: body.slice(0, 300) })
    }
    return res.status(202).json({ ok: true, queued: true })
  } catch (e: any) {
    await supabase.from('leads').update({ enrichment_status: 'failed' }).eq('id', id)
    return res.status(502).json({ ok: false, error: `N8N call failed: ${e?.message || String(e)}` })
  }
}
