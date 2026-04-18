import { useEffect, useMemo, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface TaskRow {
  id: string
  title: string
  description?: string
  status: string
  owner?: string
  agent?: string
  next_step?: string
  priority?: string
  priority_override?: number
  group_label?: string
  workstream?: string
  krish_notes?: string
  krish_reviewed?: boolean
  due_date?: string
  created?: string
  updated_at?: string
  started_at?: string    // Auto-stamped when status changes to in_progress (DB trigger)
  completed_at?: string
  notes?: string
  feedback_text?: string
  link_primary?: string
  link_secondary?: string
  evidence?: string
  venture_id?: string
  [key: string]: any
}

interface Options {
  filter?: (t: TaskRow) => boolean
  statusIn?: string[]
}

// ─── Shared store ────────────────────────────────────────────────────────────
// One channel + one cache of all tasks, fanned out to every consumer. Avoids
// the N-channels-per-mount fan-out flagged in DATA-RECOMMENDATIONS §3.1.

let cache: TaskRow[] = []
let loadingCache = true
let channel: RealtimeChannel | null = null
let refCount = 0
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

async function fetchAll(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .order('updated_at', { ascending: false })
    cache = (data as TaskRow[]) || []
    loadingCache = false
    notify()
    inflight = null
  })()
  return inflight
}

function attachChannelIfNeeded() {
  if (channel) return
  channel = supabase
    .channel('tasks-rt-shared')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
      fetchAll()
    })
    .subscribe()
}

function detachChannelIfIdle() {
  if (refCount > 0 || !channel) return
  supabase.removeChannel(channel)
  channel = null
}

export function useRealtimeTasks(opts: Options = {}) {
  // Bump a local counter so we re-render when the shared cache changes. We
  // don't copy the cache into local state — just depend on the version.
  const [, setVersion] = useState(0)

  useEffect(() => {
    refCount += 1
    attachChannelIfNeeded()
    if (loadingCache && !inflight) fetchAll()

    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)

    return () => {
      listeners.delete(listener)
      refCount -= 1
      // Defer teardown a tick so fast tab swaps don't churn the channel.
      setTimeout(detachChannelIfIdle, 0)
    }
  }, [])

  const refresh = useCallback(() => { fetchAll() }, [])

  const statusKey = opts.statusIn ? opts.statusIn.join('|') : ''
  const filterFn = opts.filter

  const tasks = useMemo(() => {
    let out: TaskRow[] = cache
    if (opts.statusIn && opts.statusIn.length) {
      const allow = new Set(opts.statusIn)
      out = out.filter(t => allow.has(t.status))
    }
    if (filterFn) out = out.filter(filterFn)
    return out
    // `cache` itself is module-scoped; we re-derive whenever a listener fires
    // (which triggers setVersion) or the options change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey, filterFn, cache])

  return { tasks, loading: loadingCache, refresh }
}

// Test hook — reset the shared module state. Intentionally not exported
// from the public barrel; imported only by unit tests if/when they exist.
export function __resetRealtimeTasksStore() {
  cache = []
  loadingCache = true
  inflight = null
  listeners.clear()
  refCount = 0
  if (channel) { supabase.removeChannel(channel); channel = null }
}
