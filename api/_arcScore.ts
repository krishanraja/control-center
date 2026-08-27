// Step 5: scoring, revised. Final brief section 7.
//
// Replaces `momentum`, an integer that conflated volume with importance, and
// replaces the five-component model from the 26 Aug brief.
//
// The one change worth understanding: `money_proximity` is gone, absorbed into
// `reader_consequence`. It was too narrow. Krish accepted items about org
// design and about selling that have no price attached at all but a clear
// decision behind them, so "how few steps to a P&L line" was rejecting the
// right stories for the wrong reason. What matters is whether a commercial
// leader faces a decision differently, not whether money appears in it.
//
// Hard blocks run BEFORE scoring, because a blocked arc has no score at all
// rather than a low one. A low score still competes; a block does not.

import { lintCard, type Card, type LintContext } from './_cardLint.js'
import type { Lens, Channel } from './_lenses.js'

export interface Arc {
  id: string
  headline: string
  lens: Lens | null
  channel: Channel | null
  /** The folder this files under. Null is legitimate: two of the seven surfaced
   *  slots are reserved for exactly these. */
  theme_id: string | null
  /** Set when no folder matched but the arc could plausibly open a new one.
   *  Distinct from theme_id, and the block below accepts either. */
  plausible_new_theme?: boolean
  /** Independent beats, counted by origin. NOT story count: five outlets
   *  syndicating one wire is one. Comes from arc_independent_beats(). */
  independent_beats: number
  /** How many of those came from a primary-tier source. */
  primary_beats: number
  /** 0 to 1, from the saturation gate. Undefined means nobody measured it. */
  coverage_density?: number
  card: Card
}

export interface ScoreComponent {
  name: string
  weight: number
  value: number
}

export interface ArcScore {
  blocked: boolean
  /** Why it was blocked. Empty when it scored. */
  blocks: string[]
  total: number
  components: ScoreComponent[]
}

/** From the brief, and they sum to 1. */
export const WEIGHTS = {
  arc_maturity: 0.25,
  reader_consequence: 0.25,
  forward_claim: 0.20,
  legibility: 0.15,
  non_obviousness: 0.15,
} as const

/** "An arc with one beat cannot surface at all." */
export const MIN_INDEPENDENT_BEATS = 2

/** Where arc_maturity stops climbing. Six independent origins is already a
 *  well-evidenced arc; beyond that more beats say more about how loud a story
 *  is than how real it is, which is the exact failure `momentum` had. */
const MATURITY_SATURATES_AT = 6

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

export function scoreArc(arc: Arc, ctx: LintContext = {}): ArcScore {
  const blocks: string[] = []
  const lintCtx: LintContext = {
    coverageDensity: ctx.coverageDensity ?? arc.coverage_density,
  }
  const failures = lintCard(arc.card, lintCtx)

  // ── hard blocks, before scoring ─────────────────────────────────────────
  if (arc.independent_beats < MIN_INDEPENDENT_BEATS) {
    blocks.push(`${arc.independent_beats} independent beat${arc.independent_beats === 1 ? '' : 's'}, needs ${MIN_INDEPENDENT_BEATS}. A single event is evidence for an arc, not an arc`)
  }
  if (!arc.lens) blocks.push('no lens. A candidate fitting none of the six is discarded, not filed under a catch-all')
  if (!arc.channel) blocks.push('no channel. Every candidate routes to Built or Money, or is discarded')
  if (!arc.theme_id && !arc.plausible_new_theme) {
    blocks.push('no tracked folder and no plausible new one')
  }
  const tone = failures.find(f => f.rule === 'tone')
  if (tone) blocks.push(`tone gate: ${tone.detail}`)
  const otherLint = failures.filter(f => f.rule !== 'tone')
  if (otherLint.length) {
    blocks.push(`${otherLint.length} lint failure${otherLint.length === 1 ? '' : 's'}: ${otherLint.map(f => `${f.field}/${f.rule}`).join(', ')}`)
  }

  if (blocks.length) return { blocked: true, blocks, total: 0, components: [] }

  // ── components ──────────────────────────────────────────────────────────

  // Independent origins, weighted by tier. A primary-tier beat counts full; a
  // secondary one counts half, so an arc built only from trade press can reach
  // the middle of the range but not the top of it.
  const weightedBeats = arc.primary_beats + (arc.independent_beats - arc.primary_beats) * 0.5
  const arc_maturity = clamp01(weightedBeats / MATURITY_SATURATES_AT)

  // reader_consequence: can reader_decision be filled with a decision a
  // commercial leader already owns. The lint has already established the field
  // names a decision rather than an action, so what is left to measure is
  // whether it is anchored to something concrete.
  const rd = arc.card.reader_decision || ''
  const anchored = /\b(price|pricing|margin|renewal|contract|budget|headcount|vendor|supplier|channel|packaging|tier|seat|licence|license|spend|cost|deal|partner|hire|build|buy)\b/i.test(rd)
  const named = /\d|\b[A-Z][a-zA-Z]{2,}\b/.test(rd.replace(/^(\w)/, m => m.toLowerCase()))
  const reader_consequence = clamp01(0.4 + (anchored ? 0.35 : 0) + (named ? 0.25 : 0))

  // forward_claim: a falsifiable claim that is not continuation. The lint has
  // already rejected continuation and unfalsifiable claims outright, so this
  // grades how checkable what survives is.
  const wtg = arc.card.where_this_goes || ''
  const hasDate = /\b20\d\d\b|\b(q[1-4]|within|by the end of)\b/i.test(wtg)
  const hasQuantity = /\d+\s*(%|percent|x|times|million|billion)/i.test(wtg)
  const forward_claim = clamp01(0.4 + (hasDate ? 0.3 : 0) + (hasQuantity ? 0.3 : 0))

  // legibility: the gate is pass/fail and has already passed, so this rewards
  // claims that are short as well as clear. A 60-word sentence that happens to
  // avoid jargon is still not something a reader follows in one pass.
  const claimWords = [arc.card.headline, arc.card.the_opening].join(' ').split(/\s+/).filter(Boolean).length
  const legibility = clamp01(claimWords <= 45 ? 1 : claimWords >= 90 ? 0.3 : 1 - (claimWords - 45) / 64)

  // non_obviousness: inverse coverage density. Unmeasured is treated as 0.5
  // rather than 1, so an arc nobody measured cannot win on a number nobody took.
  const non_obviousness = typeof arc.coverage_density === 'number'
    ? clamp01(1 - arc.coverage_density)
    : 0.5

  const components: ScoreComponent[] = [
    { name: 'arc_maturity', weight: WEIGHTS.arc_maturity, value: arc_maturity },
    { name: 'reader_consequence', weight: WEIGHTS.reader_consequence, value: reader_consequence },
    { name: 'forward_claim', weight: WEIGHTS.forward_claim, value: forward_claim },
    { name: 'legibility', weight: WEIGHTS.legibility, value: legibility },
    { name: 'non_obviousness', weight: WEIGHTS.non_obviousness, value: non_obviousness },
  ]

  const total = components.reduce((sum, c) => sum + c.weight * c.value, 0)
  return { blocked: false, blocks: [], total, components }
}

