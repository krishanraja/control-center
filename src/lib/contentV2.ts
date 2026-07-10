// Content Engine v2 client layer (docs/CONTENT-ENGINE-V2-SPEC.md).
// Flag-gated: the four-room Content tab replaces triage only when
// VITE_CONTENT_V2_ENABLED is true at build time.

export function contentV2Enabled(): boolean {
  return String(import.meta.env.VITE_CONTENT_V2_ENABLED) === 'true'
}

export type ShiftStatus = 'proposed' | 'active' | 'fading' | 'retired' | 'library'
export type BriefStatus = 'assembling' | 'ready' | 'in_review' | 'approved' | 'pushed' | 'sent' | 'archived'
export type DecisionKind = 'brief_review' | 'shift_proposal' | 'shift_fading' | 'graduation' | 'purge_preview'

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

export interface WeeklyBriefRow {
  id: string
  week: string
  title: string | null
  status: BriefStatus
  sections: { headlines?: BriefHeadline[]; meaning_md?: string; perspectives_md?: string }
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

export const FACTORY_FANOUT: Array<{ channel: string; label: string; defaultOn: boolean }> = [
  { channel: 'mindmaker_live', label: 'Mindmaker LIVE', defaultOn: true },
  { channel: 'linkedin', label: 'LinkedIn post', defaultOn: true },
  { channel: 'techonomic', label: 'Techonomic essay', defaultOn: true },
  { channel: 'builder_economy', label: 'Builder Economy IG', defaultOn: false },
]

export function monthLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}
