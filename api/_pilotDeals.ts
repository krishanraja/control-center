import { supabase } from './_supabase.js'
import { webResearch } from './_enrich.js'
import { callClaude } from './_content.js'
import { missionBlock, faceBlock, DOOR } from './_mission.js'
import { loadOutboundVoice } from './_voice.js'
import { deliverEmailDraft } from './_emailDraft.js'

// Pilots, job 1 (docs/plans/one-swing/CHARTER.md): the shared logic behind
// api/pilot-deals/*. The list of named leaders who fit the face, the live trigger
// that makes this week the week to write, and the draft in Krish's voice.
//
// Two standards are enforced by what this file can and cannot do:
//
//   Cited or silent. findTrigger never returns a signal without a source URL.
//   When the research comes back with no citation the caller stores nulls and
//   the draft opens on the relationship instead, saying so on its face.
//
//   Approval walls. This module imports deliverEmailDraft, which can land a
//   Gmail DRAFT, and nothing that can send. No route under api/pilot-deals/* imports
//   the send function in api/_google.ts. Krish sends.

export const STATES = [
  'listed', 'drafted', 'sent', 'replied', 'call_booked', 'call_taken',
  'pilot_booked', 'pilot_paid', 'not_now',
] as const

export type PilotState = typeof STATES[number]

/** The ladder. Each state names the states it may move to. not_now is the one
 *  side exit and the only way back to listed. */
export const NEXT: Record<PilotState, readonly PilotState[]> = {
  listed: ['drafted', 'not_now'],
  drafted: ['sent', 'listed', 'not_now'],
  sent: ['replied', 'not_now'],
  replied: ['call_booked', 'not_now'],
  call_booked: ['call_taken', 'not_now'],
  call_taken: ['pilot_booked', 'not_now'],
  pilot_booked: ['pilot_paid', 'not_now'],
  pilot_paid: [],
  not_now: ['listed'],
}

export function isState(v: unknown): v is PilotState {
  return typeof v === 'string' && (STATES as readonly string[]).includes(v)
}

export function canMove(from: PilotState, to: PilotState): boolean {
  return NEXT[from].includes(to)
}

/** The timestamp column a state stamps when it is entered. */
export function stampFor(state: PilotState): string {
  return `${state}_at`
}

export const CONTACT_COLUMNS = 'id, full_name, first_name, email, company, title, linkedin_url'

export interface PilotContact {
  id: string
  full_name: string | null
  first_name: string | null
  email: string | null
  company: string | null
  title: string | null
  linkedin_url: string | null
}

export interface PilotDeal {
  id: string
  contact_id: string
  why_face: string
  trigger_signal: string | null
  trigger_source_url: string | null
  trigger_found_at: string | null
  draft_subject: string | null
  draft_body: string | null
  draft_url: string | null
  drafted_at: string | null
  state: PilotState
  listed_at: string
  sent_at: string | null
  replied_at: string | null
  call_booked_at: string | null
  call_taken_at: string | null
  pilot_booked_at: string | null
  pilot_paid_at: string | null
  not_now_at: string | null
  cash_gbp: number | null
  sourced_by: 'krish' | 'os'
  notes: string | null
  created_at: string
  updated_at: string
  /** What the enrichment knew when this person was listed. Carried onto the
   *  deal at accept time rather than joined at read time, so the evidence
   *  that justified the decision cannot be silently rewritten later.
   *  Migration 20260916110000. */
  intent_score: number | null
  intent_stance: string | null
  intent_evidence: string | null
  intent_evidence_url: string | null
  intent_topics: string[] | null
  last_post_at: string | null
  followers: number | null
  is_influencer: boolean | null
  is_creator: boolean | null
  completeness: number | null
  contact: PilotContact | null
}

/** The select that joins the contact fields onto every row. */
export const TARGET_SELECT = `*, contact:contacts(${CONTACT_COLUMNS})`

export interface Trigger {
  signal: string
  url: string
  found_at: string
}

const HTTP = /^https?:\/\/\S+$/i

/** Em dashes are a house copy standard, and a model quoting a press release
 *  will produce them. Replaced rather than merely discouraged. */
function plainCopy(s: string): string {
  return s.replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/\s+/g, ' ').trim()
}

