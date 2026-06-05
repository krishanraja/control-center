import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { ventureOffer } from '../../_venturePositioning.js'

// POST /api/contacts/:id/draft-email
// Server-side proxy to the Cleo Email Draft N8N workflow for Relationship Engine
// contacts (the "Leads" tab). Loads the contact, assembles a rich, personalised
// context (who they are + how we could work together), and posts to the webhook.
// Returns {ok, draft_id, draft_url} — the draft lands in Krish's Gmail, unsent.
//
// body: {
//   intent?: 'introduction' | 'check_in' | 'podcast_invite' | 'follow_up',
//   venture?: string,   // venture slug to anchor the collaboration angle
//   note?: string,      // optional one-line instruction to weave in
//   length?: 'short' | 'standard',
//   tone?: 'warm' | 'direct',
// }

const INTENTS = new Set(['introduction', 'check_in', 'podcast_invite', 'follow_up'])
const LENGTHS = new Set(['short', 'standard'])
const TONES = new Set(['warm', 'direct'])

const LENGTH_GUIDE: Record<string, string> = {
  short: 'Keep it tight: roughly 60-90 words in the body. Two short paragraphs at most.',
  standard: 'Standard length: roughly 120-160 words in the body.',
}
const TONE_GUIDE: Record<string, string> = {
  warm: 'Tone: warm and personable, while still senior peer-to-peer.',
  direct: 'Tone: direct and economical. Get to the point fast.',
}

/** Pull a human "why this person matters" line from the enrichment dossier, if present. */
function whyRelevant(dossier: Record<string, unknown> | null | undefined): string | null {
  if (!dossier || typeof dossier !== 'object') return null
  for (const key of ['why_relevant', 'summary', 'headline', 'angle', 'one_liner']) {
    const v = (dossier as Record<string, unknown>)[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

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

  const body = (req.body || {}) as {
    intent?: string
    venture?: string
    note?: string
    length?: string
    tone?: string
  }

  const intent = typeof body.intent === 'string' && INTENTS.has(body.intent) ? body.intent : 'introduction'
  const length = typeof body.length === 'string' && LENGTHS.has(body.length) ? body.length : 'standard'
  const tone = typeof body.tone === 'string' && TONES.has(body.tone) ? body.tone : 'direct'
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 400) : ''

  const { data: contact, error } = await supabase
    .from('contacts')
    .select('id, full_name, first_name, email, company, title, primary_venture, origin_venture, origin_campaign, linkedin_url, dossier, owner_agent')
    .eq('id', id)
    .single()
  if (error || !contact) return res.status(404).json({ ok: false, error: 'contact not found' })
  if (!contact.email) return res.status(422).json({ ok: false, error: 'contact has no email address' })

  // Anchor the "how we could work together" angle on the chosen venture, falling
  // back to the contact's primary/origin venture so the picker default is sensible.
  const ventureSlug = body.venture || contact.primary_venture || contact.origin_venture || null
  const positioning = ventureOffer(ventureSlug)

  // Assemble the rich context the workflow forwards to Claude. Everything the
  // model needs to write a specific, personalised email lives here.
  const contextLines = [
    whyRelevant(contact.dossier as Record<string, unknown> | null)
      ? `Why they matter: ${whyRelevant(contact.dossier as Record<string, unknown> | null)}`
      : null,
    positioning ? `How we could work together (${positioning.label}): ${positioning.offer}` : null,
    note ? `Must weave in this specific point: ${note}` : null,
    LENGTH_GUIDE[length],
    TONE_GUIDE[tone],
  ].filter(Boolean)

  const payloadFor = (entityType: string) => ({
    entity_type: entityType,
    entity_id: contact.id,
    recipient_email: contact.email,
    recipient_name: contact.full_name || contact.first_name || contact.company || null,
    recipient_title: contact.title || null,
    recipient_company: contact.company || null,
    context: contextLines.join('\n') || null,
    linkedin_url: contact.linkedin_url || null,
    venture: ventureSlug,
    intent,
  })

  const post = (entityType: string) =>
    fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadFor(entityType)),
    })

  try {
    let r = await post('contact')
    let text = await r.text()

    // Self-healing bridge: the canonical entity_type for this surface is
    // 'contact', which the updated Cleo Email Draft workflow accepts. If the
    // LIVE workflow hasn't been redeployed with that change yet, it rejects the
    // body with a validation error before composing anything. Rather than fail
    // the user's click, fall back once to 'lead' (an accepted type) so the draft
    // still lands in Gmail. Once the workflow learns 'contact', this branch is
    // never taken and the email_drafts ledger records the correct entity_type.
    if (!r.ok && /entity_type must be/i.test(text)) {
      r = await post('lead')
      text = await r.text()
    }

    if (!r.ok) {
      return res.status(502).json({ ok: false, error: `N8N ${r.status}`, body: text.slice(0, 300) })
    }
    try {
      return res.status(200).json(JSON.parse(text))
    } catch {
      return res.status(200).json({ ok: true, raw: text })
    }
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: `N8N call failed: ${e?.message || String(e)}` })
  }
}
