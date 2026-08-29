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
  { value: 'mid', label: 'Mid (Built with AI)', hint: 'Tighten to ~400-700 words. Teaching voice, every paragraph advances the argument, each item carries a so-what.' },
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

// Analogy presets. The house already has a rule about analogies that nothing
// in the editor could act on: api/_ladder.ts:131 — "An analogy with no stated
// breaking point is a flourish, not evidence" — and the YouTube register asks
// for one carried the whole way, including through the part where it breaks.
// These make that a one-click move rather than something to type out each time.
// Sent as 'feedback' like ITERATE_CHIPS; the steer rides on `hint`.
export const ANALOGY_PRESETS: AxisOption[] = [
  { value: 'analogy-add', label: 'Add an analogy', hint: 'Introduce ONE analogy that makes the central mechanism easier to hold, and carry it through the whole piece rather than dropping it after the first mention. It must map to the actual mechanism, not just the mood. Say plainly where it stops working before the reader notices; an analogy with no stated breaking point is a flourish, not evidence. Do not add a second analogy.' },
  { value: 'analogy-carry', label: 'Carry it further', hint: 'An analogy is already here. Extend it through the sections that currently drop it, so the same frame does the explaining all the way down. Do not introduce a competing analogy, and do not stretch it past the point where it still maps to the mechanism.' },
  { value: 'analogy-break', label: 'Break it honestly', hint: 'Find the analogy in this piece and say out loud where it stops working, in the place a sharp reader would first push back. Name the specific way the mapping fails and what the real mechanism does instead. This should strengthen the argument, not hedge it.' },
  { value: 'analogy-cut', label: 'Cut the analogy', hint: 'The analogy here is doing less work than the plain statement would. Remove it and say the thing directly, keeping every fact and the argument intact. Do not replace it with a different figure of speech.' },
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
  /** optional slot for lanes that have one (mindmake) */
  slot?: string
  label: string
  gear: 'A' | 'B'
  /** the content-factory target_channel this lane polishes into */
  factoryChannel: FactoryChannel
}

// ── Venture / format / channel (Krish, 2026-08-06; refocused 2026-08-11) ──
// Three layers, deliberately separate, because they used to be two:
//   VENTURE  what am I working on?     picked FIRST
//   FORMAT   what shape is this?       picked second, scoped to the venture
//   CHANNEL  where does it go?         picked LAST, multi-select
// Before this, `lane` fused venture and channel, which is why signal_noise and
// builder_economy existed as BOTH a venture and a lane, and why Instagram was
// buried inside a venture value ('builder_economy_ig'). A channel is never a
// venture again.
//
// REFOCUS 2026-08-11. All content now publishes under ONE media venture,
// the publication, the content arm of the Mindmake advisory, at
// live.themindmaker.ai. It has exactly two signature formats:
//   PAID   the investigation, folding in Techonomic's investigative register
//   BUILT  builder conversations, folding in the Builder Economy thesis
// Three things went, and none of them are coming back as a venture:
//   - MYMU. "Make Your Mind Up" is now the lead magnet and URL into the CTRL
//     app at makeyourmindup.ai. It is a product surface, not a content brand,
//     so it is absent from this file by design.
//   - Builder Economy. Fully retired, feed and all.
//   - Signal & Noise. Demoted from venture to distribution CHANNEL: it is a
//     co-hosted feed that carries the publication material. Nothing is
//     commissioned "for" it, which is why it now sits in MEDIA_CHANNELS.

/** Media ventures: the ones that produce content. Mirrors venture_registry
 *  where kind='media'. Product ventures (mm_ctrl, fractionl_circle,
 *  fractionl_pulse, full_time) also publish, but through this one. */
export type MediaVenture = 'publication'

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
  { venture: 'publication', slot: 'money_of_ai', label: 'The Money of AI', hero: true, gear: 'A', corpusKey: 'money_of_ai' },
  { venture: 'publication', slot: 'built_with_ai', label: 'Built with AI', gear: 'B', corpusKey: 'built_with_ai' },
]

export const MEDIA_VENTURES: { value: MediaVenture; label: string }[] = [
  { value: 'publication', label: 'the publication' },
]

export function formatsForVenture(v?: string | null): VentureFormat[] {
  return VENTURE_FORMATS.filter(f => f.venture === v)
}

