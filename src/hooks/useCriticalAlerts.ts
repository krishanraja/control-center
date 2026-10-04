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
  /**
   * The oldest open row this workflow has among those fetched: when the
   * current alert began. Derived here, not a column. Meaningful since
   * 2026-10-04, when api/health/fleet-reconcile.ts started resolving rows as
   * workflows recover. Before that every row stayed open forever, so the
   * oldest one dated from the first failure ever seen, not the current one.
   */
  first_detected_at: string
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
      //
      // Since 2026-10-04 an open tier-3 runtime_failing row means the workflow
      // is failing or dead NOW, judged on its recent production runs. The
      // reconcile resolves its rows once it recovers, and resolves the tier-3
      // ones alone once it drops to degraded, so nothing here has to second
      // guess a stale row.
      .gte('tier', 3)
      .is('resolved_at', null)
      .order('tier', { ascending: false })
      .order('detected_at', { ascending: false })
      // Fetch wider than we show: the reconcile re-flags a workflow once a day
      // for as long as it stays broken, so ten rows can be three workflows
      // repeated, and the oldest of them says when the alert began.
      .limit(200)
    if (error && error.code !== 'PGRST205') {
      console.warn('[useCriticalAlerts] fetch error', error.message)
    }
    // One row per workflow, keeping the most severe and most recent. Without
    // this the banner counts the same dead credential four times and reports
    // "+ 9 more critical alerts" for three real problems.
    const rows = (data as Omit<CriticalAlertRow, 'first_detected_at'>[]) || []
    const keyOf = (r: { workflow_id: string; workflow_name: string | null; id: string }) =>
      r.workflow_id || r.workflow_name || r.id
    const firstSeen = new Map<string, string>()
    const noteFirst = (k: string, at: string) => {
      const prev = firstSeen.get(k)
      if (!prev || Date.parse(at) < Date.parse(prev)) firstSeen.set(k, at)
    }
    for (const r of rows) noteFirst(keyOf(r), r.detected_at)
    const seen = new Set<string>()
    const shown = rows
      .filter(r => {
        const k = keyOf(r)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .slice(0, 10)
    // The rows above are the NEWEST 200, and a workflow that stays dead adds
    // one a day, so its oldest open row falls out of them within weeks (250
    // open tier-3 rows on 2026-10-04) and "first flagged" would quietly
    // shrink. Ask for the oldest open row of each workflow on show, oldest
    // first, which is a few short rows. On error, keep the newest-200 answer.
    const ids = shown.map(r => r.workflow_id).filter(Boolean)
    if (ids.length) {
      const { data: firsts } = await supabase
        .from('silent_failures')
        .select('workflow_id,detected_at')
        .in('workflow_id', ids)
        .gte('tier', 3)
        .is('resolved_at', null)
        .order('detected_at', { ascending: true })
        .limit(1000)
      for (const r of (firsts as { workflow_id: string; detected_at: string }[] | null) || []) {
        if (r.workflow_id && r.detected_at) noteFirst(r.workflow_id, r.detected_at)
      }
    }
    cache = shown.map(r => ({ ...r, first_detected_at: firstSeen.get(keyOf(r)) ?? r.detected_at }))
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
