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
  /** The ranked list is on screen and the per-person reasons are still arriving. */
  explaining: boolean
  error: string | null
  transcript?: string
}

const EMPTY: SearchState = {
  results: [], restated: '', weak: false, degraded: [], loading: false, explaining: false, error: null,
}

// The request can never outlive this. Without it a stalled server left the
// spinner up forever, which is what "the search hangs" actually was.
const REQUEST_TIMEOUT_MS = 30_000
const EXPLAIN_TIMEOUT_MS = 30_000

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

  // Phase two. Merges `why_match` into rows that are already on screen. It is
  // deliberately silent on failure: the list is rendered and every row already
  // carries the stored `why_them`, so a missing sentence is a smaller loss than
  // an error banner over good results.
  const explain = useCallback(async (question: string, results: NetworkResult[], mine: number) => {
    const ids = results.slice(0, 12).map(r => r.contact_id)
    if (!question || !ids.length) { setState(s => ({ ...s, explaining: false })); return }
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), EXPLAIN_TIMEOUT_MS)
    try {
      const r = await fetch('/api/network/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, contact_ids: ids }),
        signal: ctrl.signal,
      })
      const j = await r.json().catch(() => ({})) as { explanations?: Record<string, string> }
      if (mine !== seq.current) return
      const map = j.explanations || {}
      setState(s => ({
        ...s,
        explaining: false,
        results: s.results.map(x => (map[x.contact_id] ? { ...x, why_match: map[x.contact_id] } : x)),
      }))
    } catch {
      if (mine === seq.current) setState(s => ({ ...s, explaining: false }))
    } finally {
      clearTimeout(tid)
    }
  }, [])

  const run = useCallback(async (
    path: string,
    body: Record<string, unknown> | Blob,
    extra?: Partial<SearchState>,
  ) => {
    const mine = ++seq.current
    setState(s => ({ ...s, loading: true, error: null, ...extra }))
    try {
      const isBlob = body instanceof Blob
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
      let r: Response
      try {
        r = await fetch(path, {
          method: 'POST',
          headers: isBlob ? { 'Content-Type': body.type || 'audio/webm' } : { 'Content-Type': 'application/json' },
          body: isBlob ? body : JSON.stringify(body),
          signal: ctrl.signal,
        })
      } finally {
        clearTimeout(tid)
      }
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
      const results = (j.results as NetworkResult[]) || []
      const question = typeof j.restated === 'string' ? j.restated : ''
      // Render the ranked list NOW. The per-person reasons are a second request
      // that fills in behind it; they used to be inline and cost ~25s, which on
      // a phone read as a hang rather than as thinking.
      const wantsExplain = !isBlob && results.length > 0 && !j.weak && path !== '/api/network/recommend'
      setState({
        results,
        restated: question,
        weak: Boolean(j.weak),
        degraded: (j.degraded as string[]) || [],
        loading: false,
        explaining: wantsExplain,
        error: null,
        transcript: typeof j.transcript === 'string' ? j.transcript : undefined,
      })
      if (wantsExplain) {
        const askedFor = (!isBlob && typeof (body as Record<string, unknown>).question === 'string'
          ? String((body as Record<string, unknown>).question) : question)
        void explain(askedFor, results, mine)
      }
    } catch (e: unknown) {
      if (mine !== seq.current) return
      const timedOut = (e as Error)?.name === 'AbortError'
      setState({
        ...EMPTY,
        error: timedOut
          ? 'That took too long and was stopped. Try a shorter question.'
          : 'Could not reach the network search.',
      })
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
