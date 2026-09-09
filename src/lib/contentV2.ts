// Content Engine v2 client layer (docs/CONTENT-ENGINE-V2-SPEC.md).
// This is the only Content surface. The build-time flag that used to choose
// between it and the retired triage surface is gone: a flag missing from one
// environment silently served a different product, and nothing errored.

import { publicSeriesLabel } from './publicSeries'

// ---------------------------------------------------------------------------
// The queue's week window.
//
// The spec (§R4/R7) describes a finite weekly deck: assemble Friday, review
// over the weekend, purge Monday. The read path never enforced it. With no
// week bound and `order(created_at asc).limit(30)`, the deck became a FIFO of
// the thirty OLDEST pending cards: on 2026-08-25 that was 74 pending rows, of
// which the visible thirty ran from 2026-W28 to 2026-W31, so W32/W33/W34 -
// including the current week's brief - could not be reached at all. The top
// card had been the same 2026-W28 brief review since 10 July.
//
// Two weeks, not one: the Monday purge runs at 14:00 UTC, so a Monday-morning
// look must still see the weekend's cards. Anything older than that has either
// been decided or been swept by api/purge/run.ts.
export const QUEUE_WEEK_SPAN = 2

/** ISO-8601 week label, '2026-W34'. Mirrors api/_weeks.ts (the API tsconfig is
 *  separate, so the client cannot import it). Zero-padded on purpose: labels
 *  compare lexicographically, which is what makes the `.gte('week', ...)`
 *  bound below a plain string comparison in Postgres. */
