import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// The eight judge scores for one piece.
//
// They are NOT on the idea row. meta.ladder carries the standing and the name
// of the weakest judge; the per-judge scores, each one's suggested fix and its
// cited evidence live in judge_verdicts, keyed on the panel run. That shape is
// deliberate: putting eight scores on every row would mean a second copy of the
// verdicts in a JSON column for a view most rows never open.
//
// So this fetches ON DEMAND, when the Scores layer is opened, and never one
// query per row. A list of seventy pieces would be seventy queries, which is
// the reason the desk shows the standing and the weakest judge and nothing
// else until asked.
//
// The one exception is `useJudgeVerdictsForRuns`: ONE query for one lane's
// ready pieces, because the standing alone cannot rank them. On 2026-09-24
// all 25 ready pieces stood at exactly 7, so the order had to come from the
// marks underneath (see readyStanding in src/lib/ladder.ts). It is bounded by
// the lane's ready list, about 25 runs of ten verdicts at most, and it is
// still one query rather than one per row.
//
// The prosecutor comes back with the rest and is flagged rather than filtered,
// because it argues for killing: folding its score into the range would make a
// strong objection read as a strong endorsement, which is the thing
// check-judges.ts forbids in the engine and which would be just as wrong here.

export interface JudgeVerdict {
  judge: string
  score: number | null
  verdict: string | null
  theOneFix: string | null
  evidence: string[]
  /** True for the prosecutor. Reported beside the panel, never inside it. */
  adversarial: boolean
  deterministic: boolean
}

export interface JudgeVerdictsState {
  verdicts: JudgeVerdict[]
  loading: boolean
  /** Said out loud rather than rendered as an empty panel. A layer that shows
   *  nothing because the fetch failed looks identical to one that shows nothing
   *  because the piece was never judged, and they mean opposite things. */
  error: string | null
}

const ADVERSARIAL = new Set(['prosecutor'])

export function useJudgeVerdicts(panelRunId: string | null, enabled: boolean): JudgeVerdictsState {
  const [state, setState] = useState<JudgeVerdictsState>({ verdicts: [], loading: false, error: null })

  useEffect(() => {
    if (!enabled || !panelRunId) { setState({ verdicts: [], loading: false, error: null }); return }
    let live = true
    setState(s => ({ ...s, loading: true, error: null }))
    supabase
      .from('judge_verdicts')
      .select('judge,score,verdict,the_one_fix,evidence,deterministic')
      .eq('panel_run_id', panelRunId)
      .then(({ data, error }) => {
        if (!live) return
        if (error) { setState({ verdicts: [], loading: false, error: error.message }); return }
        const rows = (data || []).map(toVerdict).filter(v => v.judge)
        // Weakest first: the judge holding a piece down is what a repair aims
        // at, so it is what the eye should land on. An abstention sorts last
        // rather than as a zero, because "could not read it" is not a low mark.
        rows.sort((a, b) => (a.score ?? 99) - (b.score ?? 99))
        setState({ verdicts: rows, loading: false, error: null })
      })
    return () => { live = false }
  }, [panelRunId, enabled])

  return state
}

/** Scores arrive as numbers from supabase-js, but a numeric column can come
 *  back as a string through some paths, and a string silently read as null
 *  would drop a judge from the ranking. */
function toScore(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return null
}

function toVerdict(r: Record<string, unknown>): JudgeVerdict {
  return {
    judge: String(r.judge ?? ''),
    score: toScore(r.score),
    verdict: typeof r.verdict === 'string' ? r.verdict : null,
    theOneFix: typeof r.the_one_fix === 'string' ? r.the_one_fix : null,
    evidence: Array.isArray(r.evidence) ? r.evidence.filter((e): e is string => typeof e === 'string') : [],
    adversarial: ADVERSARIAL.has(String(r.judge ?? '')),
    deterministic: r.deterministic === true,
  }
}

export interface JudgeVerdictsByRunState {
  byRun: Map<string, JudgeVerdict[]>
  loading: boolean
  error: string | null
}

/** Marks for a finished panel run never change: a re-judge is a new run with
 *  a new id. So they are kept for the life of the page. Without this, closing
 *  DecideCard remounted the ranked list with no marks, and it showed arrival
 *  order for a beat before reordering, which is the jump the decide surface
 *  exists to prevent. e2e/lane-ready.spec.ts caught it. */
const RUN_CACHE = new Map<string, JudgeVerdict[]>()

function fromCache(ids: string[]): Map<string, JudgeVerdict[]> {
  const out = new Map<string, JudgeVerdict[]>()
  for (const id of ids) {
    const hit = RUN_CACHE.get(id)
    if (hit) out.set(id, hit)
  }
  return out
}

/**
 * The marks for several panel runs in one query, keyed by run.
 *
 * For ranking a lane's ready pieces and nothing else. The detail view keeps
 * `useJudgeVerdicts`, which fetches one run when the Scores layer opens.
 * Only runs not already read on this page are fetched.
 */
export function useJudgeVerdictsForRuns(runIds: string[], enabled: boolean): JudgeVerdictsByRunState {
  // A stable key, so a new array holding the same ids does not refetch on
  // every render of the room.
  const key = [...new Set(runIds.filter(Boolean))].sort().join(',')
  const [state, setState] = useState<JudgeVerdictsByRunState>(
    () => ({ byRun: fromCache(key ? key.split(',') : []), loading: false, error: null }),
  )

  useEffect(() => {
    const ids = key ? key.split(',') : []
    if (!enabled || !ids.length) { setState({ byRun: new Map(), loading: false, error: null }); return }
    const missing = ids.filter(id => !RUN_CACHE.has(id))
    if (!missing.length) { setState({ byRun: fromCache(ids), loading: false, error: null }); return }
    let live = true
    setState({ byRun: fromCache(ids), loading: true, error: null })
    supabase
      .from('judge_verdicts')
      .select('panel_run_id,judge,score,verdict,the_one_fix,evidence,deterministic')
      .in('panel_run_id', missing)
      .then(({ data, error }) => {
        if (!live) return
        if (error) { setState({ byRun: fromCache(ids), loading: false, error: error.message }); return }
        const fetched = new Map<string, JudgeVerdict[]>(missing.map(id => [id, []]))
        for (const r of (data || []) as Array<Record<string, unknown>>) {
          const run = typeof r.panel_run_id === 'string' ? r.panel_run_id : null
          const v = toVerdict(r)
          if (!run || !v.judge || !fetched.has(run)) continue
          fetched.get(run)!.push(v)
        }
        for (const [run, rows] of fetched) RUN_CACHE.set(run, rows)
        setState({ byRun: fromCache(ids), loading: false, error: null })
      })
    return () => { live = false }
  }, [key, enabled])

  return state
}
