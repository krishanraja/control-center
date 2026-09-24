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
// So this fetches ON DEMAND, when the Scores layer is opened, and never for a
// list. A list of seventy pieces would be seventy queries, which is the reason
// the desk shows the standing and the weakest judge and nothing else until
// asked.
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
        const rows = (data || []).map((r: Record<string, unknown>): JudgeVerdict => ({
          judge: String(r.judge ?? ''),
          score: typeof r.score === 'number' ? r.score : null,
          verdict: typeof r.verdict === 'string' ? r.verdict : null,
          theOneFix: typeof r.the_one_fix === 'string' ? r.the_one_fix : null,
          evidence: Array.isArray(r.evidence) ? r.evidence.filter((e): e is string => typeof e === 'string') : [],
          adversarial: ADVERSARIAL.has(String(r.judge ?? '')),
          deterministic: r.deterministic === true,
        })).filter(v => v.judge)
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
