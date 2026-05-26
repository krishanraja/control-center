import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface DecisionRow {
  kind: 'task' | 'guest' | 'idea' | 'lead' | 'visibility' | 'correction'
  id: string
  title: string
  description: string | null
  agent: string
  status: string
  priority: string
  sort_at: string
  url: string | null
  source_table: string
  meta: Record<string, unknown>
  /** Hash route hint emitted by the view (e.g. `today?task=:id`). Reserved for future use. */
  route_target: string | null
}

let cache: DecisionRow[] = []
let loaded = false
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

const SOURCE_TABLES = ['tasks', 'guests', 'content_ideas', 'leads', 'visibility_targets', 'corrections']
let channels: RealtimeChannel[] = []

function notify() { for (const l of listeners) l() }

const PRIORITY_RANK: Record<string, number> = { high: 0, urgent: 1, overdue: 2, normal: 3, low: 4 }

async function fetchAll(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    const { data, error } = await supabase
      .from('decisions_waiting')
      .select('*')
      .limit(200)
    if (error && error.code !== 'PGRST205') {
      console.warn('[useRealtimeDecisionsWaiting] fetch error', error.message)
    }
    const rows = ((data as DecisionRow[]) || []).slice()
    rows.sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 99
      const pb = PRIORITY_RANK[b.priority] ?? 99
      if (pa !== pb) return pa - pb
      const ta = a.sort_at ? new Date(a.sort_at).getTime() : Number.MAX_SAFE_INTEGER
      const tb = b.sort_at ? new Date(b.sort_at).getTime() : Number.MAX_SAFE_INTEGER
      return ta - tb
    })
    cache = rows
    loaded = true
    notify()
    inflight = null
  })()
  return inflight
}

function attachChannelsIfNeeded() {
  if (channels.length > 0) return
  channels = SOURCE_TABLES.map(table =>
    supabase
      .channel(`decisions-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => { fetchAll() })
      .subscribe()
  )
}

function detachChannelsIfIdle() {
  if (listeners.size > 0 || channels.length === 0) return
  for (const ch of channels) supabase.removeChannel(ch)
  channels = []
}

export function useRealtimeDecisionsWaiting() {
  const [, setVersion] = useState(0)

  useEffect(() => {
    attachChannelsIfNeeded()
    if (!loaded) fetchAll()
    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      setTimeout(detachChannelsIfIdle, 0)
    }
  }, [])

  return { decisions: cache, loading: !loaded }
}
