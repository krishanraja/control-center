import { useEffect, useState } from 'react'
import { CONTENT_ENGINE_JOBS } from '../lib/contentEngineSchedule'
import { requestJson } from '../lib/apiFetch'

// What the Content Engine says about itself.
//
// Since 2026-09-08 the crons run in the content-engine project, not here, and
// this dashboard reaches them through a rewrite. That leaves one thing that can
// drift silently: the schedule table this repo reads to say a job has gone
// quiet, and the schedule the engine actually runs. If a cron is added or moved
// there and not here, the strip nags about a job nobody scheduled, or stays
// silent about one that stopped.
//
// So the engine reports its own job list and this compares the two. The answer
// is a sentence on the tab, not a build failure: a dashboard that is one deploy
// behind the engine is normal for a minute and not worth blocking a build over,
// but it must never be invisible.

export interface EngineHealth {
  ok: boolean
  commit: string
  ready: boolean
  /** The jobs the engine's own vercel.json schedules. */
  jobs: string[]
  runner: { state: string; heartbeat_age_hours: number | null } | null
  missingRequired: string[]
}

export interface EngineHealthState {
  health: EngineHealth | null
  /** Set when this dashboard's schedule table and the engine's disagree. */
  scheduleDrift: string | null
  /** Set when the engine could not be reached or answered badly. */
  unreachable: string | null
  loading: boolean
}

export function useEngineHealth(): EngineHealthState {
  const [state, setState] = useState<EngineHealthState>({
    health: null, scheduleDrift: null, unreachable: null, loading: true,
  })

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const { json } = await requestJson<Record<string, unknown>>('/api/content-engine/health')
        if (!live) return
        const body = json ?? {}
        const jobs = Array.isArray(body.jobs)
          ? (body.jobs as Array<{ job?: unknown }>).map(j => String(j.job ?? '')).filter(Boolean)
          : []
        const mine = CONTENT_ENGINE_JOBS.map(j => j.job)
        const onlyEngine = jobs.filter(j => !mine.includes(j))
        const onlyHere = mine.filter(j => !jobs.includes(j))
        const drift = jobs.length && (onlyEngine.length || onlyHere.length)
          ? `This dashboard and the engine list different jobs${onlyEngine.length ? `. Only the engine runs: ${onlyEngine.join(', ')}` : ''}${onlyHere.length ? `. Only this list names: ${onlyHere.join(', ')}` : ''}.`
          : null
        setState({
          health: {
            ok: body.ok === true,
            commit: String(body.commit ?? 'unknown'),
            ready: body.ready === true,
            jobs,
            runner: (body.runner as EngineHealth['runner']) ?? null,
            missingRequired: Array.isArray(body.missing_required)
              ? (body.missing_required as Array<{ name?: unknown }>).map(m => String(m.name ?? '')).filter(Boolean)
              : [],
          },
          scheduleDrift: drift,
          unreachable: null,
          loading: false,
        })
      } catch (e) {
        if (!live) return
        // Not a red banner: the crons and the ledger are unaffected by this
        // read failing, and the strip still has the ledger rows to work from.
        setState({
          health: null, scheduleDrift: null, loading: false,
          unreachable: (e as Error)?.message || 'The engine did not answer',
        })
      }
    })()
    return () => { live = false }
  }, [])

  return state
}