/** Distribution surfaces. Mirrors the `media_channels` table. Multi-select:
 *  one piece is produced once and lifted to several of these. */
export type MediaChannel =
  | 'substack' | 'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'podcast'
  | 'signal_noise'

export const MEDIA_CHANNELS: { value: MediaChannel; label: string; shortForm: boolean }[] = [
  { value: 'substack', label: 'Substack', shortForm: false },
  { value: 'instagram', label: 'Instagram', shortForm: true },
  // TikTok is deliberately absent from the SELECTABLE list while it has no
  // register in the corpus: a channel you can tick but never cut for is a
  // checkbox that does nothing. It stays in MediaChannel above so stored rows
  // still type-check, and media_channels.active is false to match.
  { value: 'youtube', label: 'YouTube', shortForm: false },
  { value: 'linkedin', label: 'LinkedIn', shortForm: true },
  { value: 'podcast', label: 'Podcast', shortForm: false },
  // Demoted from venture to channel 2026-08-11. Co-hosted with Rio Longacre
  // and Brett House; the feed, its GUID and its subscribers are deliberately
  // untouched, and no public repositioning of the show has been made.
  { value: 'signal_noise', label: 'Signal & Noise', shortForm: false },
]

/** Default distribution per format, so the composer pre-ticks the sane set. */
export const DEFAULT_CHANNELS: Record<string, MediaChannel[]> = {
  'publication:money_of_ai': ['substack', 'linkedin'],
  'publication:built_with_ai': ['substack', 'instagram', 'youtube', 'signal_noise'],
}

// The factory channel is what the Omnichannel Content Factory polishes INTO.
// It is a production target, not a distribution surface, and it is kept
// separate from MediaChannel on purpose.
// NOTE: these values are a WIRE CONTRACT with the Omnichannel Content Factory
// in n8n cloud, which switches on `target_channel`. They are renamed here and
// in the factory together; changing one side alone silently drops a piece into
// the factory's fallback branch.
// This namespace deliberately mixes the two FORMATS (paid, built) with real
// distribution surfaces (linkedin, signal_noise, vertical_video), because the
// factory produces a draft styled FOR a destination. That is not the same list
// as MEDIA_CHANNELS and must not be collapsed into it.
export type FactoryChannel =
  | 'paid' | 'built' | 'linkedin' | 'signal_noise'
  | 'vertical_video' | 'dynamic'

export const FACTORY_CHANNELS: { value: FactoryChannel; label: string }[] = [
  { value: 'paid', label: 'The Money of AI' },
  { value: 'built', label: 'Built with AI' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'signal_noise', label: 'Signal & Noise' },
  { value: 'vertical_video', label: 'Vertical Video' },
]

// The variant toggles. `lane` now carries the VENTURE and `slot` the FORMAT,
// which is why 'builder_economy_ig' is gone: Instagram was a channel wearing a
// venture's clothes, and it now lives in MEDIA_CHANNELS where it belongs.
export const LANES: LaneDef[] = [
  { lane: 'publication', slot: 'money_of_ai', label: 'The Money of AI', gear: 'A', factoryChannel: 'paid' },
  { lane: 'publication', slot: 'built_with_ai', label: 'Built with AI', gear: 'B', factoryChannel: 'built' },
]

// ── Adapt-to-lane (composer Refine) ──────────────────────────────────────
// Krish's note: "transforming into another lane should already come with a tone
// change, a length change, and different zooms." So adapting to a lane is just a
// rich revise of the CURRENT draft toward that lane's gear — one draft he keeps
// iterating, not a scattered new card. Each preset bundles tone + length + zoom
// into a single steer handed to /revise.

export interface LaneAdapt { value: string; label: string; hint: string }

// CONSTRAINT: `value` is used verbatim as the corpus lookup key by
// api/content-ideas/[id]/revise.ts (corpusForChannel(corpus, adaptMatch[1])).
// It MUST be a key in CHANNEL_HEADING in api/_content.ts, or the adapt
// silently loses its channel corpus and degrades to a generic rewrite.
// TWO LISTS, NOT ONE (2026-08-13). These used to be a single flat array that
// mixed formats (Paid, Built) with channels (LinkedIn, Signal & Noise), which
// is exactly the fusion the venture/format/channel split above exists to stop.
// Picking "Paid" and picking "LinkedIn" answer different questions: the first
// changes what the piece IS, the second changes what shape it takes on the way
// out. Offering them in one row invited picking one and believing you had
// answered both.

