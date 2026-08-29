import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface CriticalAlertRow {
  id: string
  workflow_id: string
  workflow_name: string | null
  detected_at: string
  tier: number
  failure_type: string
  detail: string | null
  run_count: number
  resolved_at: string | null
}

let cache: CriticalAlertRow[] = []
let loaded = false
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

async function fetchAll(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    const { data, error } = await supabase
      .from('silent_failures')
      .select('id,workflow_id,workflow_name,detected_at,tier,failure_type,detail,run_count,resolved_at')
      // tier >= 3, not tier == 4.
      //
      // api/health/fleet-reconcile.ts writes tier 2 and tier 3 and has never
      // written a tier 4, so this banner has been structurally empty since it
      // shipped: the query was correct, the tier it asked for does not exist.
      // Meanwhile the fleet has carried real tier-3 failures for weeks with
      // nothing on Home to say so.
      .gte('tier', 3)
      .is('resolved_at', null)
      .order('tier', { ascending: false })
      .order('detected_at', { ascending: false })
      // Fetch wider than we show: the sweep re-flags the same workflow on
      // every run, so ten rows can be three workflows repeated.
      .limit(60)
    if (error && error.code !== 'PGRST205') {
      console.warn('[useCriticalAlerts] fetch error', error.message)
    }
    // One row per workflow, keeping the most severe and most recent. Without
    // this the banner counts the same dead credential four times and reports
    // "+ 9 more critical alerts" for three real problems.
    const seen = new Set<string>()
    cache = ((data as CriticalAlertRow[]) || [])
      .filter(r => {
        const k = r.workflow_id || r.workflow_name || r.id
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .slice(0, 10)
    loaded = true
    notify()
    inflight = null
  })()
  return inflight
}

export function useCriticalAlerts() {
  const [, setVersion] = useState(0)

  useEffect(() => {
    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)
    if (!loaded) fetchAll()

    const channel = supabase
      .channel('silent-failures-critical')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'silent_failures', filter: 'tier=gte.3' }, () => {
        fetchAll()
      })
      .subscribe()

    const interval = window.setInterval(fetchAll, 60_000)

    return () => {
      listeners.delete(listener)
      supabase.removeChannel(channel)
      window.clearInterval(interval)
    }
  }, [])

  return { alerts: cache, loading: !loaded }
}
