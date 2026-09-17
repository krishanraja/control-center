import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ContentEngineRunRow } from '../lib/contentEngineSchedule'

/**
 * The crons' run ledger, newest first, and nothing else.
 *
 * `useContentV2` already reads this table, but it reads it alongside the brief,
 * the decisions, the shifts and 120 arc cards, because the Content tab wants
 * all of them. The critical-alert mark renders on EVERY tab and wants only this
 * one, so it gets its own read rather than pulling the whole content queue into
 * the top bar on every surface in the app.
 *
 * 300 rows: enough to find the last healthy run of all seventeen jobs even
 * after a week of daily failures.
 */
export function useContentEngineRuns() {
  const [runs, setRuns] = useState<ContentEngineRunRow[]>([])
  const alive = useRef(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('content_engine_runs')
      .select('job, status, reason, finished_at')
      .order('finished_at', { ascending: false })
      .limit(300)
    if (!alive.current) return
    setRuns((data as ContentEngineRunRow[]) || [])
  }, [])

  useEffect(() => {
    alive.current = true
    void load()
    return () => { alive.current = false }
  }, [load])

  return { runs, refresh: load }
}
