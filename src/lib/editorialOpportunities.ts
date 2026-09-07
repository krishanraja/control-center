import type { ContentIdeaRow } from '../hooks/useRealtimeContentIdeas'
import type { PublicSeriesKey } from './publicSeries'

export const EDITORIAL_SERIES = ['money_of_ai', 'built_with_ai'] as const
export type EditorialSeries = typeof EDITORIAL_SERIES[number]
export type EditorialStatus = 'eligible' | 'near_miss' | 'rejected' | 'no_angle'

export interface EditorialOpportunity {
  schema_version: 2
  series: EditorialSeries
  signal_id: string
  status: EditorialStatus
  title: string | null
  angle: string | null
  audience_problem: string | null
  why_now: string | null
  proposed_hook: string | null
  honest_payoff: string | null
  mechanism: string | null
  visual_proof: string | null
  source_mode: 'extract' | 'short_native' | null
  production_effort: 'low' | 'medium' | 'high' | null
  strongest_failure: string
  safer_version: string | null
  ambitious_version: string | null
  recommended_version: string | null
  recommendation_reason: string | null
  credible_contradiction: string
  source_urls: string[]
  corroboration: number
  hard_blocks: string[]
  soft_blocks: string[]
  growth: Record<string, number>
}

export interface EditorialDecision {
  status: 'approved' | 'passed'
  decided_at: string
  child_id?: string | null
  source_hash?: string | null
  override_reason?: string | null
}

type RecordLike = Record<string, unknown>

function record(value: unknown): RecordLike | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordLike : null
}

export function parseEditorialSeries(value: unknown): EditorialSeries | null {
  return EDITORIAL_SERIES.includes(value as EditorialSeries) ? value as EditorialSeries : null
}

export function editorialSeriesForKey(key: PublicSeriesKey): EditorialSeries {
  return key === 'paid' ? 'money_of_ai' : 'built_with_ai'
}

export function publicKeyForEditorialSeries(series: EditorialSeries): PublicSeriesKey {
  return series === 'money_of_ai' ? 'paid' : 'built'
}

export function slotForEditorialSeries(series: EditorialSeries): PublicSeriesKey {
  return publicKeyForEditorialSeries(series)
}

export function readEditorialOpportunity(idea: ContentIdeaRow, series: EditorialSeries): EditorialOpportunity | null {
  const meta = record(idea.meta)
  const radar = record(meta?.editorial_radar)
  if (radar?.schema_version !== 2) return null
  const lenses = record(radar.lenses)
  const candidate = record(lenses?.[series])
  if (!candidate || candidate.schema_version !== 2 || candidate.series !== series || candidate.signal_id !== idea.id) return null
  const status = candidate.status
  if (!['eligible', 'near_miss', 'rejected', 'no_angle'].includes(String(status))) return null
  return candidate as unknown as EditorialOpportunity
}

export function readEditorialDecision(idea: ContentIdeaRow, series: EditorialSeries): EditorialDecision | null {
  const meta = record(idea.meta)
  const radar = record(meta?.editorial_radar)
  const decisions = record(radar?.decisions)
  const decision = record(decisions?.[series])
  if (!decision || (decision.status !== 'approved' && decision.status !== 'passed') || typeof decision.decided_at !== 'string') return null
  return decision as unknown as EditorialDecision
}

export function opportunityScore(opportunity: EditorialOpportunity): number {
  const values = Object.values(opportunity.growth || {}).filter(Number.isFinite)
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

export function editorialOpportunityHref(ideaId: string, series: EditorialSeries): string {
  return `#/content?idea=${encodeURIComponent(ideaId)}&lens=${series}`
}
