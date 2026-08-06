// contentEngine — shared config for the Content Engine layer on the Content tab.
//
// The engine is additive: it layers transform-axes, enrich/challenge, channel
// variants, the Five Standards gate, and Push-to-Cleo on top of the existing
// read-only-ish ContentIdeaCard. Everything new is gated behind
// VITE_CONTENT_ENGINE_ENABLED so the inbox UI is untouched when off.

export function contentEngineEnabled(): boolean {
  // Default OFF — opt in per environment (Vite build-time var).
  return String(import.meta.env.VITE_CONTENT_ENGINE_ENABLED) === 'true'
}

/** Content tab rebuild flag (see docs/plans/content-tab-rebuild). Default OFF. */
export function contentRebuildEnabled(): boolean {
  return String(import.meta.env.VITE_CONTENT_REBUILD_ENABLED) === 'true'
}

// ── The single source of truth for the content state machine ─────────────
// Every surface (lanes list, triage deck, the right-rail decision actions, the
// pipeline hook) imports from HERE. No surface may redefine the advance map,
// the gates, the active predicate, or the "is this card real" test. This is the
// fix for CORE_PROBLEM.md F-1/F-2: four copies of one state machine.

export type ContentState =
  | 'seeded' | 'researching' | 'drafting' | 'review' | 'approved' | 'published' | 'dropped' | 'absorbed'

/** Pipeline order for sorting + the stage track. */
export const STATE_ORDER: ContentState[] = [
  'seeded', 'researching', 'drafting', 'review', 'approved', 'published',
]

/** States that count as "in flight" (shown, worked on, counted as active). */
export const ACTIVE_STATES: ContentState[] = ['seeded', 'researching', 'drafting', 'review', 'approved']

/** The two human gates. A fast swipe/relabel must NEVER auto-cross these. */
export const GATE_STATES: ReadonlySet<ContentState> = new Set<ContentState>(['review', 'approved'])

/** Minimum body length for a card to honestly be in `review` (J-01 / C-1). */
export const REVIEW_MIN_BODY = 200

/** Linear advance map. Stops before the gates — those open the Composer. */
export const ADVANCE_NEXT: Partial<Record<ContentState, ContentState>> = {
  seeded: 'researching',
  researching: 'drafting',
  drafting: 'review',
}

/** Sort priority — worst (most upstream) first, for the triage deck. */
export const STATE_PRIORITY: Record<string, number> = {
  seeded: 0, researching: 1, drafting: 2, review: 3, approved: 4,
}

interface IdeaLike {
  state: string
  body?: string | null
  buried_at?: string | null
  // Permissive — every content row shape (and the rich ContentIdeaRow.meta)
  // satisfies this; we only ever read meta.cleo_chat.
  meta?: Record<string, any> | null
}

export function bodyLen(row: { body?: string | null }): number {
  return (row.body || '').trim().length
}

/** A card has "real" content if it has a substantial body or a live Cleo chat. */
export function hasRealBody(row: IdeaLike): boolean {
  if (bodyLen(row) >= REVIEW_MIN_BODY) return true
  const chat = row.meta?.cleo_chat
  return Array.isArray(chat) && chat.length > 0
}

/** Active = in flight, not buried, not terminal. The ONE active predicate. */
export function isActiveIdea(row: IdeaLike): boolean {
  return !row.buried_at && (ACTIVE_STATES as string[]).includes(row.state)
}

export function isGateState(state: string): boolean {
  return GATE_STATES.has(state as ContentState)
}

/** Where RIGHT/advance takes this card, or null at a human gate (open Composer). */
export function nextState(state: string): ContentState | null {
  return ADVANCE_NEXT[state as ContentState] ?? null
}

const ADVANCE_LABELS: Partial<Record<ContentState, string>> = {
  seeded: 'Research', researching: 'Draft', drafting: 'Review',
}
export function advanceLabel(state: string): string {
  return ADVANCE_LABELS[state as ContentState] ?? 'Open'
}

