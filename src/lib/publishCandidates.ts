import { supabase } from './supabase'

// The publish queue, read the way red mode needs it: one artifact at a time,
// BEST first, not most-overdue first (decision 2026-08-04: cadence debt is not
// quality; the operator wants the strongest piece, not the oldest obligation).
//
// Ranking is deterministic and legible, no LLM: every signal the content
// engine already writes gets a weight, and the tunables sit in one editable
// block below, same maintenance path as pilotConcreteness.
//
// Two honesty rules. A piece failing a watch standard (unique or kind below 3)
// never surfaces at all, whatever else scores well. And a candidate that is
// not both approved and fresh is offered as tier "near", labeled as the
// closest thing rather than dressed up as ready, because a stale suggestion
// presented confidently costs trust on exactly the days trust matters most.

/** A candidate is "fresh" if touched within this many days. */
export const FRESH_DAYS = 14
/** How many candidates the picker can page through with "Not this one". */
export const SHORTLIST = 5

export type CandidateTier = 'ready' | 'near'

export interface PublishCandidate {
  id: string
  idea: string
  state: 'approved' | 'review'
  lane: string | null
  quality: 'green' | 'amber' | null
  /** External draft link only. In-app routes are useless from red mode: the
   *  gate owns the screen, so only a URL that opens outside it can be lived. */
  url: string | null
  dueAt: string | null
  /** ready: approved and fresh. near: real but honestly short of the bar. */
  tier: CandidateTier
  score: number
}

/** Display names for the brand lanes, kept local so the pilot layer does not
 *  pull the whole content engine into its bundle. Unknown lanes pass through. */
const LANE_LABELS: Record<string, string> = {
  signal_noise: 'Signal & Noise',
  mindmaker: 'Mindmaker',
  techonomic: 'Techonomic',
  builder_economy_ig: 'Builder Economy (IG)',
}

export function laneLabel(lane: string | null): string | null {
  if (!lane) return null
  return LANE_LABELS[lane] ?? lane
}

/** The text that becomes tomorrow's ONE when a candidate is accepted. Always
 *  contains a concrete verb, so it passes validateConcreteness by shape, and
 *  never overclaims: a near-tier piece says what the fifteen minutes really is. */
export function candidateActionText(c: PublishCandidate): string {
  const lane = laneLabel(c.lane)
  const verb = c.state === 'review'
    ? 'Finish and publish'
    : c.tier === 'near' ? 'Freshen and publish' : 'Publish'
  const base = `${verb} "${c.idea}"`
  return lane ? `${base} to ${lane}` : base
}

interface StandardsShape {
  scores?: Record<string, number>
}

interface CandidateRow {
  id: string
  idea: string
  state: string
  lane: string | null
  quality_score: 'green' | 'amber' | 'red' | null
  draft_link: string | null
  cadence_due_at: string | null
  updated_at: string | null
  brand_fit_score: number | null
  confidence: number | null
  standards: StandardsShape | null
}

/** Local copy of the content engine's watch-standard gate (contentEngine
 *  warns; here it excludes, because red mode surfaces exactly one piece and
 *  that piece must never be one the rubric flagged as not-unique or unkind). */
function failsWatchStandard(std: StandardsShape | null): boolean {
  const scores = std?.scores
  if (!scores) return false
  return (scores.unique ?? 5) < 3 || (scores.kind ?? 5) < 3
}

function ageDays(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY
  const ms = Date.now() - new Date(iso).getTime()
  return ms / (24 * 60 * 60 * 1000)
}

/**
 * Best-first, one number. Human approval is the strongest signal, then the
 * machine scores the engine already wrote: quality color, the "unique"
 * standard (the ask is literally timely and unique), brand fit, confidence.
 * Freshness pays a bonus; cadence debt pays nothing.
 */
export function readinessScore(r: CandidateRow): number {
  let s = 0
  if (r.state === 'approved') s += 30
  // Green beats unscored beats amber: an amber verdict is a known mediocre,
  // an unscored piece is merely unknown.
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

function toCandidate(r: CandidateRow): PublishCandidate {
  const fresh = ageDays(r.updated_at) <= FRESH_DAYS
  return {
    id: r.id,
    idea: r.idea.trim(),
    state: r.state === 'approved' ? 'approved' : 'review',
    lane: r.lane,
    quality: r.quality_score === 'red' ? null : r.quality_score,
    url: r.draft_link || null,
    dueAt: r.cadence_due_at,
    tier: r.state === 'approved' && fresh ? 'ready' : 'near',
    score: readinessScore(r),
  }
}

/** Ready tier first, then score descending, cadence as the last tie-break. */
function byBest(a: PublishCandidate, b: PublishCandidate): number {
  if (a.tier !== b.tier) return a.tier === 'ready' ? -1 : 1
  if (a.score !== b.score) return b.score - a.score
  if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt)
  if (a.dueAt) return -1
  if (b.dueAt) return 1
  return 0
}

/**
 * Fetch the best-first shortlist. Never throws: red mode must degrade to the
 * manual path on any failure, not dead-end behind a network error. An empty
 * result means nothing in the queue survives the exclusions (red quality,
 * failed watch standards, no draft), and the caller should say that honestly.
 */
export async function fetchPublishCandidates(limit = SHORTLIST): Promise<PublishCandidate[]> {
  try {
    const { data, error } = await supabase
      .from('content_ideas')
      .select('id, idea, state, lane, quality_score, draft_link, cadence_due_at, updated_at, brand_fit_score, confidence, standards:meta->standards')
      .in('state', ['approved', 'review'])
      .or('body.not.is.null,draft_link.not.is.null')
      .order('updated_at', { ascending: false })
      .limit(60)
    if (error || !data) return []
    return (data as unknown as CandidateRow[])
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
