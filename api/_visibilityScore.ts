// _visibilityScore. Is this stage worth Krish standing on it.
//
// Nova's standard, encoded. The model judges the room; code does the maths, per
// architecture rule 15.5 (numbers are computed, never LLM-emitted). The same
// contract as api/_eventScore.ts for rooms and api/_icpScore.ts for people.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS, IN NUMBERS READ OFF THE LIVE TABLE ON 2026-10-05
//
// 129 visibility_targets rows. 108 still open. 14 ever acted on, the last on
// 2026-06-17. quality_score was green on 91 of them. A mark that 71 percent of
// a corpus carries is not a judgement, it is a formality, and the brief said
// exactly why: "If I cannot enrich a candidate to green/amber quality, DO NOT
// write the row." Green was the entry ticket, so every row that exists is green.
// The bar was applied before the write and nothing was left to judge afterwards.
//
// Worse, the evidence the standard needs is simply absent:
//   124 of 129 rows have no `angle`.
//   108 of 129 have no `audience`.
//   124 of 129 have no `organizer_reputation`.
// So "is the buyer in this audience, does this platform carry authority, is this
// angle one only he can give" could not be answered for 96, 84 and 96 percent of
// the queue. A score computed over that is a green checkmark, and a green
// checkmark is not a result (krish-principles).
//
// ─────────────────────────────────────────────────────────────────────────────
// THE STANDARD IS A CONJUNCTION, NOT AN AVERAGE. THAT IS THE WHOLE CHANGE.
//
// Krish's three conditions are AND, not a mix:
//   1. the audience must contain the buyer,
//   2. the platform must carry authority,
//   3. the angle must be one only he can deliver.
//
// A weighted average lets a famous platform carry a wrong room, which is how a
// long tail survives. So the headline number is the MINIMUM of the three axes,
// not their mean. Worked example, the case that used to pass:
//
//   a well-known adtech trade title, room of journalists, generic AI take
//   room 30, standing 90, only-him 35
//   mean  = 52  → clears a floor of 50 and reaches him
//   min   = 30  → rejected, reason "wrong audience"
//
// And the case that used to be buried:
//
//   a small private founders' dinner, 40 owners, his own fleet numbers
//   room 82, standing 48, only-him 88
//   mean  = 73  → outranked by the trade title above on a mean
//   min   = 48  → below TAKE, lands in the STRETCH lane, marked, not hidden
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THE MESSAGE BEING SERVED IS
//
// From krishanraja/mindmake, project-documentation/00_NORTH_STAR.md, which is
// canon for the business: "Every AI a leader buys already knows the market. None
// of them know the leader. Mindmake builds the one that does, so the leader keeps
// their edge as the market moves." Instruments, not oracles. The third level
// (extend what I can do) is the only one worth paying for. Time saved is the
// setup, not the payoff. Two doors, Build your AI brain and Build your AI GTM,
// one paid proof.
//
// The buyer gate, from 01_CANON.md: "The person must own, or be able to move, the
// decision and the business result behind it." That sentence IS the room axis.
//
// The publication doctrine, from 02_PUBLICATION.md, is the only-him axis:
// "Long-form is the asset. Social is the trailer. LinkedIn, YouTube, TikTok,
// Instagram and podcast appearances are all distribution for these two, never
// formats of their own." A stage earns time when it feeds The Money of AI or
// Built with AI. And: "Exposure on its own is not payment."
//
// NOTHING IN HERE GOES OUTWARD. Control Center is internal, so it may hold the
// private material. The canon's never_publish list binds anything Nova drafts
// for a public surface: no price or rate card, no cash floor or volume ceiling,
// no proof duration beyond the public 30-day shape, no client name outside the
// consented set, no buyer archetype or its name, no internal sales wedge, no
// method name, no availability or start date. The prompt below is told this, and
// `PUBLIC_SAFE_NOTE` is what every drafting path reuses.

import { callClaude, robustJson } from './_content.js'
import { missionBlock } from './_mission.js'
import { SYNTHESIS_MODEL } from './_models.js'
import { PORTFOLIO } from '../src/lib/portfolio.js'

