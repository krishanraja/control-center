import { useEffect, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// Single shared realtime subscription for goals + milestones, per ADR-002.
// Both tables share one channel so the browser session holds exactly one
// connection regardless of how many panels mount the hook.

export type ObjectiveStatus = 'proposed' | 'active' | 'paused' | 'done' | 'dropped'
export type ObjectiveSource = 'krish_declared' | 'marcus_nominated' | 'agatha_decomposed'

export interface Objective {
  id: string
  title: string
  venture: string | null
  objective_kind: string | null
  status: ObjectiveStatus
  priority: number | null
  definition_of_done: string | null
  why_now: string | null
  target_horizon: string | null
  primary_kpi: string | null
  secondary_kpi: string | null
  is_auto: boolean
  source: ObjectiveSource
  activated_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  // Count of Marcus-proposed milestones still awaiting Krish's accept/reject,
  // supplied by GET /api/objectives so the altitude spine can flag Portfolio
  // without a per-objective tree fetch. Absent on older payloads → treat as 0.
  proposed_milestone_count?: number
}

interface State {
  active: Objective[]
  nominations: Objective[]
  active_count: number
  soft_cap: number
  loading: boolean
}

let cache: State = { active: [], nominations: [], active_count: 0, soft_cap: 10, loading: true }
let loaded = false
let inflight: Promise<void> | null = null
let channel: RealtimeChannel | null = null
let refCount = 0
const listeners = new Set<() => void>()

function notify() { for (const l of listeners) l() }

async function fetchAll(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await fetch('/api/objectives?status=all&include_nominations=1')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'unknown')
      const rows: Objective[] = j.objectives || []
      const active = rows.filter(o => o.status === 'active')
      const nominations = rows.filter(o => o.status === 'proposed' && o.source === 'marcus_nominated')
      cache = {
        active,
        nominations,
        active_count: typeof j.active_count === 'number' ? j.active_count : active.length,
        soft_cap: typeof j.soft_cap === 'number' ? j.soft_cap : 10,
        loading: false,
      }
    } catch {
      cache = { ...cache, loading: false }
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
    .channel('objectives-rt-shared')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, () => { fetchAll() })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'milestones' }, () => { fetchAll() })
    .subscribe()
}

function detachIfIdle() {
  if (refCount > 0 || !channel) return
  supabase.removeChannel(channel)
  channel = null
}

export function useObjectives() {
  const [, setV] = useState(0)
  useEffect(() => {
    refCount += 1
    attach()
    if (!loaded && !inflight) fetchAll()
    const l = () => setV(v => v + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
      refCount -= 1
      setTimeout(detachIfIdle, 0)
    }
  }, [])

  const refresh = useCallback(() => { fetchAll() }, [])
  return { ...cache, refresh }
}
