import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { ventureOffer } from '../../_venturePositioning.js'
import { loadOutboundVoice } from '../../_voice.js'

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
  short: 'LENGTH: keep it tight — 60-90 words in the body, two short paragraphs at most.',
  standard: 'LENGTH: 90-120 words in the body (hard cap 120, per the voice rules).',
}
const TONE_GUIDE: Record<string, string> = {
  warm: 'TONE: warm and personable, while still senior peer-to-peer.',
  direct: 'TONE: direct and economical. Get to the point fast.',
}

const VENTURE_LABEL: Record<string, string> = {
  mindmaker: 'Mindmaker', meliora: 'Meliora', adfixus: 'AdFixus', signal_noise: 'Signal & Noise',
  builder_economy: 'Builder Economy', fractionl: 'Fractionl', investor: 'Investor',
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s)
const stripTags = (s: string): string => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

/**
 * Turn the "RE Dossier Engine v1" dossier into a grounded research brief the
 * model can actually write from. The dossier has five passes; the load-bearing
 * ones for outreach are pass5 (who_they_are / shared_history / the_one_move),
 * pass4 (per-venture opening_wedge + why_this_person), and pass2 (public voice).
 * Returns null when the contact has no usable dossier so the caller can stay
 * honest rather than inventing specifics.
 */
function researchFromDossier(dossier: any, ventureSlug: string | null): { lines: string[]; enriched: boolean } {
  const lines: string[] = []
  if (!dossier || typeof dossier !== 'object') return { lines, enriched: false }

  const p5 = dossier.pass5_meeting_weapon || {}
  const who = str(p5.who_they_are)
  const history = str(p5.shared_history)
  const oneMove = str(p5.the_one_move)
  if (who) lines.push(`WHO THEY ARE: ${clip(who, 700)}`)

  // Shared history is the single most important signal — never cold-open someone
  // you have already met. Fall back to the private-graph thread count.
  const threads = dossier.pass3_private_graph?.email_threads
  if (history) lines.push(`SHARED HISTORY (acknowledge this — do NOT cold-open): ${clip(history, 600)}`)
  else if (Array.isArray(threads) && threads.length) {
    lines.push(`SHARED HISTORY: there is prior email/calendar contact on record — open as a continuation, not a cold intro.`)
  }

  // Per-venture angle for the chosen venture, if the dossier worked it out.
  const label = ventureSlug ? VENTURE_LABEL[ventureSlug] : null
  const angles = dossier.pass4_cross_venture?.per_venture_angle
  if (label && Array.isArray(angles)) {
    const match = angles.find((a: any) => str(a.venture).toLowerCase().includes(label.toLowerCase().split(' ')[0]))
    if (match) {
      if (str(match.opening_wedge)) lines.push(`OPENING WEDGE (${label}, use as strategy — do not quote verbatim): ${clip(str(match.opening_wedge), 500)}`)
      if (str(match.why_this_person)) lines.push(`WHY THEM, FOR ${label.toUpperCase()}: ${clip(str(match.why_this_person), 500)}`)
    }
  }
  if (oneMove) lines.push(`STRATEGIC ANGLE: ${clip(oneMove, 500)}`)

  const voice = str(dossier.pass2_public_voice)
  if (voice) lines.push(`WHAT THEY CARE ABOUT PUBLICLY (for a specific hook): ${clip(stripTags(voice), 700)}`)

  // A few resolved facts the model may cite — labelled so it knows these are the
  // only sanctioned specifics.
  const resolve = dossier.pass1_resolve
  if (Array.isArray(resolve) && resolve.length) {
    const facts = resolve.slice(0, 3)
      .map((r: any) => `- ${stripTags(str(r.title))}: ${clip(stripTags(str(r.description)), 220)}`)
      .filter((l: string) => l.length > 4)
    if (facts.length) lines.push(`SANCTIONED FACTS (cite only these specifics):\n${facts.join('\n')}`)
  }

  return { lines, enriched: lines.length > 0 }
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

  // Load the contact and Krish's canonical voice in parallel. The voice is the
  // full krish-voice skill (system_config.content_voice_block) — the same block
  // the content composer grounds in — so the email matches every other outbound
  // surface instead of a thin summary.
  const [{ data: contact, error }, voiceRules] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, full_name, first_name, email, company, title, primary_venture, origin_venture, origin_campaign, tags, linkedin_url, dossier, owner_agent')
      .eq('id', id)
      .single(),
    loadOutboundVoice(),
  ])
  if (error || !contact) return res.status(404).json({ ok: false, error: 'contact not found' })
  if (!contact.email) return res.status(422).json({ ok: false, error: 'contact has no email address' })

  // Anchor the "how we could work together" angle on the chosen venture, falling
  // back to the contact's primary/origin venture so the picker default is sensible.
  const ventureSlug = body.venture || contact.primary_venture || contact.origin_venture || null
  const positioning = ventureOffer(ventureSlug)

  // Pull the grounded research brief out of the dossier (the real differentiator
  // between a specific email and generic filler).
  const { lines: research, enriched } = researchFromDossier(contact.dossier, ventureSlug)

  // Assemble the context the workflow forwards to Claude. Real research first,
  // then the collaboration angle, the note, and length/tone. When the contact is
  // NOT enriched we say so explicitly so the model stays honest instead of
  // fabricating an observation.
  const tagLine = Array.isArray(contact.tags) && contact.tags.length
    ? `Tags/provenance: ${contact.tags.slice(0, 8).join(', ')}`
    : (contact.origin_campaign ? `Came in via: ${contact.origin_campaign}` : null)

  const contextLines = [
    ...research,
    !enriched
      ? 'NO DEEP RESEARCH ON FILE: do not invent specifics about them or their company. Open with the genuine reason for reaching out and the value/ask; keep any claim about them general and true.'
      : null,
    tagLine,
    positioning ? `HOW WE COULD WORK TOGETHER (${positioning.label}): ${positioning.offer}` : null,
    note ? `MUST WEAVE IN: ${note}` : null,
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
    voice_rules: voiceRules || null,
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