/** Bumped when any weight or floor below changes, and written to
 *  visibility_targets.score_version so a corpus judged under two regimes is
 *  visible rather than silently mixed. v1 is this standard; the legacy
 *  `relevance_score` column is version 0 and is never compared with it. */
export const VISIBILITY_SCORE_VERSION = 1

/**
 * The legacy column is two scales in one trench coat, and this is the proof.
 *
 * `nell-scout` and `nell-triage-2026-05-27` wrote 7, 8 and 9 (a 1-to-10 scale),
 * 85 rows. `nova_sweep` and `nova_retarget_*` wrote 72 to 95 (a 0-to-100 scale),
 * 20 rows. `nova_podchaser_*` wrote NULL, 24 rows. No row in the entire corpus
 * scores between 10 and 69.
 *
 * That is why correction 6bc01e95's "reject anything below 50" is not a quality
 * line: on this column 50 is a SOURCE filter. It would have excluded 8 of the 14
 * targets Krish ever acted on and kept 16 rows of which 2 were ever acted on.
 * Keep the old number for history, never gate on it.
 */
export const LEGACY_SCORE_VERSION = 0

/** What the model is allowed to return. Everything numeric below is computed. */
export interface VisibilityJudgment {
  /** Share of the audience who can move a decision and the result behind it. */
  decider_density: number
  /** Share who are engineers, developers, ML or data practitioners. A penalty. */
  practitioner_density: number
  /** Share who are there to sell: agency, martech, platform reps, consultants. */
  vendor_density: number
  /** Share who are journalists, analysts or commentators rather than operators. */
  press_density: number
  /** How senior the audience is: owner and board at the top. */
  seniority: number
  /** Would standing here hold up as evidence later. Reputation of the platform. */
  platform_standing: number
  /** Does the platform publish or broadcast where the buyer already is. */
  platform_reach_quality: number
  /** How much the angle depends on Krish's own operating record, 0-100. */
  angle_ownership: number
  /** The angle in one line, in his territory, never a generic AI take. */
  angle: string
  /** Which of the two channels this feeds, or 'neither'. */
  feeds_channel: 'the money of ai' | 'built with ai' | 'neither'
  /** True when the slot is bought, sponsored or otherwise pay-to-play. */
  pay_to_play: boolean
  /** True when the angle is commentary any competent person could give. */
  generic_take: boolean
  /** Real named people confirmed present, "Name, Role at Company". Never invented. */
  named_people: string[]
  /** Who is actually in the room, one or two plain sentences. */
  who_is_in_the_room: string
  /** Why him and not somebody else, one plain sentence. */
  why_him: string
  /** Why now, one plain sentence, or '' when there is no timing reason. */
  why_now: string
  /** The honest verdict in one or two sentences. Says the useful thing. */
  score_reason: string
  /** True when the material was too thin to judge. Nothing is written then. */
  evidence_thin: boolean
}

export type VisibilityVerdict = 'take' | 'stretch' | 'rejected'

/** Reject codes come from the ONE taxonomy in src/lib/servedSurfaces.ts under
 *  `visibility_targets`. No new vocabulary: the reject-reason guard
 *  (scripts/check-served-surfaces.mts) already holds that set, and a rejection
 *  the UI cannot label is a rejection nobody can learn from. */
export type VisibilityRejectReason =
  | 'visibility_wrong_audience'
  | 'visibility_too_low_tier'
  | 'visibility_too_technical'
  | 'visibility_off_vertical'
  | 'visibility_pay_to_play'
  | 'visibility_no_relevant_talk'
  | 'visibility_bad_timing'
  | 'visibility_unlikely_accepted'
  | 'visibility_other'

export interface VisibilityScoreResult extends VisibilityJudgment {
  room_score: number
  standing_score: number
  only_him_score: number
  /** The minimum of the three. The conjunction, as one number. */
  visibility_score: number
  verdict: VisibilityVerdict
  reject_reason: VisibilityRejectReason | null
  score_version: number
}

