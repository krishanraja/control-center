import { supabase } from './_supabase.js'

// Server-side twin of src/lib/publishCandidates.ts, for the pilot routes that
// need the shortlist with service-role context (resolve-ask judges against it,
// build-one uses it for lane recency). Scoring mirrors the client exactly:
// best first, cadence debt pays nothing. If the two drift, the client's file
// is the one Krish tunes; keep this one in step with it.

export const FRESH_DAYS = 14

export type CandidateTier = 'ready' | 'near'

export interface ServerCandidate {
  id: string
  idea: string
  thesis: string | null
  state: 'approved' | 'review'
  lane: string | null
  quality: 'green' | 'amber' | null
  url: string | null
  dueAt: string | null
  updatedAt: string | null
  tier: CandidateTier
  score: number
}

interface Row {
  id: string
  idea: string
  thesis: string | null
  state: string
  lane: string | null
  quality_score: 'green' | 'amber' | 'red' | null
  draft_link: string | null
  cadence_due_at: string | null
  updated_at: string | null
  brand_fit_score: number | null
  confidence: number | null
  standards: { scores?: Record<string, number> } | null
}

function failsWatchStandard(std: Row['standards']): boolean {
  const scores = std?.scores
  if (!scores) return false
  return (scores.unique ?? 5) < 3 || (scores.kind ?? 5) < 3
}

function ageDays(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY
  return (Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)
}

function readinessScore(r: Row): number {
  let s = 0
  if (r.state === 'approved') s += 30
  s += r.quality_score === 'green' ? 25 : r.quality_score === 'amber' ? 8 : 12
  const unique = r.standards?.scores?.unique
  if (typeof unique === 'number') s += unique * 3
  if (typeof r.brand_fit_score === 'number') s += r.brand_fit_score * 1.5
  if (typeof r.confidence === 'number') s += r.confidence * 10
  if (r.draft_link) s += 5
  const age = ageDays(r.updated_at)
  s += age <= 7 ? 10 : age <= FRESH_DAYS ? 6 : age <= 30 ? 2 : 0
  return s
}

function toCandidate(r: Row): ServerCandidate {
  const fresh = ageDays(r.updated_at) <= FRESH_DAYS
  return {
    id: r.id,
    idea: r.idea.trim(),
    thesis: r.thesis ? String(r.thesis).slice(0, 300) : null,
    state: r.state === 'approved' ? 'approved' : 'review',
    lane: r.lane,
    quality: r.quality_score === 'red' ? null : r.quality_score,
    url: r.draft_link || null,
    dueAt: r.cadence_due_at,
    updatedAt: r.updated_at,
    tier: r.state === 'approved' && fresh ? 'ready' : 'near',
    score: readinessScore(r),
  }
}

function byBest(a: ServerCandidate, b: ServerCandidate): number {
  if (a.tier !== b.tier) return a.tier === 'ready' ? -1 : 1
  if (a.score !== b.score) return b.score - a.score
  if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt)
  if (a.dueAt) return -1
  if (b.dueAt) return 1
  return 0
}

/** Best-first publishable shortlist. Same exclusions as the client: red
 *  quality never surfaces, watch-standard failures never surface, a draft must
 *  exist. Never throws; an empty array means nothing clears the bar. */
export async function fetchServerCandidates(limit = 8): Promise<ServerCandidate[]> {
  try {
    const { data, error } = await supabase
      .from('content_ideas')
      .select('id, idea, thesis, state, lane, quality_score, draft_link, cadence_due_at, updated_at, brand_fit_score, confidence, standards:meta->standards')
      .in('state', ['approved', 'review'])
      .or('body.not.is.null,draft_link.not.is.null')
      .order('updated_at', { ascending: false })
      .limit(60)
    if (error || !data) return []
    return (data as unknown as Row[])
      .filter(r => r.idea && r.idea.trim())
      .filter(r => r.quality_score !== 'red')
      .filter(r => !failsWatchStandard(r.standards))
      .map(toCandidate)
      .sort(byBest)
      .slice(0, limit)
  } catch {
    return []
  }
}
