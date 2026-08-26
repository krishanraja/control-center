// Turns an arc plus its beats into the six-field card the lint and the scorer
// already expect.
//
// This is the other half of what was missing. api/_cardLint.ts could judge a
// card and api/_arcScore.ts could score one, and nothing in the system had ever
// built one, so both were dead code sitting beside a queue still being served
// by the old content_decisions path.
//
// ---------------------------------------------------------------------------
// The prompt restates the lint rules rather than relying on a retry loop
//
// Every rule in _cardLint.ts is mechanical, which means it is also statable.
// Restating them costs prompt tokens once; discovering them through failed
// compositions costs a model call per failure and still lands a worse card,
// because a model rewriting to satisfy a rule it was not told about tends to
// hollow out the sentence rather than fix it.
//
// The lint still runs afterwards and is still the authority. This is belt and
// braces on purpose: the gates exist because each one already shipped broken.
import { FORMATS, FORMAT_SPEC, type Format } from './_formats.js'
import { LENS_SPEC, type Lens, type Channel } from './_lenses.js'
import type { Card } from './_cardLint.js'

export interface ComposableArc {
  id: string
  title: string
  summary?: string | null
  implication?: string | null
  lens: Lens
  channel: Channel | null
  /** Folder question, when the arc files under one. Given as CONTEXT for what
   *  the arc is about, never as a reason to rate it higher. */
  theme_question?: string | null
  beats: Array<{ occurred_on: string; what_changed: string; source?: string | null }>
}

export interface ComposedCard extends Card { format: Format | null }

function formatMenu(): string {
  return FORMATS.map(f => {
    const s = FORMAT_SPEC[f]
    const notes = [
      `runs to ${s.outlet}`,
      s.arcOnly ? 'ONLY for presenting one beat of a running arc, never when the number is the whole piece' : null,
      s.underReview ? 'has never converted, pick it only when it is clearly the best fit' : null,
    ].filter(Boolean).join('; ')
    return `  ${f} — ${s.covers} (${notes})`
  }).join('\n')
}

export function buildComposePrompt(arc: ComposableArc) {
  const system = [
    'You write the card for a running editorial arc. Six fields, and every one has a hard rule that rejects the card mechanically if broken.',
    '',
    'VOICE. Plain English a twelve year old could follow. Short sentences. No em dashes or en dashes anywhere. Never "leverage" as a verb, never "at scale", no consultant vocabulary. Do not sound like AI, do not sound bossy, do not assume what the reader thinks.',
    '',
    'headline — the shift itself. No colon, because a colon turns it into a label plus a topic. Never date it to a week.',
    '',
    'what_changed — 2 to 4 sentences. Must contain at least one real number, named company or date drawn from the beats below. Never stack hedges.',
    '',
    'why_now — 1 or 2 sentences. What makes this the moment, not the news. This is the field that separates a shift from an event.',
    '',
    'the_opening — 1 to 3 sentences. THE HARDEST FIELD AND THE MOST REJECTED.',
    '  Show the opening, do not instruct the reader to take it. Never begin with Audit, Treat, Reassess, Stop, Establish, Secure, Prepare for, Do not wait, or any other order.',
    '  Not the imperative mood at all.',
    '  Address whoever owns revenue or position, not whoever owns risk or exposure.',
    '  It must not be satisfiable by writing a policy, a charter or a document. If someone could comply by producing paperwork, it is the wrong opening.',
    '',
    'where_this_goes — a claim about the future that could turn out wrong, with a date or a threshold in it. "This will continue" and "adoption will grow" are not claims, they are continuation. Write something you could be shown to be wrong about.',
    '',
    'reader_decision — a DECISION the reader already faces, whose inputs this changes. Phrase it as a choice: "whether to ... or ...". Never an instruction, so never "Reprice your ..." or "Build your ...".',
    '',
    'format — pick one:',
    formatMenu(),
    '',
    'If the arc cannot carry all six fields honestly from the beats given, return {"skip":"reason"} instead. A thin card is worse than no card: it reaches the queue, wastes the reading and teaches nothing.',
    '',
    'Return JSON only: {"headline":"...","what_changed":"...","why_now":"...","the_opening":"...","where_this_goes":"...","reader_decision":"...","format":"..."}',
  ].join('\n')

  const user = [
    `arc: ${arc.title}`,
    arc.summary ? `summary: ${arc.summary}` : null,
    `lens: ${arc.lens} (${LENS_SPEC[arc.lens].covers})`,
    arc.channel ? `channel: ${arc.channel}` : null,
    arc.theme_question ? `this arc files under a question already being tracked: ${arc.theme_question}` : 'this arc matches no tracked question, which is fine and changes nothing about how you write it',
    '',
    'beats, newest first. These are the only facts you may use:',
    ...arc.beats.slice(0, 12).map(b => `  ${b.occurred_on}  ${b.what_changed}${b.source ? `  [${b.source}]` : ''}`),
  ].filter(Boolean).join('\n')

  return { system, user }
}

const isFmt = (v: unknown): v is Format =>
  typeof v === 'string' && (FORMATS as readonly string[]).includes(v)

/** Null when the model declined, or when a required field came back empty.
 *  An empty field would fail lint anyway; failing here keeps the reason
 *  ("the composer skipped it") separate from ("the card was bad"). */
export function parseComposed(raw: unknown): ComposedCard | { skip: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.skip === 'string') return { skip: r.skip.slice(0, 300) }
  const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string).trim() : '')
  const card: ComposedCard = {
    headline: str('headline'),
    what_changed: str('what_changed'),
    why_now: str('why_now'),
    the_opening: str('the_opening'),
    where_this_goes: str('where_this_goes'),
    reader_decision: str('reader_decision'),
    format: isFmt(r.format) ? r.format : null,
  }
  const required: Array<keyof Card> = ['headline', 'what_changed', 'why_now', 'the_opening', 'where_this_goes', 'reader_decision']
  if (required.some(k => !card[k])) return null
  return card
}
