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
      .eq('tier', 4)
      .is('resolved_at', null)
      .order('detected_at', { ascending: false })
      .limit(10)
    if (error && error.code !== 'PGRST205') {
      console.warn('[useCriticalAlerts] fetch error', error.message)
    }
    cache = (data as CriticalAlertRow[]) || []
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
      .channel('silent-failures-tier4')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'silent_failures', filter: 'tier=eq.4' }, () => {
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
