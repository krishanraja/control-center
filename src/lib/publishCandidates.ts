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
  mindmaker_live: 'MYMU',
  makeyourmindup: 'MYMU',
  builder_economy_ig: 'Builder Economy (IG)',
  // Retired 2026-08-06: the Techonomic lane was folded into MYMU as the
  // MYMU: Teardown format. Stored rows still carry the old value, so label
  // them where they now live.
  techonomic: 'MYMU',
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

// ── The server-side judgment and build routes ─────────────────────────────
// resolve-ask judges the operator's typed intent against the queue (one Haiku
// call over a deterministic shortlist, server-side). build-one generates a
// real draft when nothing matches. Both degrade to null on any failure so the
// picker can fall back to the deterministic path; red mode never dead-ends.

const API = import.meta.env.VITE_API_URL ?? ''

/** An outreach artifact from the server inventory: a Gmail draft ready to
 *  send, or a person the existing draft-email routes can write to now. */
export interface OutreachCandidate {
  kind: 'email_draft' | 'lead' | 'guest'
  id: string
  entityType: 'lead' | 'guest' | 'customer' | null
  entityId: string | null
  name: string
  detail: string | null
  url: string | null
}

export interface AskResolution {
  intent: 'publish' | 'outreach'
  verdict: 'match' | 'no_match'
  candidate: PublishCandidate | null
  outreach: OutreachCandidate | null
  reason: string
}

export interface BuiltDraft {
  id: string
  idea: string
  lane: string | null
  reused: boolean
}

async function postJson(path: string, body: unknown, timeoutMs: number): Promise<any | null> {
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return null
    return json
  } catch {
    return null
  } finally {
    clearTimeout(tid)
  }
}

/** Judge the ask against the outstanding inventory. Null means the route
 *  failed; the picker falls back to the deterministic path. */
export async function resolveAsk(ask: string): Promise<AskResolution | null> {
  const json = await postJson('/api/pilot/resolve-ask', { ask }, 25000)
  if (!json) return null
  const c = json.candidate
  const o = json.outreach
  return {
    intent: json.intent === 'outreach' ? 'outreach' : 'publish',
    verdict: json.verdict === 'match' ? 'match' : 'no_match',
    candidate: c
      ? {
          id: c.id,
          idea: c.idea,
          state: c.state === 'approved' ? 'approved' : 'review',
          lane: c.lane ?? null,
          quality: c.quality ?? null,
          url: c.url ?? null,
          dueAt: c.dueAt ?? null,
          tier: c.tier === 'ready' ? 'ready' : 'near',
          score: typeof c.score === 'number' ? c.score : 0,
        }
      : null,
    outreach: o && o.kind && o.id
      ? {
          kind: o.kind,
          id: String(o.id),
          entityType: ['lead', 'guest', 'customer'].includes(o.entityType) ? o.entityType : null,
          entityId: o.entityId ? String(o.entityId) : null,
          name: String(o.name || 'the recipient'),
          detail: o.detail ? String(o.detail) : null,
          url: o.url ? String(o.url) : null,
        }
      : null,
    reason: typeof json.reason === 'string' ? json.reason : '',
  }
}

/** Fire the existing per-entity draft-email route: the build arm of the
 *  outreach lane. Returns the Gmail draft url when one landed. Null = failed. */
export async function draftOutreach(
  entityType: 'lead' | 'guest' | 'customer',
  entityId: string,
): Promise<{ url: string | null; subject: string | null } | null> {
  const base = entityType === 'customer' ? 'customers' : `${entityType}s`
  const json = await postJson(`/api/${base}/${entityId}/draft-email`, { intent: 'introduction' }, 75000)
  if (!json) return null
  return {
    url: json.draft_url ? String(json.draft_url) : null,
    subject: json.subject ? String(json.subject) : null,
  }
}

/** Build a fresh draft from the ask. 30-90s; null means the build failed. */
export async function buildOne(ask: string): Promise<BuiltDraft | null> {
  const json = await postJson('/api/pilot/build-one', { ask }, 75000)
  if (!json || !json.id) return null
  return {
    id: String(json.id),
    idea: String(json.idea || ''),
    lane: json.lane ?? null,
    reused: Boolean(json.reused),
  }
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
