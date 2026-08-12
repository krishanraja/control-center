// Content Engine v2 client layer (docs/CONTENT-ENGINE-V2-SPEC.md).
// Flag-gated: the four-room Content tab replaces triage only when
// VITE_CONTENT_V2_ENABLED is true at build time.

export function contentV2Enabled(): boolean {
  return String(import.meta.env.VITE_CONTENT_V2_ENABLED) === 'true'
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
  category: string
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
  status: 'pending' | 'done' | 'dismissed'
  resolution: Record<string, unknown> | null
  created_at: string
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

// The LIVE fan-out (ContentV2Tab -> BriefEditor). This is the list Krish
// actually sees when pushing content, which is why fixing v1's LANE_ADAPTS and
// SynthesisModal did not change what he was looking at: v2 is the live system
// and v1 does not render while VITE_CONTENT_V2_ENABLED is on.
//
// Mindmaker Live is a VENTURE with two formats and two registers, so offering
// it as one destination would be the same mistake as offering "Builder Economy
// IG", a channel wearing a venture's name. Fan out to FORMATS (paid, built)
// plus real distribution channels, never to the venture.
// `short` is the name used where the full label will not fit, notably the
// collapsed one-line fan-out summary on a phone. It exists so that summary can
// name every selected format instead of ellipsing after the first.
export const FACTORY_FANOUT: Array<{ channel: string; label: string; short: string; defaultOn: boolean }> = [
  { channel: 'paid', label: 'Paid', short: 'Paid', defaultOn: true },
  { channel: 'built', label: 'Built', short: 'Built', defaultOn: false },
  { channel: 'linkedin', label: 'LinkedIn post', short: 'LinkedIn', defaultOn: true },
  { channel: 'signal_noise', label: 'Signal & Noise', short: 'Signal & Noise', defaultOn: false },
]

export function monthLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}