/**
 * The weights, in one place so a disagreement about the mix is a one-line edit.
 *
 * Read them as sentences:
 *   room      = mostly who in the audience can move a decision, partly how
 *               senior they are, minus hard for a room of practitioners, minus
 *               for a room of sellers, minus for a room of commentators.
 *   standing  = mostly whether the platform's name holds up as evidence, partly
 *               whether it reaches where the buyer already is, partly seniority.
 *   only_him  = how much the angle rests on his own operating record.
 *
 * The press penalty is the one that is new, and it is deliberately heavy. 74 of
 * the 129 rows in this table were `press_relationship` rows sourced by the guest
 * scout: adtech journalists, 64 of them marked green, none ever acted on. A
 * journalist is a route to an audience and is sometimes worth a conversation,
 * but a room of journalists is not a room of buyers and must never read as one.
 */
export const VISIBILITY_WEIGHTS = {
  room: { decider: 0.70, seniority: 0.30, practitioner: -0.40, vendor: -0.25, press: -0.35 },
  standing: { platform: 0.55, reach: 0.25, seniority: 0.20 },
} as const

/**
 * The floors. All three must clear for TAKE, and the headline number is the
 * minimum, so clearing them is harder than any single number suggests.
 *
 * These are a stated judgement, not a curve fitted to outcomes, and saying so is
 * the honest part. There is no outcome data to fit: 14 of 129 rows were ever
 * acted on, 8 of those came from one hand triage in May 2026, and nothing has
 * been acted on since 17 June 2026. A threshold presented as derived from that
 * would be invention. These are set where they are for reasons that can be
 * argued with:
 *
 *   ROOM 60      : below 60 the audience is majority not-buyer on any reading
 *                   of the weights, and the canon gate is binary: the person
 *                   either can move the decision or cannot.
 *   STANDING 55  : the bar is "would citing this later help or embarrass".
 *                   Lower than ROOM on purpose: a small room of the right people
 *                   beats a large one of the wrong people, and the publication
 *                   doctrine says the appearance is distribution for the two
 *                   channels, never the asset itself.
 *   ONLY_HIM 60  : equal to ROOM. "The angle must be one only Krish can
 *                   deliver" is the condition he stated most strongly, and an
 *                   angle anyone could give is worth nobody's evening.
 *   STRETCH 35   : the standing floor for the marked lane. A real room and a
 *                   real angle on a platform that is merely small is a judgement
 *                   call he should see and make, not a row to bury.
 *
 * Deliberate consequence, verified before shipping: applied to the live corpus
 * today, TAKE is EMPTY, because no row carries the evidence to clear it. That is
 * the correct answer and the surface says so in words. An empty lane that names
 * what is missing is an instrument; a filled lane of rows nobody acts on is an
 * oracle asking to be trusted.
 */
export const VISIBILITY_FLOORS = {
  room: 60,
  standing: 55,
  onlyHim: 60,
  /** The standing floor for the marked stretch lane. */
  stretchStanding: 35,
  /** At most this many stretch rows ever surface. A stretch lane that grows is
   *  the long tail coming back in under a new name. */
  stretchCap: 2,
} as const

/** A named person who is confirmed present is the only hard evidence of who is
 *  in a room, so it is worth a few points on standing. Bounded: one good name
 *  does not make a platform. Mirrors NAMED_ATTENDEE_BONUS in _eventScore.ts. */
export const NAMED_PERSON_BONUS = 5
export const NAMED_PERSON_BONUS_CAP = 10
/** Below this room score, a named person is not evidence of the right audience. */
const ROOM_BAR_FOR_BONUS = 50

export function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

export interface AxisInput {
  decider_density: number
  practitioner_density: number
  vendor_density: number
  press_density: number
  seniority: number
  platform_standing: number
  platform_reach_quality: number
  angle_ownership: number
  named_people?: string[] | null
}

/**
 * The three axes and the conjunction. Pure, so the guard, the tests and a replay
 * over the existing corpus can call it with no model and no network.
 */