/** What the piece IS. Changes the argument's register and its evidence bar. */
export const FORMAT_ADAPTS: LaneAdapt[] = [
  // the publication is a venture, never an adapt target. Adapting to the
  // venture was meaningless: it has two formats with two different registers,
  // and offering the venture as one option is what made the composer feel
  // stale. Adapt to a FORMAT.
  {
    value: 'money_of_ai',
    label: 'The Money of AI',
    hint: 'Adapt this into a Paid piece, the investigative register that came over from Techonomic. Follow the money: who pays, who collects, and what the shift does to pricing, unit economics, positioning and human labour. Take one load-bearing claim apart and check each part against dated evidence. Attribute every number to the party that produced it. Hold one genuine counterpoint. Say plainly where the knowable record ends rather than papering over it, and end on the terminal question the evidence actually leaves open. No summary ending, no vendor framing. The register is dry and sarcastic; the evidence handling is not. The joke is never the finding.',
  },
  {
    value: 'built_with_ai',
    label: 'Built with AI',
    hint: 'Adapt this into a Built piece. A conversation with someone who actually built something in the AI era, dug past what they built to why they really built it. Gear B, generous and human, 400-800 words. This is the format where the house sarcasm dials down: aim any irony at the industry around the builder, never at the builder. The guest must finish the piece looking more human, not more foolish.',
  },
]

/** Where the piece GOES. Changes length, register and scaffolding, never the
 *  argument. Each of these has its own playbook section in the corpus (## 5
 *  Substack through ## 9 Podcast, plus ## 3 Signal & Noise) and its own key in
 *  CHANNEL_HEADING, so the server-side corpusForChannel lookup returns a real
 *  register instead of falling through to the generic one-paragraph synopsis.
 *  Before 2026-08-13 only LinkedIn and Signal & Noise existed here, and
 *  LinkedIn's corpus key pointed at the Built playbook, so it had no register
 *  of its own either. */
export const CHANNEL_ADAPTS: LaneAdapt[] = [
  {
    value: 'substack',
    label: 'Substack',
    hint: 'Adapt this for Substack, the long-form home. Expand to 1200-2500 words: this reader already chose to give it fifteen minutes, so attention is not the constraint and the evidence gets room. Sub-headings that are claims, not labels. Take the load-bearing claim apart and check each part separately, with dates and named parties. Hold one genuine counterpoint properly rather than knocking it down. Say plainly what is still unknown. End on a verdict, not a summary. Never pad: if there is not more evidence, there is not more piece.',
  },
  {
    value: 'linkedin',
    label: 'LinkedIn',
    hint: 'Adapt this for LinkedIn. Compress to 150-250 words, one idea instead of four. Open mid-argument so the reader feels they walked into a conversation already happening, no context-setting. Short paragraphs, one or two sentences each, white space doing structural work. Cut context first and keep specifics: a named company, a number and a date survive. Builder-in-the-room voice (Gear B), end on a hard verdict. No hashtags, no "thoughts?" closer, no "here is what I learned" preamble, no hook-line-gap pattern. If it will not fit, narrow the claim, never vague it.',
  },
  {
    value: 'youtube',
    label: 'YouTube script',
    hint: "Turn this into a YouTube script in Krish's spoken first person, 700-1300 words, roughly five to nine minutes. Genuinely spoken, not an essay read aloud: contractions, asides, sentences a person can say in one breath. Plain words even where the idea is not, and expand every acronym once. Pick ONE analogy and carry it the whole way, including through the part where it breaks, and say out loud where it stops working. Dry humour that makes the next idea easier to hold, aimed at the industry, the hype or Krish himself, never at the viewer for not knowing. Open in ten seconds on the surprising claim, no \"hey guys\", no \"in today's video\". Mark the beats. It has to pass a read-aloud test.",
  },
  {
    value: 'instagram',
    label: 'Instagram',
    hint: 'Adapt this into an Instagram post about one genuinely surprising or genuinely encouraging shift in AI, shown through what it does to a real business. A hook line, four to eight short beats each readable in about a second, then a close. Propose a visual: the number, the before and after, or the object in the story. The honesty constraint is load-bearing: it rests on something specific and checkable, a named company, a real number, a dated change. Inspiring without a fact is a poster. Not a tip list, not definitions, not a prediction: the shift has already happened, which is what makes it worth showing. Open on the surprising fact itself with no framing in front of it.',
  },
  {
    value: 'podcast',
    label: 'Podcast',
    hint: 'Adapt this into a podcast script for the the publication feed, 800-1500 words for a solo read. Spoken register with no picture doing any work: everything the eye would have carried has to be said, so describe the number and then say what it means. No sentence that depends on punctuation the ear cannot hear, so parentheses, semicolons and nested clauses become separate sentences. Repeat names and numbers once, because a listener cannot scroll back. Drop in mid-thought on the sharpest thing in the piece, no "welcome back". Mark the beats.',
  },
  {
    value: 'signal_noise',
    label: 'Signal & Noise',
    hint: 'Adapt this for the Signal & Noise audience. Exec-to-exec authority (Gear A), ~300-500 words, separate the durable signal from the noise, name what most people get wrong ("Not X, Y"), commercially grounded, hard verdict ending. The adversarial register belongs to the room, not the research: the finding still comes from the source format\'s evidence bar. Devil\'s-advocate the idea, never sneer at the people who hold it.',
  },
]