/**
 * How RIGHT/advance behaves for a state — the anti-zombie rule (CORE_PROBLEM F-1):
 *  - 'relabel' : a safe pure state bump (only seeded → researching, a queue marker).
 *  - 'develop' : opens the Composer so a real draft gets written; NEVER a bare
 *                relabel into researching/drafting/review (that is how empty
 *                "drafting"/"review" cards were created).
 *  - 'open'    : a human gate (review/approved) — open the Composer to decide.
 */
export function advanceMode(state: string): 'relabel' | 'develop' | 'open' {
  if (state === 'seeded') return 'relabel'
  if (state === 'researching' || state === 'drafting') return 'develop'
  return 'open'
}

/**
 * Honest-state guard. Can this row legitimately ENTER `state`?
 * The load-bearing rule: a card cannot enter `review` without a real body
 * (this is the bug that filled the queue with empty "in review" cards).
 */
export function canEnterState(
  state: string,
  row: IdeaLike,
): { ok: boolean; reason?: string } {
  if (state === 'review' && !hasRealBody(row)) {
    return { ok: false, reason: 'A card needs a real draft before it can go to review. Develop it first.' }
  }
  if (state === 'approved' && !hasRealBody(row)) {
    return { ok: false, reason: 'Nothing to approve — this card has no draft yet.' }
  }
  return { ok: true }
}

// ── One population, one set of counts (CORE_PROBLEM F-3 / P-6) ────────────
// Every counter on every surface derives from THIS. A card is in exactly one
// bucket. No surface may compute its own pile filter.

export interface ContentBuckets {
  upstream: IdeaLike[]   // seeded + researching
  drafting: IdeaLike[]
  review: IdeaLike[]
  approved: IdeaLike[]
  active: IdeaLike[]     // all in-flight, not buried
  buried: IdeaLike[]
  deck: IdeaLike[]       // the triage population: active upstream + drafting (pre-gate)
}

// ── The single "what do I do next" answer (P-22 / J-13) ──────────────────
// One function decides the highest-priority next action across the whole pile,
// so the tab never leaves Krish wondering what to do. Priority is ordered by
// "closest to shipped value first" with loss-aversion on ready work.

export type NextActionKind = 'publish' | 'approve' | 'schedule' | 'draft' | 'develop' | 'seed' | 'triage' | 'clear'

export interface NextBest<T> {
  kind: NextActionKind
  idea?: T
  /** Plain-language instruction — what to do. */
  headline: string
  /** Why / how many — the supporting line. */
  sub: string
  /** The label for the one-tap primary button (empty for 'clear'). */
  actionLabel: string
}

interface NextIdeaLike extends IdeaLike {
  id: string
  idea?: string | null
  updated_at?: string | null
  scheduled_for?: string | null
  published_at?: string | null
  published_url?: string | null
}