export function computeVisibilityAxes(j: AxisInput): {
  room_score: number
  standing_score: number
  only_him_score: number
  visibility_score: number
} {
  const decider = clamp(j.decider_density)
  const prac = clamp(j.practitioner_density)
  const vend = clamp(j.vendor_density)
  const press = clamp(j.press_density)
  const sen = clamp(j.seniority)
  const plat = clamp(j.platform_standing)
  const reach = clamp(j.platform_reach_quality)

  const w = VISIBILITY_WEIGHTS
  const room = clamp(
    decider * w.room.decider +
    sen * w.room.seniority +
    prac * w.room.practitioner +
    vend * w.room.vendor +
    press * w.room.press,
  )

  let standing = plat * w.standing.platform + reach * w.standing.reach + sen * w.standing.seniority
  const names = (j.named_people || []).filter(n => typeof n === 'string' && n.trim())
  if (names.length && room >= ROOM_BAR_FOR_BONUS) {
    standing += Math.min(NAMED_PERSON_BONUS_CAP, names.length * NAMED_PERSON_BONUS)
  }
  const standing_score = clamp(standing)

  const only_him_score = clamp(j.angle_ownership)

  return {
    room_score: room,
    standing_score,
    only_him_score,
    // The conjunction. Not a mean: a mean lets one strong axis carry two weak
    // ones, which is the defect this whole module exists to remove.
    visibility_score: Math.min(room, standing_score, only_him_score),
  }
}

export interface VerdictInput extends AxisInput {
  pay_to_play?: boolean
  generic_take?: boolean
  feeds_channel?: string | null
  /** The event or deadline date, when the row has one. A passed date is dead. */
  dead_date?: boolean
}

/**
 * The verdict, and the reason when it is a rejection.
 *
 * ORDER IS LOAD-BEARING and the guard asserts it. The first matching gate wins,
 * because the reason has to be the one Krish would give. A pay-to-play slot in
 * front of a room of engineers is rejected as pay-to-play, not as too technical:
 * the money is the disqualifier and the room never had to be judged. The same
 * lesson as the fleet classifier, where a blown plan quota read as a broken
 * credential because the cheaper test ran first.
 */
export function visibilityVerdict(j: VerdictInput): {
  verdict: VisibilityVerdict
  reject_reason: VisibilityRejectReason | null
} {
  const a = computeVisibilityAxes(j)
  const f = VISIBILITY_FLOORS

  // 1. A date that has passed. Nothing else about the row matters.
  if (j.dead_date) return { verdict: 'rejected', reject_reason: 'visibility_bad_timing' }

  // 2. Bought attention. "Exposure on its own is not payment" (00_NORTH_STAR),
  //    and a slot he paid for carries no authority to cite later.
  if (j.pay_to_play) return { verdict: 'rejected', reject_reason: 'visibility_pay_to_play' }

  // 3. An angle anyone could give. Checked before the room, because a generic
  //    take in a perfect room is still a wasted appearance and the reason he
  //    would give is "I have nothing to say there", not "wrong audience".
  if (j.generic_take || a.only_him_score < f.onlyHim) {
    return { verdict: 'rejected', reject_reason: 'visibility_no_relevant_talk' }
  }

  // 4. The audience. Three different wrongs, three different words, in the order
  //    that makes the dominant failure the stated one.
  if (a.room_score < f.room) {
    if (clamp(j.practitioner_density) >= 60) {
      return { verdict: 'rejected', reject_reason: 'visibility_too_technical' }
    }
    if (clamp(j.press_density) >= 60) {
      return { verdict: 'rejected', reject_reason: 'visibility_off_vertical' }
    }
    if (clamp(j.seniority) < 50) {
      return { verdict: 'rejected', reject_reason: 'visibility_too_low_tier' }
    }
    return { verdict: 'rejected', reject_reason: 'visibility_wrong_audience' }
  }

  // 5. The platform. The room and the angle are both good by here, so a weak
  //    platform is a judgement call rather than a disqualification, and it goes
  //    to the marked stretch lane instead of being buried.
  if (a.standing_score < f.standing) {
    if (a.standing_score >= f.stretchStanding) return { verdict: 'stretch', reject_reason: null }
    return { verdict: 'rejected', reject_reason: 'visibility_too_low_tier' }
  }

  return { verdict: 'take', reject_reason: null }
}

/** The one line every drafting path reuses, so a public word cannot pick up a
 *  private one. Derived from the canon's never_publish list. */
