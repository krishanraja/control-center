import { useEffect, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

const API = import.meta.env.VITE_API_URL ?? ''

// The shared reader for the goal canon: one fetch of GET /api/goals/ladder,
// one realtime channel on `goals`, module-level cache (ADR-002 singleton
// pattern, mirrors useDailyFocus / useWeeklyFocus). Every Home-side consumer
// of the canon (the ladder surface, the staleness hook, the ritual's weekly
// step) reads this cache, so they can never disagree about what the canon is.

export type CanonHorizon = 'os' | 'weekly'

export interface CanonGoal {
  id: string
  title: string
  horizon: CanonHorizon
  parent_id: string | null
  venture: string | null
  /** Which of the five jobs of the OS this serves (src/content/jobs.ts). */
  job: string | null
  status: string
  priority: number | null
  is_stale: boolean
  orphaned: boolean
  days_since_touch: number | null
  stale_after_days: number | null
  updated_at: string
  created_at: string
}

export interface CanonData {
  os: CanonGoal[]
  /** Active + done weekly rows (the current set; done rows render struck). */
  weekly: CanonGoal[]
  /** Marcus-proposed weekly rows awaiting accept/reject. */
  weeklyProposed: CanonGoal[]
  ventures: string[]
  stale_count: number
  orphan_count: number
  week_of: string
}

interface State { data: CanonData | null; loading: boolean; error: string | null }
let cache: State = { data: null, loading: true, error: null }
let loaded = false
let inflight: Promise<void> | null = null
let channel: RealtimeChannel | null = null
let refCount = 0
const listeners = new Set<() => void>()
function notify() { for (const l of listeners) l() }

async function fetchCanon(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await fetch(`${API}/api/goals/ladder`, { cache: 'no-cache' })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      const os = (j.by_horizon?.os ?? []) as CanonGoal[]
      const weeklyAll = (j.by_horizon?.weekly ?? []) as CanonGoal[]
      cache = {
        data: {
          os: os.filter(g => g.status !== 'proposed'),
          weekly: weeklyAll.filter(g => g.status === 'active' || g.status === 'done'),
          weeklyProposed: weeklyAll.filter(g => g.status === 'proposed'),
          ventures: (j.ventures ?? []) as string[],
          stale_count: j.stale_count ?? 0,
          orphan_count: j.orphan_count ?? 0,
          week_of: j.week_of ?? '',
        },
        loading: false,
        error: null,
      }
    } catch (e) {
      cache = { ...cache, loading: false, error: e instanceof Error ? e.message : 'Could not load goals' }
    }
    loaded = true
    notify()
    inflight = null
  })()
  return inflight
}

function attach() {
  if (channel) return
  channel = supabase
    .channel('goal-canon-rt-shared')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, () => { void fetchCanon() })
    .subscribe()
}

function detachIfIdle() {
  if (refCount > 0 || !channel) return
  supabase.removeChannel(channel)
  channel = null
}

export function useGoalCanon() {
  const [, setV] = useState(0)
  useEffect(() => {
    refCount += 1
    attach()
    if (!loaded && !inflight) void fetchCanon()
    const l = () => setV(v => v + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
      refCount -= 1
      setTimeout(detachIfIdle, 0)
    }
  }, [])

  const refresh = useCallback(() => { void fetchCanon() }, [])

  return {
    canon: cache.data,
    loading: cache.loading,
    error: cache.error,
    refresh,
  }
}