function todayYMD(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function oldestBy<T extends { updated_at?: string | null }>(rows: T[]): T {
  return [...rows].sort((a, b) => (a.updated_at || '') < (b.updated_at || '') ? -1 : 1)[0]
}

function clip(s: string | null | undefined, n = 56): string {
  const t = (s || '').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

export function nextBestAction<T extends NextIdeaLike>(ideas: T[]): NextBest<T> {
  const b = contentBuckets(ideas)
  const today = todayYMD()

  // 0) Publish — an approved, scheduled piece whose ship date has arrived and
  //    isn't live yet. A dated public commitment is the most time-critical thing
  //    on the board, so it outranks everything. This is the platform following
  //    Krish up on the last step: the Doc's built, now put it live and log the link.
  const toPublish = b.approved.filter(i =>
    !i.published_at && !i.published_url && i.scheduled_for && i.scheduled_for <= today,
  )
  if (toPublish.length) {
    const i = [...toPublish].sort((a, c) => (a.scheduled_for || '') < (c.scheduled_for || '') ? -1 : 1)[0]
    const overdue = (i.scheduled_for || '') < today
    return {
      kind: 'publish', idea: i, actionLabel: 'Mark published',
      headline: `Publish "${clip(i.idea)}"`,
      sub: toPublish.length > 1
        ? `${toPublish.length} approved pieces are due to go live`
        : overdue ? `Was due ${i.scheduled_for} — put it live and log the link` : 'Scheduled for today — put it live and log the link',
    }
  }

  // 1) Approve — ready drafts awaiting sign-off. Closest to shipped; never let
  //    finished work sit (loss aversion).
  const reviewReady = b.review.filter(hasRealBody)
  if (reviewReady.length) {
    const i = oldestBy(reviewReady)
    return {
      kind: 'approve', idea: i, actionLabel: 'Approve',
      headline: `Approve "${clip(i.idea)}"`,
      sub: reviewReady.length > 1 ? `${reviewReady.length} drafts ready for your sign-off` : 'Ready for your sign-off',
    }
  }

  // 2) Schedule — approved but not yet scheduled.
  const approvedUnsched = b.approved.filter(i => !i.scheduled_for && !i.published_at)
  if (approvedUnsched.length) {
    const i = oldestBy(approvedUnsched)
    return {
      kind: 'schedule', idea: i, actionLabel: 'Schedule',
      headline: `Schedule "${clip(i.idea)}"`,
      sub: approvedUnsched.length > 1 ? `${approvedUnsched.length} approved and waiting for a date` : 'Approved — pick a day to ship it',
    }
  }

  // 3) Finish a draft in progress.
  if (b.drafting.length) {
    const i = oldestBy(b.drafting)
    return {
      kind: 'draft', idea: i, actionLabel: 'Continue draft',
      headline: `Finish the draft "${clip(i.idea)}"`,
      sub: b.drafting.length > 1 ? `${b.drafting.length} drafts in progress` : 'Pick up where you left off',
    }
  }

  // 4) Develop a researched idea into a draft.
  const researching = b.upstream.filter(i => i.state === 'researching')
  if (researching.length) {
    const i = oldestBy(researching)
    return {
      kind: 'develop', idea: i, actionLabel: 'Develop',
      headline: `Develop "${clip(i.idea)}"`,
      sub: researching.length > 1 ? `${researching.length} researched ideas ready to write` : 'Researched and ready to write',
    }
  }

  // 5) Turn a raw seed into something.
  const seeded = b.upstream.filter(i => i.state === 'seeded')
  if (seeded.length) {
    const i = oldestBy(seeded)
    return {
      kind: 'seed', idea: i, actionLabel: 'Open',
      headline: `Develop a seed: "${clip(i.idea)}"`,
      sub: seeded.length > 1 ? `${seeded.length} raw seeds waiting` : 'A raw idea waiting to be shaped',
    }
  }

  // 6) Nothing in flight.
  return { kind: 'clear', actionLabel: '', headline: "You're clear", sub: 'Nothing waiting on you. New work lands here when it is ready.' }
}

export function contentBuckets<T extends IdeaLike>(ideas: T[]): {
  upstream: T[]; drafting: T[]; review: T[]; approved: T[]
  active: T[]; buried: T[]; deck: T[]
  counts: { upstream: number; drafting: number; review: number; approved: number; active: number; buried: number; deck: number }
} {
  const active = ideas.filter(isActiveIdea)
  const upstream = active.filter(i => i.state === 'seeded' || i.state === 'researching')
  const drafting = active.filter(i => i.state === 'drafting')
  const review = active.filter(i => i.state === 'review')
  const approved = active.filter(i => i.state === 'approved')
  const buried = ideas.filter(i => i.buried_at && i.state !== 'dropped' && i.state !== 'published')
  // The deck is the pre-gate pile: everything with a clear next step.
  const deck = active.filter(i => nextState(i.state) != null)
  return {
    upstream, drafting, review, approved, active, buried, deck,
    counts: {
      upstream: upstream.length, drafting: drafting.length, review: review.length,
      approved: approved.length, active: active.length, buried: buried.length, deck: deck.length,
    },
  }
}

// ── Transform axes (Phase 1) ─────────────────────────────────────────────
// One-click rewrites of the CURRENT draft. These never invent a new channel;
// they bend tone, length, or angle on the text in front of you.

export type ReviseMode = 'tone' | 'length' | 'zoom' | 'feedback'

export interface AxisOption {
  value: string
  label: string
  /** Steer text handed to the model, in Krish's register. */
  hint: string
}

export const TONE_PRESETS: AxisOption[] = [
  { value: 'punchier', label: 'Punchier', hint: 'Compress. Shorter declaratives, harder verb choices, uneven rhythm. Cut every word that the reader already understands.' },
  { value: 'contrarian', label: 'More contrarian', hint: 'Sharpen the antagonist. Discard the lazy version of the take out loud ("Not X, Y") then commit to the spikier read. Spike points at the idea, never the reader.' },
  { value: 'warmer', label: 'Warmer', hint: 'More human, more generous. Touch the feeling once and move. Keep the teeth on the ideas, not the people.' },
  { value: 'formal', label: 'More formal', hint: 'Exec-to-exec, Gear A. Unbothered authority, commercially grounded, zero flattery. Still no corporate hedging.' },
]

export const LENGTH_PRESETS: AxisOption[] = [
  { value: 'short', label: 'Short (LinkedIn)', hint: 'Cut to 150-250 words. Scroll-stopping claim or scene first. No hook-line-gap-explanation pattern.' },
  { value: 'mid', label: 'Mid (MYMU)', hint: 'Tighten to ~400-700 words. Teaching voice, every paragraph advances the argument, each item carries a so-what.' },
  { value: 'long', label: 'Full essay', hint: 'Expand to a 600-1000 word investigative essay. Slower structural open that earns the depth, take the claim apart and check each part against dated evidence, hold one genuine counterpoint, say where the knowable ends, end on a hard verdict. No summary ending.' },
]

// Humor / comic-register presets — a facet of tone, so sent with mode 'tone'
// (no backend change needed; the steer rides on `hint`). All obey the voice
// guardrails: aim irony at ideas, hype, or situations, never at people (the
// "Kind" standard). These layer one comic register onto the draft without
// inventing facts or losing the argument.
export const HUMOR_PRESETS: AxisOption[] = [
  { value: 'witty', label: 'Witty', hint: 'Add wit: quick, intelligent turns of phrase, a clever reframe or an unexpected comparison that rewards a sharp reader. Earn the laugh through precision, never through trying. One good line beats three.' },
  { value: 'sarcastic', label: 'Sarcastic', hint: 'Add a dry, sarcastic edge. Aim the irony at the idea, the hype, or the situation, never at a person. Say the opposite of the obvious read and let the gap carry it. Controlled, one or two beats, not a rant.' },
  { value: 'absurd', label: 'Absurd', hint: 'Push one idea to its absurd logical extreme to expose the truth inside it. Commit fully to the bit, stay anchored to the real argument, land back on the point. Strange, not random.' },
  { value: 'satirical', label: 'Satirical', hint: 'Deadpan satirical-column voice, like a satirical periodical. Report an absurd premise with total straight-faced seriousness. The humour lives in the framing and the restraint, never in a wink to the reader.' },
  { value: 'deadpan', label: 'Deadpan', hint: 'Dry and deadpan. Underplay everything, let the absurdity sit unremarked, no exclamation marks, no signposting the joke. Flat on top, sharp underneath.' },
  { value: 'periodic', label: 'Periodic', hint: 'Use periodic sentences: withhold the payoff until the final clause so each line lands on timing. Build, hold, then deliver the turn at the end.' },
]

export const ZOOM_DEFAULT_HINT =
  'Zoom into the single sharpest angle inside this idea and expand only that. Discard the rest. One arguable claim, earned with a specific artifact, ending on a hard verdict.'

// Quick-iterate chips (Phase 5) — feedback-mode revisions.
export const ITERATE_CHIPS: AxisOption[] = [
  { value: 'shorter', label: 'Shorter', hint: 'Cut at least a third. Keep the sharpest sentences, lose the connective tissue.' },
  { value: 'sharper-hook', label: 'Sharper hook', hint: 'Rewrite only the opening so the first sentence makes the reader feel mid-argument. No context-setting.' },
  { value: 'more-data', label: 'More data', hint: 'Ground more claims in specific numbers, named companies, dated events. Never invent — flag gaps instead.' },
  { value: 'harder-verdict', label: 'Harder ending', hint: 'Replace the ending with a hard, forward-looking verdict. No summary, no question, no CTA.' },
]

// ── Channels & lanes (Phase 3 + 7) ───────────────────────────────────────
// Two taxonomies in the OS:
//  - LANES: how variants are GENERATED (system_config.content_lane_* voice configs)
//  - FACTORY_CHANNELS: what the Omnichannel Content Factory accepts for final polish
// They overlap but are not identical, so we map lane -> factory channel.

export interface LaneDef {
  /** lane key as stored on content_ideas.lane and in system_config */
  lane: string
  /** optional slot for lanes that have one (mindmaker) */
  slot?: string
  label: string
  gear: 'A' | 'B'
  /** the content-factory target_channel this lane polishes into */
  factoryChannel: FactoryChannel
}

// ── Venture / format / channel (Krish, 2026-08-06) ────────────────────────
// Three layers, deliberately separate, because they used to be two:
//   VENTURE  what am I working on?     picked FIRST
//   FORMAT   what shape is this?       picked second, scoped to the venture
//   CHANNEL  where does it go?         picked LAST, multi-select
// Before this, `lane` fused venture and channel, which is why signal_noise and
// builder_economy existed as BOTH a venture and a lane, and why Instagram was
// buried inside a venture value ('builder_economy_ig'). A channel is never a
// venture again.

/** Media ventures: the ones that produce content. Mirrors venture_registry
 *  where kind='media'. Product ventures (ctrl, circle, pulse...) also publish,
 *  but through these. */
export type MediaVenture = 'mymu' | 'signal_noise' | 'builder_economy'

export interface VentureFormat {
  venture: MediaVenture
  slot: string
  label: string
  hero?: boolean
  gear: 'A' | 'B'
  /** corpus playbook key (api/_content CHANNEL_HEADING). */
  corpusKey: string
}

/** Mirrors the `venture_formats` table. The composer picks one of these AFTER
 *  the venture and BEFORE the channels. */
export const VENTURE_FORMATS: VentureFormat[] = [
  { venture: 'mymu', slot: 'teardown', label: 'MYMU: Teardown', hero: true, gear: 'A', corpusKey: 'investigation' },
  { venture: 'mymu', slot: 'weekly', label: 'Make Your Mind Up', gear: 'A', corpusKey: 'mymu_weekly' },
  { venture: 'mymu', slot: 'built', label: 'MYMU: Built', gear: 'B', corpusKey: 'built' },
  { venture: 'signal_noise', slot: 'episode', label: 'Signal & Noise episode', gear: 'B', corpusKey: 'signal_noise' },
  { venture: 'builder_economy', slot: 'episode', label: 'Builder Economy episode', gear: 'B', corpusKey: 'built' },
]

export const MEDIA_VENTURES: { value: MediaVenture; label: string }[] = [
  { value: 'mymu', label: 'MYMU' },
  { value: 'signal_noise', label: 'Signal & Noise' },
  { value: 'builder_economy', label: 'Builder Economy' },
]

export function formatsForVenture(v?: string | null): VentureFormat[] {
  return VENTURE_FORMATS.filter(f => f.venture === v)
}

/** Distribution surfaces. Mirrors the `media_channels` table. Multi-select:
 *  one piece is produced once and lifted to several of these. */
export type MediaChannel =
  | 'substack' | 'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'podcast'

export const MEDIA_CHANNELS: { value: MediaChannel; label: string; shortForm: boolean }[] = [
  { value: 'substack', label: 'Substack', shortForm: false },
  { value: 'instagram', label: 'Instagram', shortForm: true },
  { value: 'tiktok', label: 'TikTok', shortForm: true },
  { value: 'youtube', label: 'YouTube', shortForm: false },
  { value: 'linkedin', label: 'LinkedIn', shortForm: true },
  { value: 'podcast', label: 'Podcast', shortForm: false },
]

/** Default distribution per format, so the composer pre-ticks the sane set. */
export const DEFAULT_CHANNELS: Record<string, MediaChannel[]> = {
  'mymu:teardown': ['substack', 'linkedin'],
  'mymu:weekly': ['substack', 'instagram', 'tiktok', 'youtube', 'linkedin'],
  'mymu:built': ['substack', 'instagram', 'tiktok', 'youtube'],
  'signal_noise:episode': ['podcast', 'youtube', 'linkedin'],
  'builder_economy:episode': ['podcast', 'instagram', 'tiktok', 'youtube'],
}

// The factory channel is what the Omnichannel Content Factory polishes INTO.
// It is a production target, not a distribution surface, and it is kept
// separate from MediaChannel on purpose.
export type FactoryChannel =
  | 'signal_noise' | 'makeyourmindup' | 'linkedin'
  | 'builder_economy' | 'vertical_video' | 'dynamic'

export const FACTORY_CHANNELS: { value: FactoryChannel; label: string }[] = [
  { value: 'signal_noise', label: 'Signal & Noise' },
  { value: 'makeyourmindup', label: 'MYMU' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'builder_economy', label: 'Built' },
  { value: 'vertical_video', label: 'Vertical Video' },
]

// The variant toggles. `lane` now carries the VENTURE and `slot` the FORMAT,
// which is why 'builder_economy_ig' is gone: Instagram was a channel wearing a
// venture's clothes, and it now lives in MEDIA_CHANNELS where it belongs.
export const LANES: LaneDef[] = [
  { lane: 'mymu', slot: 'teardown', label: 'MYMU: Teardown', gear: 'A', factoryChannel: 'makeyourmindup' },
  { lane: 'mymu', slot: 'weekly', label: 'Make Your Mind Up', gear: 'A', factoryChannel: 'makeyourmindup' },
  { lane: 'mymu', slot: 'built', label: 'MYMU: Built', gear: 'B', factoryChannel: 'builder_economy' },
  { lane: 'signal_noise', slot: 'episode', label: 'Signal & Noise episode', gear: 'B', factoryChannel: 'signal_noise' },
  { lane: 'builder_economy', slot: 'episode', label: 'Builder Economy episode', gear: 'B', factoryChannel: 'builder_economy' },
]

// ── Adapt-to-lane (composer Refine) ──────────────────────────────────────
// Krish's note: "transforming into another lane should already come with a tone
// change, a length change, and different zooms." So adapting to a lane is just a
// rich revise of the CURRENT draft toward that lane's gear — one draft he keeps
// iterating, not a scattered new card. Each preset bundles tone + length + zoom
// into a single steer handed to /revise.

export interface LaneAdapt { value: string; label: string; hint: string }

export const LANE_ADAPTS: LaneAdapt[] = [
  {
    value: 'linkedin',
    label: 'LinkedIn',
    hint: 'Adapt this for LinkedIn. Compress to 150-250 words. Open on a scroll-stopping claim or scene, no context-setting. Builder-in-the-room voice (Gear B), one sharp angle, end on a hard verdict. No hashtags, no "thoughts?" closer.',
  },
  {
    value: 'signal_noise',
    label: 'Signal & Noise',
    hint: 'Adapt this for the Signal & Noise audience. Exec-to-exec authority (Gear A), ~300-500 words, separate the durable signal from the noise, name what most people get wrong ("Not X, Y"), commercially grounded, hard verdict ending.',
  },
  {
    value: 'makeyourmindup',
    label: 'MYMU',
    hint: 'Adapt this for MYMU. Teaching voice (Gear A), ~400-700 words, every paragraph advances the argument and carries a so-what, ground claims in the artifact, end on a forward verdict.',
  },
  {
    value: 'mymu_teardown',
    label: 'MYMU: Teardown',
    hint: 'Adapt this into a MYMU: Teardown, the investigative register that came over from Techonomic. Take one load-bearing claim apart and check each part against dated evidence. Attribute every number to the party that produced it. Hold one genuine counterpoint. Say plainly where the knowable record ends rather than papering over it, and end on the terminal question the evidence actually leaves open. No summary ending, no vendor framing.',
  },
  {
    value: 'builder_economy',
    label: 'Builder Economy (IG)',
    hint: 'Adapt this for Builder Economy on Instagram. Punchy, builder-in-the-room (Gear B), short stacked lines that read well on mobile, one idea, a concrete artifact, a verdict that lands. No corporate tone.',
  },
]

// Lane values that no longer exist but are still stored on rows. Techonomic was
// retired 2026-08-06 and folded into MYMU, and 'mindmaker_live' was the interim
// value its rows were re-laned to before the channel itself was renamed to
// 'makeyourmindup' the same day. Both map forward, never rejected.
const LEGACY_LANE_CHANNEL: Record<string, FactoryChannel> = {
  techonomic: 'makeyourmindup',
  mindmaker_live: 'makeyourmindup',
  makeyourmindup: 'makeyourmindup',
  // 'mindmaker' was the lane before MYMU became its own venture (2026-08-06).
  mindmaker: 'makeyourmindup',
  // Instagram was buried inside this venture value; it is a channel now.
  builder_economy_ig: 'builder_economy',
}

/** Map a generated variant's lane (+slot) onto a content-factory channel. */
export function laneToFactoryChannel(lane?: string | null, slot?: string | null): FactoryChannel {
  const hit = LANES.find(l => l.lane === lane && (l.slot || null) === (slot || null))
    || LANES.find(l => l.lane === lane)
  if (hit) return hit.factoryChannel
  return (lane && LEGACY_LANE_CHANNEL[lane]) || 'dynamic'
}

// ── The Five Standards (Phase 6) ─────────────────────────────────────────
// From content-corpus. Scored 1-5 server-side; surfaced as a gate that WARNS
// but never blocks Push-to-Cleo (decision 2026-06-11).

export const FIVE_STANDARDS = [
  { key: 'unique', label: 'Undeniably unique', watch: true },
  { key: 'researched', label: 'Well-researched', watch: false },
  { key: 'thoughtful', label: 'Thoughtful', watch: false },
  { key: 'kind', label: 'Kind', watch: true },
  { key: 'helpful', label: 'Helpful', watch: false },
] as const

export type StandardKey = typeof FIVE_STANDARDS[number]['key']

export interface StandardsScore {
  scores: Record<StandardKey, number>      // 1-5 each
  failing: StandardKey[]                    // < 3
  notes?: Partial<Record<StandardKey, string>>
  scored_at: string
}

/** A piece "passes the gate" if neither of the two watch standards fails.
 *  Accepts any object carrying a `scores` map (the row's meta.standards shape). */
export function gatePasses(s?: { scores?: Record<string, number> } | null): boolean {
  if (!s || !s.scores) return true
  return !FIVE_STANDARDS.some(st => st.watch && (s.scores?.[st.key] ?? 5) < 3)
}
