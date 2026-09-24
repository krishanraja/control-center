// _eventScore — who is actually in the room, on two axes.
//
// The model judges five densities 0-100 and names attendees. Every number that
// reaches the events table is computed here, in TypeScript, per architecture
// rule 15.5: numbers are computed, never LLM-emitted. The model judges fit;
// code does math. api/_icpScore.ts is the same contract for people.
//
// WHY THE AXES CHANGED (Krish, 2026-09-24 — docs/DECISIONS/024)
//
// docs/MINDMAKE_OS_ARCHITECTURE.md section 3 defined Draw as "technical-leader
// density, where Krish wants to be", justified by podcast guest supply: every
// technical leader in a room is a potential Signal & Noise guest. That
// definition worked as specified and produced exactly what it asked for. On
// 2026-09-24 the top of the attend lane was London PyTorch #28, LLMday NYC, AWS
// AI In Practice #7, an Agentic AI workshop and a model-wrangling hackathon.
//
// His actual ask: "I want to meet successful entrepreneurs and those running
// successful businesses, not AI developers or adtech people."
//
// So Draw is re-pointed at PEER density: founders, owners and CEOs running
// businesses with real revenue. Practitioner density flips from the thing Draw
// measured to a penalty. Guest supply survives as a bounded bonus, because it
// was a real benefit and only ever went wrong when it steered the whole lane.
//
// WHAT "NOT ADTECH PEOPLE" IS READ AS, AND WHAT IT IS NOT
//
// api/_mission.ts locks FACE as "leaders of PE and VC backed media, adtech and
// data businesses Krish already knows" and DOOR as the paid pilot sold to them.
// Those people are his BUYERS. Scoring them down would aim the attend lane away
// from the one thing being sold this quarter, so Demand keeps rewarding them.
// The instruction is read as three narrower things:
//
//   1. adtech JOURNALISTS are not events. They were 46 of the 56 rows in the
//      lane labelled Events, because that lane read visibility_targets. They now
//      live under Speaking & Press, where they belong.
//   2. VENDOR-hosted rooms are full of people selling, not people owning, so
//      vendor density is a penalty on both axes.
//   3. PRACTITIONER rooms are penalised hard.
//
// A retail media summit whose room is CMOs and P&L owners still ranks. A retail
// media summit whose room is martech vendors does not. That distinction is the
// whole point of splitting vendor density from buyer density.

import { callClaude, robustJson } from './_content.js'
import { missionBlock } from './_mission.js'
import { SYNTHESIS_MODEL } from './_models.js'

/** Bumped when any weight below changes, and written to events.score_version so
 *  a corpus scored under two regimes is visible rather than silently mixed. */
export const SCORE_VERSION = 1

export interface EventScoreInput {
  title: string
  host?: string | null
  host_kind?: string | null
  description?: string | null
  url?: string | null
  city?: string | null
  venue?: string | null
  cost_kind?: string | null
  ticket_price_usd?: number | null
  starts_at?: string | null
  /** Text pulled from the event or host page, when discovery captured any. */
  page_context?: string | null
}

/** What the model is allowed to return. Everything else is computed. */
export interface EventJudgment {
  peer_density: number
  buyer_density: number
  practitioner_density: number
  vendor_density: number
  seniority: number
  seniority_note: string
  named_attendees: string[]
  score_reason: string
}

export interface EventScoreResult extends EventJudgment {
  draw_score: number
  demand_score: number
  score_version: number
}

/**
 * The weights, in one place so a disagreement about the mix is a one-line edit
 * and not an archaeology exercise.
 *
 * Read them as sentences:
 *   Draw   = mostly who else in the room runs a business, partly how senior the
 *            room is, minus hard for a room of practitioners, minus for a room
 *            of sellers.
 *   Demand = mostly who in the room could buy a pilot, partly seniority, minus
 *            for practitioners (they do not hold the budget) and only lightly
 *            for vendors (a vendor's room still contains its customers).
 *
 * The practitioner penalty is heavier on Draw than on Demand on purpose. A room
 * of engineers is not a room of peers under any reading. It might still contain
 * someone who could buy, so Demand is dented rather than erased.
 */
