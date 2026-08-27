// The six lenses, and the two channels.
//
// "Folders are the memory, lenses are the classification" (final brief, 27 Aug).
// The eleven folders live in content_themes because Krish edits them and they
// accumulate a view over months. The six lenses live here and in a CHECK
// constraint because they are a closed set that the engine classifies against.
//
// Exactly one lens per arc. No multi-tagging, and deliberately no 'other'
// bucket: a candidate that fits no lens is discarded. If the discard rate runs
// above roughly 60 percent that is evidence about the corpus, not a reason to
// widen the ontology, and widening it is how the old nine-category vocabulary
// ended up covering everything and selecting for nothing.
//
// scripts/check-content-vocabulary.mts keeps this list and the migration's
// CHECK constraint in step, because a lens that exists in one and not the other
// fails at write time in production rather than at build time here.

export const LENSES = [
  'pricing_packaging',
  'distribution_channel',
  'moat_defensibility',
  'buyer_behaviour',
  'category_positioning',
  'build_practice',
] as const

export type Lens = typeof LENSES[number]

/** What each lens covers, and which channel it usually routes to. Advisory:
 *  category_positioning genuinely serves both, and the routing rule in the
 *  brief says a candidate that could serve both is split or one side dropped,
 *  never surfaced twice. */
export const LENS_SPEC: Record<Lens, { covers: string; channel: Channel | 'either' }> = {
  pricing_packaging:    { covers: 'price changes, tiering, bundling, metering, discounting, free-tier moves', channel: 'paid' },
  distribution_channel: { covers: 'how the product reaches a buyer, partnerships, platform dependence, referral and search shifts', channel: 'paid' },
  moat_defensibility:   { covers: 'what actually holds: switching costs, data and harness advantage, proprietary loops', channel: 'built' },
  buyer_behaviour:      { covers: 'what buyers now ask for, procurement changes, what they stopped paying for', channel: 'paid' },
  category_positioning: { covers: 'category creation, collapse, renaming, incumbent displacement', channel: 'either' },
  build_practice:       { covers: 'how the thing is built and operated: team shape, eval and QA, orchestration with a stated outcome', channel: 'built' },
}

/** The stored keys stay 'built' and 'paid'.
 *
 *  The 27 Aug brief names the channels "Built with AI" and "The Money of AI",
 *  and the 26 Aug brief asked for the old keys to be kept as aliases. In
 *  production the column is shifts.lane holding 'built' and 'paid', and the
 *  content-corpus skill uses the same two words, so the alias runs the opposite
 *  way round from what that brief assumed: the data keeps its keys and only the
 *  labels change. Renaming the column would touch ContentV2Tab, LaneRoom and
 *  laneOf() for no gain. */
export const CHANNELS = ['built', 'paid'] as const
export type Channel = typeof CHANNELS[number]

export const CHANNEL_LABEL: Record<Channel, string> = {
  built: 'Built with AI',
  paid: 'The Money of AI',
}

/** Vertical fit applies to Money and not to Built.
 *  Krish, 26 Aug: a build lesson transfers across verticals, so Built ignores
 *  it; Money stays anchored to content, media and publishing because the P&L
 *  has to be one the reader recognises as theirs. */
export const VERTICAL_ANCHORED: Record<Channel, boolean> = {
  built: false,
  paid: true,
}

export const isLens = (v: unknown): v is Lens =>
  typeof v === 'string' && (LENSES as readonly string[]).includes(v)

export const isChannel = (v: unknown): v is Channel =>
  typeof v === 'string' && (CHANNELS as readonly string[]).includes(v)

/** The nine this replaced. Kept only so the guard can prove none of them has
 *  crept back in as a lens. shifts.category still holds them for historical
 *  rows and is frozen, not deleted: three of the nine (governance, security,
 *  proof) have no honest counterpart among the six, which is the point. */
export const RETIRED_AREAS = [
  'model', 'economics', 'tools', 'orchestration', 'product',
  'governance', 'security', 'org', 'proof',
] as const
