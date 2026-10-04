import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { splitDecisions } from '../lib/decisionKinds'
import { freshDecisions } from '../lib/freshDecisions'

export interface DecisionRow {
  kind: 'task' | 'guest' | 'idea' | 'lead' | 'visibility' | 'correction' | 'skill_proposal' | 'content_decision' | 'inbox_returned' | 'vera_gap' | 'sequence_approval' | 'send_sample' | 'growth_stall'
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
// Task ids behind open vera gaps that Krish has already reviewed. A gap whose
// task he has ruled on is not waiting on him (freshDecisions drops it).
let reviewedTaskIds: Set<string> = new Set()
let loaded = false
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

// acquisition_sends is deliberately NOT subscribed: its RLS is deny-all for
// anon (rendered bodies + lead PII), so the browser would never receive its
// events. Queued sends surface via mount-time fetch + events on the tables
// below; the Growth tab's own 60s poll keeps its deck fresh.
const SOURCE_TABLES = ['tasks', 'guests', 'content_ideas', 'leads', 'visibility_targets', 'corrections', 'skill_proposals', 'content_decisions', 'tasks_inbox', 'vera_gaps', 'acquisition_sequences', 'growth_stalls']
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
    const gapTaskIds = rows
      .filter(r => r.kind === 'vera_gap')
      .map(r => (r.meta as Record<string, unknown> | null)?.task_id)
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
    if (gapTaskIds.length) {
      const { data: reviewed } = await supabase
        .from('tasks')
        .select('id')
        .in('id', gapTaskIds)
        .eq('krish_reviewed', true)
      reviewedTaskIds = new Set(((reviewed as Array<{ id: string }>) || []).map(t => t.id))
    } else {
      reviewedTaskIds = new Set()
    }
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

/**
 * The rulings Krish can still act on in the tab that owns each one: typed
 * rulings only, with the stale, superseded and notice-only rows removed
 * (src/lib/freshDecisions.ts). Every waiting count reads this, never the raw
 * view, so Home and the morning close always agree.
 */
export function useWaitingDecisions() {
  const { decisions, loading } = useRealtimeDecisionsWaiting()
  const waiting = freshDecisions(splitDecisions(decisions).decisions, { reviewedTaskIds })
  return { waiting, loading }
}