function firstSentence(text: string): string {
  const cleaned = plainCopy(text.replace(/\[\d+\]/g, '').replace(/^[#*\s-]+/, ''))
  const m = cleaned.match(/^.+?[.!?](?=\s|$)/)
  return (m ? m[0] : cleaned).trim()
}

/** The one citation marker in a sentence, if the research used [n] markers. */
function citedIndex(text: string): number | null {
  const m = text.match(/\[(\d+)\]/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isInteger(n) && n >= 1 ? n - 1 : null
}

const NOTHING = /\b(no (recent|relevant|significant|notable|public)|nothing (found|recent|notable)|could not find|unable to find|did not find|no news|none found)\b/i

/** The stored intent a deal carries, as much of it as a trigger needs. */
export interface StoredIntent {
  intent_evidence: string | null
  intent_evidence_url: string | null
  last_post_at: string | null
}

/**
 * The same 90-day cliff public.intent_live_score applies, in TypeScript.
 *
 * Duplicating the number would be the bug this codebase keeps catching, so
 * it is named once here and pointed at the SQL definition. Past the cliff the
 * ranker scores the person zero, and a quote the ranker no longer counts must
 * not be shown to Krish as a reason to write this week.
 */
const INTENT_LIVE_DAYS = 90

function triggerFromIntent(stored: StoredIntent | null | undefined): Trigger | null {
  if (!stored) return null
  const signal = plainCopy(stored.intent_evidence || '')
  const url = (stored.intent_evidence_url || '').trim()
  const at = stored.last_post_at
  if (!signal || !HTTP.test(url) || !at) return null
  const age = Date.now() - new Date(at).getTime()
  if (!Number.isFinite(age) || age > INTENT_LIVE_DAYS * 86_400_000) return null
  return { signal: signal.slice(0, 300), url, found_at: at }
}

/**
 * Find one live signal about this person's business from the last 60 days:
 * funding, a leadership change, layoffs, an AI move, results.
 *
 * Returns null whenever there is no source URL to cite. That is the contract:
 * the caller stores nulls and the draft says "no live trigger found" rather
 * than opening on invented news.
 */
export async function findTrigger(
  contact: PilotContact,
  stored?: StoredIntent | null,
): Promise<Trigger | null> {
  // What we already hold beats what we would pay to find out. The intent
  // pipeline stores a verbatim sentence, checked against its source before
  // storage, with the URL and the date it was published. That is a trigger
  // by this function's own definition, and it cost money in September.
  // Reading it here is not a shortcut around the cited-or-silent contract:
  // the same two conditions apply, a sentence and an http source, plus the
  // 90-day freshness cliff the ranker uses, so a stale quote falls through
  // to research rather than being presented as news.
  const fromStore = triggerFromIntent(stored)
  if (fromStore) return fromStore

  const name = (contact.full_name || '').trim()
  const company = (contact.company || '').trim()
  if (!name && !company) return null

  const who = [name, contact.title, company ? `at ${company}` : ''].filter(Boolean).join(', ')
  const query = [
    `News from the last 60 days about ${who}${company ? ` and about ${company}` : ''}.`,
    'Only these kinds of signal: funding or investment, a leadership change, layoffs or restructuring, a public AI move, financial results.',
    'For each fact give the date and the source URL. Lead with the single most recent, most material fact in one sentence.',
    'If there is nothing from the last 60 days, say "nothing found" and stop. Never guess.',
  ].join(' ')

  let research: { text: string; sources: string[] }
  try {
    research = await webResearch(query)
  } catch {
    return null
  }
  const text = (research.text || '').trim()
  const sources = (research.sources || []).map(s => String(s || '').trim()).filter(s => HTTP.test(s))
  if (!text || !sources.length) return null
  if (NOTHING.test(text.slice(0, 200))) return null

  // The first source is the strongest match to the lead sentence. A [n]
  // marker in that sentence names a specific one, so it wins when present.
  const lead = text.split(/\n+/).map(l => l.trim()).find(l => l.length > 20) || text
  const idx = citedIndex(lead)
  const url = (idx !== null && sources[idx]) ? sources[idx] : sources[0]

  let signal = firstSentence(lead)
  const usable = signal.length >= 40 && signal.length <= 240
  if (!usable) {
    // Compress only when the research did not already lead with one clean
    // sentence. Without a key this throws, and the fallback is a trimmed lead.
    try {
      const out = await callClaude({
        agent: 'pilot-trigger',
        system: [
          'You compress research notes about a named business leader into ONE plain sentence.',
          'The sentence states one concrete fact from the last 60 days: funding, a leadership change, layoffs, an AI move, or results. Include the month.',
          'Plain British English a twelve year old can follow. No em dashes. No markdown. No preamble.',
          'If the notes contain no such fact from the last 60 days, reply with the single word NONE.',
        ].join('\n'),
        user: `NOTES:\n${text.slice(0, 4000)}`,
        maxTokens: 120,
        temperature: 0,
        timeoutMs: 20_000,
      })
      const one = plainCopy(out.replace(/\[\d+\]/g, '')).trim()
      if (!one || /^none\b/i.test(one)) return null
      signal = firstSentence(one)
    } catch {
      signal = plainCopy(signal).slice(0, 240)
    }
  }
  if (!signal) return null

  return { signal: signal.slice(0, 300), url, found_at: new Date().toISOString() }
}

export const NO_TRIGGER_LINE = 'NO LIVE TRIGGER FOUND: open on the relationship, do not invent news.'

export interface Draft {
  subject: string
  body: string
  draft_url: string | null
}

/**
 * Draft the approach. Builds the context from the mission and the face, why
 * this person fits, the trigger (or the honest line that there is none) and
 * the door in one line, then hands it to the shared draft layer in direct
 * mode so the body comes back and a Gmail draft lands when Google is set up.
 */
export async function draftApproach(
  target: Pick<PilotDeal, 'id' | 'why_face'>,
  contact: PilotContact,
  trigger: Trigger | null,
): Promise<Draft> {
  const voice = await loadOutboundVoice().catch(() => '')
  const context = [
    missionBlock(),
    '',
    faceBlock(),
    '',
    `WHY THIS PERSON FITS THE FACE: ${plainCopy(target.why_face)}`,
    '',
    trigger
      ? `WHY NOW (the reason for writing this week; refer to it plainly and do not go beyond it): ${trigger.signal} Source: ${trigger.url}`
      : NO_TRIGGER_LINE,
    '',
    `THE DOOR, in one line: ${DOOR}`,
    '',
    'RULES: this is a warm note to someone Krish already knows. Ask for one short call. Do not pitch, do not attach, do not promise. Call what is being sold a pilot, never a room. Nothing in this draft is sent by the machine.',
  ].join('\n')

  const out = await deliverEmailDraft({
    entity_type: 'pilot_deal',
    entity_id: target.id,
    recipient_email: (contact.email || '').trim(),
    recipient_name: contact.full_name,
    recipient_title: contact.title,
    recipient_company: contact.company,
    context,
    voice_rules: voice || null,
    linkedin_url: contact.linkedin_url,
    source_url: trigger?.url || null,
    intent: 'pilot_invitation',
    length: 'short',
  }, { forceDirect: true })

  return {
    subject: plainCopy(out.subject || ''),
    body: (out.body || '').replace(/\s*[\u2014\u2013]\s*/g, ', ').trim(),
    draft_url: out.draft_url || null,
  }
}

export async function loadTarget(id: string): Promise<PilotDeal | null> {
  const { data, error } = await supabase
    .from('pilot_deals')
    .select(TARGET_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as unknown as PilotDeal) || null
}

/**
 * Trigger, then draft, then write the row as drafted. Shared by the manual
 * "Draft it" route and the Monday run. Throws on a missing contact or a
 * failed write so the caller can report it; never writes a partial row.
 */
export async function draftTarget(target: PilotDeal): Promise<PilotDeal> {
  if (!target.contact) throw new Error('target has no contact')
  const trigger = await findTrigger(target.contact, target)
  const draft = await draftApproach(target, target.contact, trigger)
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('pilot_deals')
    .update({
      trigger_signal: trigger?.signal ?? null,
      trigger_source_url: trigger?.url ?? null,
      trigger_found_at: trigger?.found_at ?? null,
      draft_subject: draft.subject || null,
      draft_body: draft.body || null,
      draft_url: draft.draft_url,
      drafted_at: now,
      state: 'drafted',
    })
    .eq('id', target.id)
    .select(TARGET_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as PilotDeal
}