export const PUBLIC_SAFE_NOTE = [
  'NEVER PUT ANY OF THIS IN ANYTHING OUTWARD FACING, including a pitch, an abstract, a bio',
  'or a talk description: the price or rate card, the cash floor or volume ceiling, any proof',
  'duration other than the public thirty day shape, a client name outside the consented proof',
  'set, the buyer archetype or its name, the internal sales wedge, the name of the method, or',
  'availability and start dates. Outward copy may say two doors, one paid proof, and the',
  'thirty day shape, and nothing further about commercials.',
].join('\n')

/**
 * The priority ladder, read from the ONE list rather than restated here.
 *
 * src/lib/portfolio.ts is the single ranking that Growth, Subscriptions and the
 * weekly growth review all read (PR #387). A second copy of "Heartside and Full
 * Time first" in this prompt would be a fourth place to forget to update, which
 * is exactly the defect that list was created to end. The serverless tree
 * already imports it this way, like ventureOptions.ts and webProperties.ts.
 */
function ladderLines(): string[] {
  const byTier = new Map<number, string[]>()
  for (const p of PORTFOLIO) {
    const t = byTier.get(p.tier) || []
    t.push(p.label)
    byTier.set(p.tier, t)
  }
  return [...byTier.keys()].sort().map(t => `${t}. ${(byTier.get(t) || []).join(' and ')}.`)
}

