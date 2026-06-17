import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

// POST /api/guests/:id/draft-email
// Server-side proxy to the Cleo Email Draft N8N workflow for podcast guests.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const webhook = process.env.N8N_EMAIL_DRAFT_WEBHOOK_URL
  if (!webhook) {
    return res.status(503).json({ ok: false, error: 'N8N_EMAIL_DRAFT_WEBHOOK_URL not configured' })
  }

  const idParam = req.query?.id
  const id = Array.isArray(idParam) ? idParam[0] : idParam
  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })

  // SELECT ONLY REAL COLUMNS. guests has no role/company/why_relevant columns;
  // the equivalent signal lives in one_liner / why_fit (a dead-column bug that
  // previously made this select error and 404 every guest).
  const { data: g, error } = await supabase
    .from('guests')
    .select('id, name, email, one_liner, why_fit, personal_url, twitter_handle')
    .eq('id', id)
    .single()
  if (error || !g) return res.status(404).json({ ok: false, error: 'guest not found' })
  if (!g.email) return res.status(422).json({ ok: false, error: 'guest has no email address' })

  const intent = (req.body && typeof req.body.intent === 'string') ? req.body.intent : 'podcast_invite'

  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_type: 'guest',
        entity_id: g.id,
        recipient_email: g.email,
        recipient_name: g.name || null,
        recipient_title: g.one_liner || null,
        recipient_company: null,
        context: g.why_fit || g.one_liner || null,
        intent,
      }),
    })
    const body = await r.text()
    if (!r.ok) return res.status(502).json({ ok: false, error: `N8N ${r.status}`, body: body.slice(0, 300) })
    try { return res.status(200).json(JSON.parse(body)) } catch { return res.status(200).json({ ok: true, raw: body }) }
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: `N8N call failed: ${e?.message || String(e)}` })
  }
}