export function isoWeekLabel(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** The oldest week label the queue will show. `span` counts the current week,
 *  so span=1 is this week only and span=2 adds the one before it. */
export function earliestQueueWeek(span = QUEUE_WEEK_SPAN, now = new Date()): string {
  const back = new Date(now)
  back.setUTCDate(back.getUTCDate() - 7 * Math.max(0, span - 1))
  return isoWeekLabel(back)
}

export type ShiftStatus = 'proposed' | 'active' | 'fading' | 'retired' | 'library'
export type BriefStatus = 'assembling' | 'ready' | 'in_review' | 'approved' | 'pushed' | 'sent' | 'archived'
export type DecisionKind = 'brief_review' | 'shift_proposal' | 'shift_fading' | 'graduation' | 'purge_preview' | 'investigation'

export interface MomentumPoint {
  week: string
  momentum: number
  day_span: number
  source_count: number
  recent_count: number
}

export interface ShiftRow {
  id: string
  slug: string
  title: string
  summary: string
  implication: string
  /** FROZEN 2026-08-27. The pre-rewrite classification, kept as history. Three
   *  of its nine values (governance, security, proof) have no counterpart among
   *  the six lenses by design. Read `lens`, not this, to decide what surfaces. */
  category: string
  /** One of the six lenses, or null for a row the detector classified under the
   *  old vocabulary. Null is the discard signal: see `shiftIsOnBeat`. */
  lens?: string | null
  /** The tracked question this arc files under, or null when it matched none. */
  theme_id?: string | null
  /** 'built' | 'paid', or null when the detector has not classified it. */
  lane?: string | null
  status: ShiftStatus
  first_seen_on: string
  last_evidence_on: string | null
  momentum: number
  momentum_history: MomentumPoint[]
  day_span_total: number
  source_count_total: number
  story_count: number
  provenance: 'reconstructed' | 'lived' | 'mixed'
  decision: { action: string; at: string; note?: string | null } | null
  created_at: string
  updated_at: string
}

export interface ShiftEvidenceRow {
  id: string
  shift_id: string
  occurred_on: string
  headline: string
  source: string | null
  url: string | null
  provenance: 'reconstructed' | 'lived'
  week_label: string | null
}

export interface BriefHeadline {
  id: string
  headline: string
  why: string
  url: string | null
  source: string | null
}

// The brief's structured sections. `headlines` (the clues) and `meaning_md`
// (the investigation, read by the factory as the contrarian angle) are the
// original two keys and every stored brief has them. The rest arrived with the
// investigative shape (2026-08-08) and are absent on older briefs, so every
// reader must treat them as optional.
export interface BriefSections {
  headlines?: BriefHeadline[]
  stance?: 'contradicts' | 'confirms' | null
  belief?: string
  standfirst?: string
  consensus_md?: string
  meaning_md?: string
  next_year_md?: string
  position_md?: string
  /** @deprecated The brief's opinion section is `position_md`. This mirror is
   *  written by the assembler so briefs stored before 2026-08-12 still render;
   *  read `position_md` and fall back to this, never the other way round. */
  perspectives_md?: string
}

export interface WeeklyBriefRow {
  id: string
  week: string
  title: string | null
  status: BriefStatus
  sections: BriefSections
  body_md: string | null
  versions: Array<{ v: number; at: string; source: string; body_md?: string; restored_from?: number }>
  stats: Record<string, number | string>
  formats: Array<{ channel: string; doc_url: string | null; pushed_at: string }>
  assembled_at: string | null
  approved_at: string | null
  pushed_at: string | null
}

export interface ContentDecisionRow {
  id: string
  week: string
  kind: DecisionKind
  ref: string
  payload: Record<string, unknown>
  /** 'dismissed' is a ruling Krish made; 'archived' is a card that aged out
   *  unseen. Keeping them apart is what lets a later comparison ask about his
   *  taste without counting the engine's unreviewed output as rejections. */
  status: 'pending' | 'done' | 'dismissed' | 'archived'
  resolution: Record<string, unknown> | null
  created_at: string
}

// ── What counts as on-beat ───────────────────────────────────────────────
//
// The 2026-08-27 rewrite replaced nine categories with six lenses and said, in
// the migration itself, that the new vocabulary "exists to stop producing"
// governance, security and proof stories. It added the column and froze the old
// one. It never added the filter, so the detector kept writing the old
// categories with a null lens and every surface kept rendering them: on
// 2026-09-09, three of the five proposals awaiting a ruling were governance,
// security and orchestration, matching none of the eleven tracked questions.
//
// This is that missing filter, in one place so no surface can forget it. A null
// lens is not missing data to be tolerated, it is the detector saying this arc
// fits none of the six things Krish writes about.

export const LENS_LABEL: Record<string, string> = {
  pricing_packaging: 'Pricing and packaging',
  distribution_channel: 'Distribution',
  moat_defensibility: 'Moat',
  buyer_behaviour: 'Buyer behaviour',
  category_positioning: 'Category',
  build_practice: 'Build practice',
}

/** True when the detector placed this arc in one of the six lenses. Every
 *  surface that offers a ruling must filter on this; the register keeps the
 *  rest as history. */
export function shiftIsOnBeat(s: Pick<ShiftRow, 'lens'>): boolean {
  return Boolean(s.lens && LENS_LABEL[s.lens])
}

export type ShiftVerdict = 'accelerating' | 'steady' | 'fading' | 'new'

// Trajectory read from the momentum history: newest vs the trailing mean.
export function shiftVerdict(s: ShiftRow): ShiftVerdict {
  const h = Array.isArray(s.momentum_history) ? s.momentum_history : []
  if (s.status === 'fading') return 'fading'
  if (h.length < 2) return 'new'
  const latest = h[h.length - 1].momentum
  const prior = h.slice(0, -1)
  const mean = prior.reduce((a, p) => a + p.momentum, 0) / prior.length
  if (latest >= mean * 1.15) return 'accelerating'
  if (latest <= mean * 0.7) return 'fading'
  return 'steady'
}

export const VERDICT_LABEL: Record<ShiftVerdict, string> = {
  accelerating: 'Accelerating',
  steady: 'Steady drumbeat',
  fading: 'Fading',
  new: 'Newly tracked',
}

// The LIVE fan-out (ContentV2Tab -> BriefComposer). This is the list Krish
// actually sees when pushing content, which is why fixing v1's LANE_ADAPTS and
// SynthesisModal did not change what he was looking at: v2 was already the
// live system, and since 2026-09-07 it is the only one.
//
// Publication is a VENTURE with two formats and two registers, so offering
// it as one destination would be the same mistake as offering "Builder Economy
// IG", a channel wearing a venture's name. Fan out to FORMATS (paid, built)
// plus real distribution channels, never to the venture.
// `short` is the name used where the full label will not fit, notably the
// collapsed one-line fan-out summary on a phone. It exists so that summary can
// name every selected format instead of ellipsing after the first.
export const FACTORY_FANOUT: Array<{ channel: string; label: string; short: string; defaultOn: boolean }> = [
  // channel values are the n8n Omnichannel Content Factory wire contract and
  // stay stable; only the labels moved to the canon channel names (2026-08-29).
  { channel: 'paid', label: publicSeriesLabel('paid'), short: publicSeriesLabel('paid'), defaultOn: true },
  { channel: 'built', label: publicSeriesLabel('built'), short: publicSeriesLabel('built'), defaultOn: false },
  { channel: 'linkedin', label: 'LinkedIn post', short: 'LinkedIn', defaultOn: true },
  { channel: 'signal_noise', label: 'Signal & Noise', short: 'Signal & Noise', defaultOn: false },
]

export function monthLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** One arc's card for one week, with the scorer's verdict attached.
 *
 *  Losers are stored too. A blocked or unsurfaced arc keeps its reason, so
 *  "why is this not in my queue" is answerable and a quiet week is
 *  distinguishable from a week the job never ran. */
export interface ArcCardRow {
  id: string
  shift_id: string
  week: string
  headline: string | null
  what_changed: string | null
  why_now: string | null
  the_opening: string | null
  where_this_goes: string | null
  reader_decision: string | null
  format: string | null
  score: number | null
  components: Array<{ name: string; weight: number; value: number }>
  blocked: boolean
  blocks: string[]
  surfaced: boolean
  /** True when this card took one of the two slots held for arcs matching no
   *  tracked question. */
  reserved_slot: boolean
  surface_reason: string | null
  created_at: string
}