// ---------------------------------------------------------------------------
// Step 6: surfacing.
// ---------------------------------------------------------------------------

/** "Hard cap of 7 cards visible at once. A queue that cannot be cleared in one
 *  sitting will not be used." */
export const VISIBLE_SLOTS = 7

/** Krish, 26 Aug: two slots held for arcs matching no tracked folder, left
 *  visibly empty when nothing qualifies. Both halves matter. Reserving without
 *  leaving them empty just backfills the familiar, and an empty slot is the
 *  signal: this week produced nothing he was not already looking at. */
export const RESERVED_FOR_UNTHEMED = 2

export interface Surfaced<T> {
  themed: T[]
  unthemed: T[]
  /** Reserved slots nothing qualified for. Rendered as gaps, never backfilled. */
  emptyReserved: number
}

/**
 * Order by score descending, never by age. Age never promotes a card, which is
 * the defect that put a 10 July brief review at slot 1 for six weeks.
 */
export function surface<T extends { theme_id: string | null; score: number }>(
  arcs: T[],
  slots = VISIBLE_SLOTS,
  reserved = RESERVED_FOR_UNTHEMED,
): Surfaced<T> {
  const byScore = [...arcs].sort((a, b) => b.score - a.score)
  const unthemedAll = byScore.filter(a => a.theme_id === null)
  const themedAll = byScore.filter(a => a.theme_id !== null)

  // The reservation is a FLOOR, not a cap. Fixed 26 Aug: this read
  // `unthemedAll.slice(0, reserved)`, which held unthemed arcs to two slots
  // however well they scored, so the engine could never show more than two
  // unfamiliar cards out of seven. That is the anti-echo rule running
  // backwards, and it is worse than not reserving at all, because it puts a
  // permanent ceiling on the only part of the queue Krish was not already
  // looking at.
  //
  // Caught by the first real run: the two best cards of the week were unthemed
  // at 0.68 and 0.66, a third scored 0.64, and it was displaced by themed cards
  // scoring 0.57, 0.54 and 0.52. The engine was choosing three worse and more
  // familiar cards over one better and less familiar one, by construction.
  const topBySlots = byScore.slice(0, slots)
  const earned = topBySlots.filter(a => a.theme_id === null).length
  const unthemed = unthemedAll.slice(0, Math.max(reserved, earned))

  // Short only when there genuinely are not enough unthemed arcs to fill the
  // floor. Those slots stay empty and are never given back to the themed half:
  // an empty slot is the signal that the week produced nothing unfamiliar.
  const emptyReserved = Math.max(0, reserved - unthemed.length)

  // Themed take what is left after the floor, or after the unthemed have earned
  // more than the floor. Never more than slots - reserved.
  const themed = themedAll.slice(0, slots - Math.max(reserved, unthemed.length))

  return { themed, unthemed, emptyReserved }
}

/** One line saying why this is on screen, per "Add 'why this is here' on every
 *  card: the state transition that surfaced it". */
export function surfacingReason(arcState: string, themed: boolean): string {
  const byState: Record<string, string> = {
    emerging: 'Just started, so an early call is still available',
    building: 'Evidence is still arriving on this one',
    peaking: 'Consensus is forming, so the contrarian window is closing',
    resolving: 'Evidence stopped arriving, so the closing account is due',
    resolved: 'This one ended, and how it ended is the story',
    stalled: 'It went quiet without resolving into anything',
    reversed: 'It turned out the other way, which is the strongest version of this piece',
  }
  const base = byState[arcState] || 'Surfaced on a change of state'
  return themed ? base : `${base}. Matches none of your tracked questions`
}