export const WEIGHTS = {
  draw: { peer: 0.70, seniority: 0.30, practitioner: -0.40, vendor: -0.20 },
  demand: { buyer: 0.70, seniority: 0.30, practitioner: -0.25, vendor: -0.10 },
} as const

/** A named attendee who clears the peer bar is worth a few points on Draw:
 *  a real name is the only hard evidence of who is in a room, and it is what
 *  turns "away" into "away, named attendee" in events_for(). Bounded, because
 *  one good name does not make a room. */
export const NAMED_ATTENDEE_BONUS = 6
export const NAMED_ATTENDEE_BONUS_CAP = 12
/** Below this, a named attendee is not evidence of a peer room. */
const PEER_BAR_FOR_BONUS = 50

export function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

/**
 * Draw and Demand from the five densities. Pure, so the guard and a replay over
 * the existing corpus can call it without a model or a network.
 */
export function computeAxes(j: {
  peer_density: number
  buyer_density: number
  practitioner_density: number
  vendor_density: number
  seniority: number
  named_attendees?: string[] | null
}): { draw_score: number; demand_score: number } {
  const peer = clamp(j.peer_density)
  const buyer = clamp(j.buyer_density)
  const prac = clamp(j.practitioner_density)
  const vend = clamp(j.vendor_density)
  const sen = clamp(j.seniority)

  const w = WEIGHTS
  let draw = peer * w.draw.peer + sen * w.draw.seniority + prac * w.draw.practitioner + vend * w.draw.vendor
  const demand = buyer * w.demand.buyer + sen * w.demand.seniority + prac * w.demand.practitioner + vend * w.demand.vendor

  // The bonus rides on Draw only, and only where the room already reads as peers.
  const names = (j.named_attendees || []).filter(n => typeof n === 'string' && n.trim())
  if (names.length && peer >= PEER_BAR_FOR_BONUS) {
    draw += Math.min(NAMED_ATTENDEE_BONUS_CAP, names.length * NAMED_ATTENDEE_BONUS)
  }

  return { draw_score: clamp(draw), demand_score: clamp(demand) }
}

const SYSTEM = [
  missionBlock(),
  '',
  'YOUR JOB',
  'You are judging whether a room is worth an evening of Krish\'s time. You are not',
  'judging the topic, the brand, or how good the event sounds. You are judging WHO IS',
  'IN THE ROOM. A brilliant talk in front of the wrong people scores low; a dull',
  'evening full of the right people scores high.',
  '',
  'Return ONLY a JSON object, no prose and no code fences:',
  '{ "peer_density": 0-100, "buyer_density": 0-100, "practitioner_density": 0-100,',
  '  "vendor_density": 0-100, "seniority": 0-100, "seniority_note": string,',
  '  "named_attendees": string[], "score_reason": string }',
  '',
  'THE FIVE DIMENSIONS',
  '',
  'peer_density — what share of the room are founders, owners, CEOs or MDs actually',
  'running a business with real revenue. People he can learn from and swap notes with',
  'as an equal. An accelerator full of pre-revenue idea-stage founders is LOW: the',
  'word is successful. A members\' organisation with a revenue floor is HIGH. A paid',
  'general networking mixer that advertises "founders and investors" with no bar is',
  'MIDDLING at best, because anyone can buy a ticket.',
  '',
  'buyer_density — what share could plausibly buy the pilot in the north star above,',
  'or hire him. Senior leaders at media, adtech, data, marketing and publishing',
  'businesses ARE his buyers and score well here. This is not a penalty category.',
  '',
  'practitioner_density — what share are engineers, developers, ML researchers, data',
  'scientists, MLOps or AI builders. Score this HONESTLY and HIGH where it is true.',
  'A PyTorch meetup, an LLM day, a hackathon, a cloud vendor\'s "AI in practice"',
  'evening and a "getting started with agents" workshop are all 85-100. This is used',
  'as a penalty, so an accurate high number here is what keeps those rooms out.',
  '',
  'vendor_density — what share are there to sell: agency and martech sales teams,',
  'platform reps, consultants prospecting. A free event hosted by a software company',
  'is usually high. Note the asymmetry: a vendor HOST does not automatically mean a',
  'vendor ROOM. A vendor who fills a room with their own enterprise customers has low',
  'vendor density and high buyer density. Judge the room.',
  '',
  'seniority — how senior the room is: board, C-suite and owner at the top, junior',
  'and student at the bottom.',
  '',
  'named_attendees — real named people, with their role, who are confirmed to be',
  'there: speakers, hosts, panellists. Format each as "Name, Role at Company". This',
  'is the only hard evidence of who is in a room, so it matters more than the blurb.',
  'Return [] if the material names nobody. NEVER invent a name, and never list someone',
  'whose attendance you are inferring from the topic.',
  '',
  'score_reason — one or two plain sentences on who is in this room and whether that',
  'is worth an evening. Say the useful thing, not the polite one: "a hundred martech',
  'sales reps and eight buyers" is more valuable than "a strong industry gathering".',
  'Name the doubt where the material is thin. No em dashes. British English.',
  '',
  'HONESTY',
  'If the material is thin, say so in score_reason and score conservatively. Do not',
  'flatter an event to fill a field, and do not invent an audience the page does not',
  'evidence. A wrong high score costs him an evening; a cautious low one costs nothing.',
].join('\n')