/** Legacy flat list, formats first. Kept so existing call sites keep compiling;
 *  new UI should render FORMAT_ADAPTS and CHANNEL_ADAPTS as separate groups. */
// ── Video scripts ────────────────────────────────────────────────────────
// Six lengths, 15 seconds to 20 minutes. The engine could already produce one
// video artifact (CHANNEL_ADAPTS.youtube: a single 700-1300 word spoken cut),
// which is one of these and not the others: a 15 second hook and a 20 minute
// investigation are different shapes, not one shape scaled.
//
// The picker lives here; the per-length STRUCTURE and the prompt live in
// api/_video.ts, because the server owns what gets asked of the model.
// scripts/check-video-formats.mts keeps the two lists in step.
export interface VideoFormatOption { id: string; label: string; seconds: number; words: number }

export const VIDEO_FORMATS: VideoFormatOption[] = [
  { id: '15s', label: '15 second hook', seconds: 15, words: 40 },
  { id: '30s', label: '30 seconds', seconds: 30, words: 80 },
  { id: '60s', label: '60 second reel', seconds: 60, words: 160 },
  { id: '3min', label: '3 minutes', seconds: 180, words: 450 },
  { id: '10min', label: '10 minutes', seconds: 600, words: 1500 },
  { id: '20min', label: '20 minutes', seconds: 1200, words: 3000 },
]

// ── One palette, both surfaces ───────────────────────────────────────────
// The 26 one-click edits above were rendered only by ContentComposer, so the
// weekly-brief editor shipped with four hardcoded chips and no way to reach
// the rest. Two components picking their own subsets is how that happened, so
// the grouping lives here now and both mount the same thing.
//
// `mode` is the revise mode the surface sends. 'humor' routes to the dedicated
// examples-driven prompt in api/_humor.ts (and a stronger model); everything
// else rides on `hint`.
export interface EditItem { label: string; mode: string; value: string; hint?: string }
export interface EditGroup { label: string; accent: string; items: EditItem[] }