const SYSTEM = [
  missionBlock(),
  '',
  'THE MESSAGE THIS SERVES, FROM CANON (krishanraja/mindmake, 00_NORTH_STAR.md)',
  'Every AI a leader buys already knows the market. None of them know the leader. Mindmake',
  'builds the one that does, so the leader keeps their edge as the market moves.',
  'Instruments, not oracles: an instrument makes a situation legible enough that you can',
  'decide; an oracle answers and asks for trust. The third level is the only one worth paying',
  'for: not help me do the task, not bring me what matters, but extend what I can do so the',
  'system keeps making decisions better. Time saved is the setup, not the payoff.',
  'Two public doors, Build your AI brain and Build your AI GTM. Both lead to one paid proof.',
  '',
  'THE BUYER, AND THIS IS THE WHOLE TEST OF AN AUDIENCE',
  'A founder, principal, portfolio owner, investor or senior commercial leader who can move a',
  'decision ON THEIR OWN and the business result behind it. If the people in the audience',
  'cannot move a decision, they are not the buyer, however senior their titles read.',
  'Poor fit, explicitly: someone who cannot move the decision; an audience that wants training',
  'or certification; an audience that wants a list of task automations; production IT work.',
  '',
  'WHAT HE IS WORKING ON NOW, in priority order',
  ...ladderLines(),
  'Heartside is a Shopify store selling gifts written by your dog. It is RETAIL, not an AI',
  'product, and a stage that only fits Heartside is a commerce or consumer-brand stage judged',
  'as one. Never pitch it as AI strategy.',
  'Mindmake the practice and its publication run alongside the ladder. Circle is dormant.',
  'Retired, never mention as live: AdFixus, Meliora, Techonomic, Amperity, Builder Economy,',
  'Mindmaker Live, OnAlert, gutted, merciless, Plinth as a name, the old offer ladder.',
  '',
  'YOUR JOB',
  'You are judging whether a stage is worth Krish standing on it. You are NOT judging how',
  'impressive the platform sounds, how large the audience is, or how good the topic is. Three',
  'things, and all three have to be true at once:',
  '  1. THE AUDIENCE CONTAINS THE BUYER. Not "people interested in AI". People who can move a',
  '     decision and the result behind it.',
  '  2. THE PLATFORM CARRIES AUTHORITY. Would naming this later help him or embarrass him.',
  '  3. THE ANGLE IS ONE ONLY HE CAN DELIVER. It rests on his own operating record: he runs a',
  '     portfolio on a fleet of AI agents in public with the failures left in, and he has',
  '     sixteen years of commercial operating behind it. An argument any competent AI',
  '     commentator could make is worth nobody\'s time, however true it is.',
  '',
  'Return ONLY a JSON object, no prose and no code fences:',
  '{ "decider_density": 0-100, "practitioner_density": 0-100, "vendor_density": 0-100,',
  '  "press_density": 0-100, "seniority": 0-100, "platform_standing": 0-100,',
  '  "platform_reach_quality": 0-100, "angle_ownership": 0-100, "angle": string,',
  '  "feeds_channel": "the money of ai" | "built with ai" | "neither",',
  '  "pay_to_play": boolean, "generic_take": boolean, "named_people": string[],',
  '  "who_is_in_the_room": string, "why_him": string, "why_now": string,',
  '  "score_reason": string, "evidence_thin": boolean }',
  '',
  'THE DIMENSIONS',
  '',
  'decider_density: what share of the audience can move a decision and the business result',
  'behind it: founders, owners, CEOs, principals, investors, commercial leaders with a budget.',
  'A conference that sells tickets to anyone is MIDDLING at best. A private dinner of forty',
  'owners is HIGH. A webinar audience of job titles with no budget is LOW.',
  '',
  'practitioner_density: what share are engineers, developers, ML researchers, data',
  'scientists or AI builders. Score HONESTLY and HIGH where it is true. A meetup, a hackathon,',
  'a "getting started with agents" workshop, a vendor\'s technical evening: 85-100. This is',
  'used as a penalty, so an accurate high number is what keeps those stages out.',
  '',
  'vendor_density: what share are there to sell: agency and martech sales teams, platform',
  'reps, consultants prospecting. A vendor HOST does not mean a vendor ROOM: a vendor who',
  'fills a room with their own enterprise customers has low vendor density. Judge the room.',
  '',
  'press_density: what share are journalists, analysts or commentators rather than operators.',
  'Score this honestly and high where it is true. A trade publication\'s own audience, a press',
  'briefing, an analyst day: HIGH. This is a penalty. A journalist can be worth a conversation',
  'and is still not a buyer, and 74 of the rows in this table were journalists marked as good',
  'targets, none of which he ever acted on.',
  '',
  'seniority: how senior the audience is. Owner and board at the top, junior and student at',
  'the bottom.',
  '',
  'platform_standing: would standing here hold up as evidence later. Judge the platform\'s own',
  'reputation with the buyer above, not its follower count. A respected private forum scores',
  'higher than a large open conference with no curation. A pay-to-speak slot scores low here',
  'AND sets pay_to_play.',
  '',
  'platform_reach_quality: does this platform publish or broadcast where the buyer already',
  'is. A podcast whose listeners are founders is high. A podcast with ten times the downloads',
  'and an audience of students is low. Quality of reach, never size of reach.',
  '',
  'angle_ownership: how much the angle depends on HIM specifically. 85-100: it rests on his',
  'own numbers, his own fleet, his own failures, work only he has done. 40-60: he is well',
  'placed to say it but so are twenty other people. 0-30: anyone who reads the news could',
  'give this talk. Be harsh. This is the axis that decides whether the appearance is his or',
  'just an appearance.',
  '',
  'angle: the angle in one plain line, in his territory, written so he could say it out loud.',
  'Not a title, not a topic. The argument. If you cannot name one that is his, say so in',
  'score_reason and set generic_take true rather than inventing an angle to fill the field.',
  '',
  'feeds_channel: long-form is the asset and an appearance is distribution for it. Say which',
  'of the two channels this appearance would feed: "the money of ai" (what AI does to',
  'somebody\'s margin, told through incentives and business models, never a named villain) or',
  '"built with ai" (anyone can build with AI, told through real builds). "neither" is an',
  'honest answer and it is a mark against the stage, not a neutral one.',
  '',
  'pay_to_play: true when the slot is bought, sponsored, bundled with a sponsorship, or the',
  'speaker is asked to pay, bring an audience, or buy a ticket to speak. Exposure on its own',
  'is not payment.',
  '',
  'generic_take: true when the angle is commentary any competent person in the field could',
  'give. Default to TRUE when you are unsure. A false negative here costs him a day and his',
  'credibility; a false positive costs nothing, because the rejection is shown with its reason',
  'and he can overturn it in one click.',
  '',
  'named_people: real named people, with role, confirmed to be there: hosts, speakers,',
  'panellists, past guests. Format "Name, Role at Company". This is the only hard evidence of',
  'who is in a room. Return [] if the material names nobody. NEVER invent a name and never',
  'list somebody whose presence you are inferring from the topic.',
  '',
  'who_is_in_the_room: one or two plain sentences on who is actually there. Say the useful',
  'thing, not the polite one: "about thirty owners of mid-market publishers and four vendors"',
  'beats "a strong industry gathering".',
  '',
  'why_him: one plain sentence on why this is his appearance and not somebody else\'s. If the',
  'honest answer is that it is not, write that.',
  '',
  'why_now: one plain sentence on the timing reason, if there is a real one: a deadline, a',
  'window, something that just happened in that audience\'s world. Empty string when there is',
  'no timing reason. Never manufacture urgency.',
  '',
  'score_reason: one or two sentences carrying the verdict. Name the doubt where the material',
  'is thin. No em dashes. British English.',
  '',
  'evidence_thin: true when the material does not actually support a judgement: no audience',
  'description, no sense of who attends, nothing about the platform. Set it and say so. An',
  'unjudged row is recorded as unjudged and never shown as an opportunity. It is NEVER scored',
  'low instead: a low score reads on the card as a verdict on the stage and is the same pixels',
  'as an honest one.',
  '',
  PUBLIC_SAFE_NOTE,
  '',
  'HONESTY',
  'A wrong high judgement costs him a day of preparation, a flight and the credibility of',
  'standing in front of the wrong room. A cautious low one costs nothing, because every',
  'rejection is shown to him with its reason and he can overturn it. Judge accordingly. Do not',
  'flatter a stage to fill a field, and never invent an audience the material does not',
  'evidence.',
].join('\n')

