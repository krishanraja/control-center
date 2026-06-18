import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { loadOutboundVoice } from '../../_voice.js'

// POST /api/customers/:id/draft-email
// Server-side proxy to the Cleo Email Draft N8N workflow for customers.

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

  const { data: c, error } = await supabase
    .from('customers')
    .select('id, full_name, email, product, plan, mrr_usd, source, signed_up_at, became_paid_at')
    .eq('id', id)
    .single()
  if (error || !c) return res.status(404).json({ ok: false, error: 'customer not found' })
  if (!c.email) return res.status(422).json({ ok: false, error: 'customer has no email address' })

  const intent = (req.body && typeof req.body.intent === 'string') ? req.body.intent : 'check_in'

  // Ground the draft in the full krish-voice (content_voice_block), same as every
  // other outbound surface.
  const voiceRules = await loadOutboundVoice()

  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_type: 'customer',
        entity_id: c.id,
        recipient_email: c.email,
        recipient_name: c.full_name || null,
        context: `Product: ${c.product || ''} · Plan: ${c.plan || ''} · MRR: $${c.mrr_usd || 0}/mo · Source: ${c.source || ''}`,
        voice_rules: voiceRules || null,
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
