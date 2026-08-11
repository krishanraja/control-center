import { useCallback, useRef, useState } from 'react'

// Client for /api/network/*.
//
// Unlike useRealtimeContacts, nothing is cached or filtered here. Ranking is the
// server's job — it holds the embeddings, the full-text index and the scorer,
// and it reaches all 10,670 people rather than the 1,000-row page PostgREST
// hands the browser. This hook only manages request state.

export interface ScoreBreakdown {
  s_semantic: number
  s_lexical: number
  s_constraint: number
  s_relationship: number
  s_actionability: number
  venture_multiplier: number
}

export interface NetworkResult extends ScoreBreakdown {
  contact_id: string
  full_name: string | null
  company: string | null
  title: string | null
  email: string | null
  linkedin_url: string | null
  who: string | null
  why_them: string | null
  hook: string | null
  risk: string | null
  roles: string[]
  surface_when: string[]
  network_tier: string
  best_channel: string | null
  reachable_via: string[]
  confidence: string
  intel_method: string
  seniority: string | null
  country: string | null
  industry: string | null
  venture_scores: Record<string, number>
  thin_evidence: boolean
  match_score: number
  query_relevance: number | null
  why_match?: string
}

export interface SearchState {
  results: NetworkResult[]
  /** One line stating what the server understood. Shown BEFORE the results so a
   *  misreading is caught by reading one sentence rather than by scanning
   *  twenty people. */
  restated: string
  /** The query signal was indistinguishable from noise. The results are still
   *  real people, ranked by relationship value; they just do not answer the
   *  question that was asked. */
  weak: boolean
  /** Which stages ran degraded (missing key, model failure). Surfaced rather
   *  than hidden: a silently worse ranking is harder to debug than a labelled
   *  one. */
  degraded: string[]
  loading: boolean
  error: string | null
  transcript?: string
}

const EMPTY: SearchState = {
  results: [], restated: '', weak: false, degraded: [], loading: false, error: null,
}

export interface Filters {
  venture?: string | null
  roles?: string[]
  tiers?: string[]
  minConfidence?: string | null
}

export function useNetworkSearch() {
  const [state, setState] = useState<SearchState>(EMPTY)
  // Requests are ordered, not cancelled: a slow first search must never
  // overwrite a fast second one.
  const seq = useRef(0)

  const run = useCallback(async (
    path: string,
    body: Record<string, unknown> | Blob,
    extra?: Partial<SearchState>,
  ) => {
    const mine = ++seq.current
    setState(s => ({ ...s, loading: true, error: null, ...extra }))
    try {
      const isBlob = body instanceof Blob
      const r = await fetch(path, {
        method: 'POST',
        headers: isBlob ? { 'Content-Type': body.type || 'audio/webm' } : { 'Content-Type': 'application/json' },
        body: isBlob ? body : JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({})) as Record<string, unknown>
      if (mine !== seq.current) return
      if (r.status === 401) {
        setState({ ...EMPTY, error: 'Session expired. Reload to unlock.' })
        return
      }
      if (!r.ok || j.ok === false) {
        setState({
          ...EMPTY,
          error: String(j.error || j.reason || `Search failed (${r.status})`),
          transcript: typeof j.transcript === 'string' ? j.transcript : undefined,
        })
        return
      }
      setState({
        results: (j.results as NetworkResult[]) || [],
        restated: String(j.restated || ''),
        weak: Boolean(j.weak),
        degraded: (j.degraded as string[]) || [],
        loading: false,
        error: null,
        transcript: typeof j.transcript === 'string' ? j.transcript : undefined,
      })
    } catch {
      if (mine !== seq.current) return
      setState({ ...EMPTY, error: 'Could not reach the network search.' })
    }
  }, [])

  const search = useCallback((question: string, f: Filters = {}) => run('/api/network/search', {
    question,
    venture: f.venture ?? null,
    roles: f.roles?.length ? f.roles : null,
    tiers: f.tiers?.length ? f.tiers : null,
    min_confidence: f.minConfidence ?? null,
    limit: 25,
  }), [run])

  const recommend = useCallback((venture: string, intent?: string) =>
    run('/api/network/recommend', { venture, intent, limit: 25 }), [run])

  const searchByVoice = useCallback((audio: Blob) =>
    run('/api/network/voice', audio), [run])

  const reset = useCallback(() => { seq.current++; setState(EMPTY) }, [])

  return { ...state, search, recommend, searchByVoice, reset }
}
