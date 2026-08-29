import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Is the automation fleet actually running?
//
// This exists because of a sixteen-day outage nobody saw. The Status Update
// Receiver, which is what WRITES workflow_runs, was itself failing 100% of the
// time, so a 23% fleet-wide error rate recorded as perfect silence. Every
// health signal in the OS was derived from that same table, so the Control
// Center showed nothing wrong right up until someone noticed the content had
// stopped.
//
// The lesson is that a monitor sharing a dependency with the thing it monitors
// is not a monitor. So this check deliberately depends on NOTHING running: it
// reads the newest run_at and compares it to the clock. If the fleet dies
// again, including in a way that stops the recorder itself, the absence of rows
// IS the signal rather than the thing that hides it.

// The fleet's slowest routine cadence is hourly, so silence past three hours is
// not a quiet patch, it is a fault.
const STALE_AFTER_MS = 3 * 60 * 60 * 1000

export interface FleetLiveness {
  /** Newest workflow_runs.run_at, or null when the table is empty. */
  lastRunAt: string | null
  /** Milliseconds since the last recorded run; null when never. */
  silentForMs: number | null
  /** True once silence passes the threshold. */
  isStale: boolean
  loading: boolean
}

export function useFleetLiveness(): FleetLiveness {
  const [state, setState] = useState<FleetLiveness>({
    lastRunAt: null, silentForMs: null, isStale: false, loading: true,
  })

  useEffect(() => {
    let cancelled = false

    async function check() {
      const { data, error } = await supabase
        .from('workflow_runs')
        .select('run_at')
        .order('run_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return
      if (error && error.code !== 'PGRST205') {
        console.warn('[useFleetLiveness] fetch error', error.message)
        // An unreachable table is not evidence of a healthy fleet, but it is not
        // evidence of a dead one either. Stay quiet rather than cry wolf.
        setState(s => ({ ...s, loading: false }))
        return
      }

      const lastRunAt = (data as { run_at: string } | null)?.run_at ?? null
      const silentForMs = lastRunAt ? Date.now() - new Date(lastRunAt).getTime() : null
      setState({
        lastRunAt,
        silentForMs,
        // Never having run at all is also a fault, not a fresh start.
        isStale: silentForMs === null || silentForMs > STALE_AFTER_MS,
        loading: false,
      })
    }

    check()
    const interval = window.setInterval(check, 5 * 60_000)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [])

  return state
}