export function editGroups(o?: {
  /** Current channel, so a piece is never offered "adapt to what you already are". */
  currentChannel?: string | null
  /** Format adapts turn a piece INTO a Paid/Built piece. Meaningless for the
   *  weekly brief, which is the master that gets fanned out to both. */
  includeFormatAdapts?: boolean
  /** Channel cuts save against a piece's transformed_outputs, which a brief
   *  does not have. */
  includeChannelCuts?: boolean
  /** Video scripts. Both surfaces can produce them, so this defaults on. */
  includeVideo?: boolean
  /** Deep research. Runs against a content piece, which a brief is not. */
  includeDeepen?: boolean
}): EditGroup[] {
  const groups: EditGroup[] = [
    { label: 'Tone', accent: 'border-rose-500/30 text-rose-200', items: TONE_PRESETS.map(x => ({ label: x.label, mode: 'tone', value: x.value, hint: x.hint })) },
    { label: 'Humor', accent: 'border-fuchsia-500/30 text-fuchsia-200', items: HUMOR_PRESETS.map(x => ({ label: x.label, mode: 'humor', value: x.value, hint: x.hint })) },
    { label: 'Length', accent: 'border-sky-500/30 text-sky-200', items: LENGTH_PRESETS.map(x => ({ label: x.label, mode: 'length', value: x.value, hint: x.hint })) },
    { label: 'Sharpen', accent: 'border-amber-500/30 text-amber-200', items: [
      ...ITERATE_CHIPS.map(x => ({ label: x.label, mode: 'feedback', value: x.value, hint: x.hint })),
      { label: 'Sharpest angle', mode: 'zoom', value: 'contrarian-angle', hint: ZOOM_DEFAULT_HINT },
    ] },
    { label: 'Analogy', accent: 'border-emerald-500/30 text-emerald-200', items: ANALOGY_PRESETS.map(x => ({ label: x.label, mode: 'feedback', value: x.value, hint: x.hint })) },
  ]
  if (o?.includeFormatAdapts !== false) {
    groups.push({
      label: 'Change the format',
      accent: 'border-violet-500/30 text-violet-200',
      items: FORMAT_ADAPTS.filter(l => l.value !== o?.currentChannel).map(x => ({ label: x.label, mode: 'feedback', value: `adapt-${x.value}`, hint: x.hint })),
    })
  }
  if (o?.includeDeepen !== false) {
    // mode 'deepen' saves research against the piece rather than rewriting it.
    // Choosing a format used to change only how a piece was WRITTEN; this is
    // the format actually going and doing its own investigation first.
    groups.push({
      label: 'Deep research',
      accent: 'border-cyan-500/30 text-cyan-200',
      items: [
        { label: 'Paid: follow the money', mode: 'deepen', value: 'paid', hint: 'Investigate how the money moves and how it has SHIFTED: who pays, who collects, what the price was against what it is now, the effect on margin, how buying behaviour changed, and where the economics do not hold. Ends in a like-for-like comparison of at least two named approaches on the same axes.' },
        { label: 'Built: find who shipped it', mode: 'deepen', value: 'built', hint: 'Find people who actually built this. What they shipped, the stack, the cost, the time, what broke, and what it replaced. Ends in a like-for-like comparison of at least three real implementations on the same axes.' },
      ],
    })
  }
  if (o?.includeVideo !== false) {
    // mode 'video' is not a revise mode either: it routes to the video-script
    // path, which saves the script rather than previewing it over the draft.
    groups.push({
      label: 'Video script',
      accent: 'border-orange-500/30 text-orange-200',
      items: VIDEO_FORMATS.map(f => ({
        label: f.label,
        mode: 'video',
        value: f.id,
        hint: `Cut this into a spoken ${f.label} script, about ${f.words} words, with beats and shot notes.`,
      })),
    })
  }
  if (o?.includeChannelCuts !== false) {
    // mode 'channel' is not a revise mode: it routes to the channel-cut path,
    // which SAVES the cut against the piece instead of previewing it.
    groups.push({
      label: 'Cut for a channel',
      accent: 'border-teal-500/30 text-teal-200',
      items: CHANNEL_ADAPTS.map(x => ({ label: x.label, mode: 'channel', value: x.value, hint: x.hint })),
    })
  }
  return groups
}

export const LANE_ADAPTS: LaneAdapt[] = [...FORMAT_ADAPTS, ...CHANNEL_ADAPTS]

// Lane values that no longer exist but may still be stored on old rows. Every
// one maps FORWARD onto a live format so a historical row keeps a home on the
// board; none is ever rejected, and none is offered as a choice for new work.
// Note 'publication' is deliberately ABSENT: it is the live venture now, so
// it resolves through LANES above rather than through this table.
const LEGACY_LANE_CHANNEL: Record<string, FactoryChannel> = {
  // Retired 2026-08-06 into MYMU, then 2026-08-11 into the publication: Paid.
  techonomic: 'paid',
  // The MYMU venture and its channel slug. MYMU is a product surface now.
  makeyourmindup: 'paid',
  mymu: 'paid',
  // 'mindmake' was the content lane before the venture split.
  mindmaker: 'paid',
  mindmake: 'paid',
  // Instagram was buried inside this venture value; it is a channel now, and
  // the Builder Economy thesis lives on as the Built format.
  builder_economy_ig: 'built',
  builder_economy: 'built',
  // Signal & Noise stopped being a VENTURE, but it is still a real factory
  // destination (a channel), so a historical row keeps producing for it.
  signal_noise: 'signal_noise',
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
