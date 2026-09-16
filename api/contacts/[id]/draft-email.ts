import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { ventureOffer } from '../../_venturePositioning.js'
import { loadOutboundVoice } from '../../_voice.js'
import { deliverEmailDraft } from '../../_emailDraft.js'
import { guard } from '../../_auth.js'

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

// The retired labels carry their status into the prompt so a draft against a
// historical contact cannot read as an active pitch. ventureOffer() also returns
// null for them, so there is no offer line to anchor on.
const VENTURE_LABEL: Record<string, string> = {
  mindmake: 'Mindmake', publication: 'Publication', mm_ctrl: 'CTRL',
  fractionl_circle: 'Fractionl Circle', fractionl_pulse: 'Fractionl Pulse',
  full_time: 'Full Time', investor: 'Investor',
  meliora: 'Meliora (retired)', adfixus: 'AdFixus (retired)',
  signal_noise: 'Signal & Noise (retired as a venture)',
  builder_economy: 'Builder Economy (retired)', mymu: 'MYMU (retired)',
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
interface IntelRow {
  who: string | null
  why_them: string | null
  hook: string | null
  risk: string | null
  headline: string | null
  summary: string | null
  current_title: string | null
  current_company: string | null
  network_tier: string | null
  intent_stance: string | null
  intent_evidence: string | null
  intent_evidence_url: string | null
  last_post_at: string | null
  completeness: number | null
  intel_method: string | null
}

/**
 * Ground the draft in the enrichment spine (ADR-022).
 *
 * `summary` and `headline` are deliberately capped out of `intel_doc` by
 * migration 20260915250000 so the ranker is not swamped by them, on the
 * stated grounds that "the sheet and the judgment model can read it". This
 * is the judgment model. It could not read it until now.
 *
 * `grounded` is true only when the row carries a real judgment or a real
 * profile, so it can stand in for the dossier's `enriched` flag rather than
 * merely suppressing the honesty warning: a row that exists but says nothing
 * still gets the "do not invent specifics" instruction.
 */
function researchFromIntelligence(intel: IntelRow | null): { lines: string[]; grounded: boolean } {
  if (!intel) return { lines: [], grounded: false }
  const role = [intel.current_title, intel.current_company].filter(Boolean).join(' at ')
  const lines: string[] = []
  if (intel.headline) lines.push(`THEIR OWN HEADLINE: ${intel.headline}`)
  if (role) lines.push(`CURRENT ROLE, from their profile: ${role}`)
  if (intel.who) lines.push(`WHO THEY ARE: ${intel.who}`)
  if (intel.why_them) lines.push(`WHY THEM: ${intel.why_them}`)
  if (intel.hook) lines.push(`THE HOOK: ${intel.hook}`)
  if (intel.risk) lines.push(`WHAT TO AVOID: ${intel.risk}`)
  if (intel.summary) lines.push(`FROM THEIR PROFILE, in their words: ${intel.summary.slice(0, 900)}`)
  if (intel.network_tier) lines.push(`RELATIONSHIP: ${intel.network_tier.replace(/[_\d]/g, ' ').trim()}`)

  // Cited or silent, the same standard the pilots lane holds. The quote is
  // only offered as a reason to write while the ranker still counts it.
  const quote = (intel.intent_evidence || '').trim()
  const url = (intel.intent_evidence_url || '').trim()
  const at = intel.last_post_at ? new Date(intel.last_post_at).getTime() : NaN
  const live = Number.isFinite(at) && Date.now() - at <= 90 * 86_400_000
  if (quote && /^https?:\/\//i.test(url) && live) {
    lines.push(`THEY PUBLISHED THIS RECENTLY (refer to it plainly, do not go beyond it): ${quote} Source: ${url}`)
    if (intent_stanceIsUseful(intel.intent_stance)) {
      lines.push(`WHERE THEY ARE ON IT: ${intel.intent_stance}`)
    }
  }

  const grounded = Boolean(intel.who || intel.why_them || intel.headline || intel.summary)
  return { lines, grounded }
}

/** "selling" and "commenting" say nothing worth putting in front of the
 *  model; the tiers above them are a real read on where someone stands. */
function intent_stanceIsUseful(stance: string | null): boolean {
  return Boolean(stance) && !['selling', 'commenting'].includes(String(stance))
}

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
  if (guard(req, res, ['POST'])) return

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const idParam = req.query?.id
  const id = Array.isArray(idParam) ? idParam[0] : idParam
  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })

  const body = (req.body || {}) as {
    intent?: string
    venture?: string
    note?: string
    length?: string
    tone?: string
    mode?: string
  }
  const forceDirect = body.mode === 'direct'

  const intent = typeof body.intent === 'string' && INTENTS.has(body.intent) ? body.intent : 'introduction'
  const length = typeof body.length === 'string' && LENGTHS.has(body.length) ? body.length : 'standard'
  const tone = typeof body.tone === 'string' && TONES.has(body.tone) ? body.tone : 'direct'
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 400) : ''

  // Load the contact and Krish's canonical voice in parallel. The voice is the
  // full krish-voice skill (system_config.content_voice_block) — the same block
  // the content composer grounds in — so the email matches every other outbound
  // surface instead of a thin summary.
  // contact_intelligence is read alongside, not instead of, the contacts row.
  // The dossier jsonb was the only grounding this route had, and it predates
  // the enrichment spine: the judgment layer (who / why_them / hook / risk),
  // the bought LinkedIn profile (headline, summary, current title and company)
  // and the intent quote all live on contact_intelligence and were invisible
  // here, so a contact with a complete profile could still be drafted against
  // "NO DEEP RESEARCH ON FILE". Same join pattern as api/network/explain.ts.
  const [{ data: contact, error }, { data: intel }, voiceRules] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, full_name, first_name, email, company, title, primary_venture, origin_venture, origin_campaign, tags, linkedin_url, dossier, owner_agent')
      .eq('id', id)
      .single(),
    supabase
      .from('contact_intelligence')
      .select('who, why_them, hook, risk, headline, summary, current_title, current_company, network_tier, intent_stance, intent_evidence, intent_evidence_url, last_post_at, completeness, intel_method')
      .eq('contact_id', id)
      .maybeSingle(),
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
  const { lines: intelLines, grounded } = researchFromIntelligence(intel as IntelRow | null)

  // Assemble the context the workflow forwards to Claude. Real research first,
  // then the collaboration angle, the note, and length/tone. When the contact is
  // NOT enriched we say so explicitly so the model stays honest instead of
  // fabricating an observation.
  const tagLine = Array.isArray(contact.tags) && contact.tags.length
    ? `Tags/provenance: ${contact.tags.slice(0, 8).join(', ')}`
    : (contact.origin_campaign ? `Came in via: ${contact.origin_campaign}` : null)

  const contextLines = [
    ...research,
    ...intelLines,
    !enriched && !grounded
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

  try {
    // length/tone/note are already baked into contextLines for this route.
    const result = await deliverEmailDraft(payloadFor('contact'), { forceDirect })
    return res.status(200).json({ ok: true, ...result })
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: `Draft failed: ${e?.message || String(e)}` })
  }
}
