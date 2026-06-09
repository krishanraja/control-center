import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

// POST /api/leads/:id/draft-email
// Server-side proxy to the Cleo Email Draft N8N workflow.
// Loads lead context, posts to webhook, returns {ok, draft_id, draft_url}.

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

  const { data: lead, error } = await supabase
    .from('leads')
    .select('id, full_name, email, company, title, why_relevant, linkedin_url, source_url')
    .eq('id', id)
    .single()
  if (error || !lead) return res.status(404).json({ ok: false, error: 'lead not found' })
  if (!lead.email) return res.status(422).json({ ok: false, error: 'lead has no email address' })

  const reqBody = (req.body || {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const intent = str(reqBody.intent) || 'introduction'
  // Framing controls forwarded from OutreachDraftSheet (Services + Leads tabs
  // now share the same sheet). The Cleo Email Draft workflow already reads these
  // from the contacts path; forwarding them here makes the chips real instead of
  // silently dropped.
  const venture = str(reqBody.venture)
  const length = str(reqBody.length)
  const tone = str(reqBody.tone)
  const note = str(reqBody.note)

  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_type: 'lead',
        entity_id: lead.id,
        recipient_email: lead.email,
        recipient_name: lead.full_name || lead.company || null,
        recipient_title: lead.title || null,
        recipient_company: lead.company || null,
        context: lead.why_relevant || null,
        linkedin_url: lead.linkedin_url || null,
        source_url: lead.source_url || null,
        intent,
        venture,
        length,
        tone,
        note,
      }),
    })
    const body = await r.text()
    if (!r.ok) {
      return res.status(502).json({ ok: false, error: `N8N ${r.status}`, body: body.slice(0, 300) })
    }
    try {
      return res.status(200).json(JSON.parse(body))
    } catch {
      return res.status(200).json({ ok: true, raw: body })
    }
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: `N8N call failed: ${e?.message || String(e)}` })
  }
}