function buildUser(e: EventScoreInput): string {
  const lines = [
    `Title: ${e.title}`,
    e.host ? `Host: ${e.host}` : null,
    e.host_kind ? `Host kind as recorded: ${e.host_kind}` : null,
    e.city ? `City: ${e.city}` : null,
    e.venue ? `Venue: ${e.venue}` : null,
    e.starts_at ? `Starts: ${e.starts_at}` : null,
    e.cost_kind ? `Cost: ${e.cost_kind}${e.ticket_price_usd ? ` (about $${e.ticket_price_usd})` : ''}` : null,
    e.url ? `URL: ${e.url}` : null,
    e.description ? `\nDescription:\n${e.description.slice(0, 4000)}` : null,
    e.page_context ? `\nFrom the event or host page:\n${e.page_context.slice(0, 6000)}` : null,
  ].filter(Boolean)
  if (!e.description && !e.page_context) {
    lines.push('\nNOTE: there is no description and no page text, only the fields above. Score conservatively and say so in score_reason.')
  }
  return lines.join('\n')
}

/** Judge one event. Throws on an unusable model response so the caller can
 *  record the failure rather than write a zero that reads like a verdict. */
export async function scoreEvent(e: EventScoreInput): Promise<EventScoreResult> {
  const raw = await callClaude({
    agent: 'event-score',
    system: SYSTEM,
    user: buildUser(e),
    model: SYNTHESIS_MODEL,
    maxTokens: 900,
    temperature: 0.2,
    think: false,
  })
  const parsed = robustJson(raw)
  if (!parsed || typeof parsed !== 'object') throw new Error('event_score_unparseable')

  const names = Array.isArray(parsed.named_attendees)
    ? parsed.named_attendees
        .filter((n: unknown) => typeof n === 'string' && n.trim())
        .map((n: string) => n.trim().slice(0, 200))
        .slice(0, 12)
    : []

  const judgment: EventJudgment = {
    peer_density: clamp(Number(parsed.peer_density)),
    buyer_density: clamp(Number(parsed.buyer_density)),
    practitioner_density: clamp(Number(parsed.practitioner_density)),
    vendor_density: clamp(Number(parsed.vendor_density)),
    seniority: clamp(Number(parsed.seniority)),
    seniority_note: String(parsed.seniority_note || '').trim().slice(0, 500),
    named_attendees: names,
    score_reason: String(parsed.score_reason || '').trim().slice(0, 1000),
  }

  return { ...judgment, ...computeAxes(judgment), score_version: SCORE_VERSION }
}