export interface VisibilityScoreInput {
  title: string
  type?: string | null
  organizer?: string | null
  organizer_reputation?: string | null
  audience?: string | null
  audience_sector?: string | null
  audience_seniority?: string | null
  audience_size?: number | null
  location?: string | null
  format?: string | null
  ticket_price_usd?: number | null
  event_start_at?: string | null
  deadline_at?: string | null
  why_relevant?: string | null
  strategic_value?: string | null
  past_speakers?: Array<{ name?: string; role?: string }> | null
  url?: string | null
  /** Text pulled from the event, show or publication page, when there is any. */
  page_context?: string | null
}

function buildUser(t: VisibilityScoreInput): string {
  const speakers = (t.past_speakers || [])
    .map(p => [p?.name, p?.role].filter(Boolean).join(', '))
    .filter(Boolean)
    .slice(0, 15)
  const lines = [
    `Title: ${t.title}`,
    t.type ? `Kind as recorded: ${t.type}` : null,
    t.organizer ? `Organiser: ${t.organizer}` : null,
    t.organizer_reputation ? `Organiser standing as recorded: ${t.organizer_reputation}` : null,
    t.audience ? `Audience as recorded: ${t.audience}` : null,
    t.audience_sector ? `Audience sector: ${t.audience_sector}` : null,
    t.audience_seniority ? `Audience seniority: ${t.audience_seniority}` : null,
    typeof t.audience_size === 'number' ? `Audience size as recorded: ${t.audience_size}` : null,
    t.format ? `Format: ${t.format}` : null,
    t.location ? `Location: ${t.location}` : null,
    typeof t.ticket_price_usd === 'number' ? `Ticket price: about $${t.ticket_price_usd}` : null,
    t.event_start_at ? `Starts: ${t.event_start_at}` : null,
    t.deadline_at ? `Applications close: ${t.deadline_at}` : null,
    t.url ? `URL: ${t.url}` : null,
    speakers.length ? `\nNamed people recorded against it:\n${speakers.join('\n')}` : null,
    t.why_relevant ? `\nWhy it was recorded as relevant:\n${t.why_relevant.slice(0, 2000)}` : null,
    t.strategic_value ? `\nStrategic value as recorded:\n${t.strategic_value.slice(0, 1500)}` : null,
    t.page_context ? `\nFrom the page:\n${t.page_context.slice(0, 6000)}` : null,
  ].filter(Boolean)

  // The honest prompt for the case this corpus is mostly made of: a title, a URL
  // and nothing else. 108 of 129 rows have no audience text at all.
  if (!t.audience && !t.page_context && !t.why_relevant) {
    lines.push(
      '\nNOTE: there is no audience description, no page text and no recorded reason, only the',
      'fields above. You almost certainly cannot judge who is in this room from this. Set',
      'evidence_thin true and say what is missing rather than guessing.',
    )
  }
  return lines.join('\n')
}

/** True when the row's own dates put it in the past. Computed, never asked of
 *  the model: a date is arithmetic and the model gets dates wrong. */
export function isDeadDate(t: { event_start_at?: string | null; deadline_at?: string | null }, now = new Date()): boolean {
  for (const iso of [t.event_start_at, t.deadline_at]) {
    if (!iso) continue
    const ts = Date.parse(iso)
    if (Number.isNaN(ts)) continue
    if (ts < now.getTime()) return true
  }
  return false
}

/**
 * Judge one target.
 *
 * Throws on an unusable model response, and returns `null` for a row the model
 * says it cannot judge, so the caller records the gap rather than writing a zero
 * that reads like a verdict. Same contract as scoreEvent in _eventScore.ts and
 * for the same reason: on the card an honest zero and a silent failure are the
 * same pixels, and that asymmetry is what let fifteen days of silence survive.
 */
export async function scoreVisibilityTarget(
  t: VisibilityScoreInput,
  now = new Date(),
): Promise<VisibilityScoreResult | null> {
  const raw = await callClaude({
    agent: 'visibility-score',
    system: SYSTEM,
    user: buildUser(t),
    model: SYNTHESIS_MODEL,
    maxTokens: 1100,
    temperature: 0.2,
    think: false,
    // The weekly pass judges its batch one after another with this same system
    // prompt, so every call after the first reads it from the cache.
    cacheSystem: true,
  })
  const parsed = robustJson(raw)
  if (!parsed || typeof parsed !== 'object') throw new Error('visibility_score_unparseable')

  if (parsed.evidence_thin === true) return null

  const names = Array.isArray(parsed.named_people)
    ? parsed.named_people
        .filter((n: unknown) => typeof n === 'string' && n.trim())
        .map((n: string) => n.trim().slice(0, 200))
        .slice(0, 12)
    : []

  const channel = String(parsed.feeds_channel || '').toLowerCase().trim()
  const feeds_channel: VisibilityJudgment['feeds_channel'] =
    channel === 'the money of ai' || channel === 'built with ai' ? channel : 'neither'

  const judgment: VisibilityJudgment = {
    decider_density: clamp(Number(parsed.decider_density)),
    practitioner_density: clamp(Number(parsed.practitioner_density)),
    vendor_density: clamp(Number(parsed.vendor_density)),
    press_density: clamp(Number(parsed.press_density)),
    seniority: clamp(Number(parsed.seniority)),
    platform_standing: clamp(Number(parsed.platform_standing)),
    platform_reach_quality: clamp(Number(parsed.platform_reach_quality)),
    angle_ownership: clamp(Number(parsed.angle_ownership)),
    angle: String(parsed.angle || '').trim().slice(0, 400),
    feeds_channel,
    pay_to_play: parsed.pay_to_play === true,
    // An angle that is empty or that feeds neither channel is generic by
    // construction, whatever the model said about it.
    generic_take: parsed.generic_take === true || !String(parsed.angle || '').trim() || feeds_channel === 'neither',
    named_people: names,
    who_is_in_the_room: String(parsed.who_is_in_the_room || '').trim().slice(0, 600),
    why_him: String(parsed.why_him || '').trim().slice(0, 400),
    why_now: String(parsed.why_now || '').trim().slice(0, 400),
    score_reason: String(parsed.score_reason || '').trim().slice(0, 1000),
    evidence_thin: false,
  }

  const axes = computeVisibilityAxes(judgment)
  const { verdict, reject_reason } = visibilityVerdict({
    ...judgment,
    dead_date: isDeadDate(t, now),
  })

  return { ...judgment, ...axes, verdict, reject_reason, score_version: VISIBILITY_SCORE_VERSION }
}
