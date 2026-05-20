import { useEffect, useMemo, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type LeadSourceType =
  | 'podcast_audience'
  | 'drive_import'
  | 'manual'
  | 'apollo'
  | 'nell_candidate'
  | 'signal_inbox'

export type LeadStatus =
  | 'new'
  | 'enriching'
  | 'ready'
  | 'contacted'
  | 'conversation'
  | 'closed_won'
  | 'closed_lost'
  | 'superseded'

export interface LeadRow {
  id: string
  full_name?: string | null
  email?: string | null
  linkedin_url?: string | null
  twitter_handle?: string | null
  company?: string | null
  title?: string | null
  source_type: LeadSourceType
  source_ref?: string | null
  source_url?: string | null
  source_document_id?: string | null
  source_document_name?: string | null
  fit_score?: number | null
  attainability_score?: number | null
  icp_score?: number | null
  tier?: string | null
  why_relevant?: string | null
  primary_tension?: string | null
  status: LeadStatus
  next_step?: string | null
  owner?: string | null
  assignee_agent?: string | null
  raw_extraction?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  superseded_by?: string | null
}

interface Options {
  filter?: (l: LeadRow) => boolean
  sourceTypeIn?: LeadSourceType[]
  statusIn?: LeadStatus[]
}

// ─── Shared store ────────────────────────────────────────────────────────────
// Mirrors useRealtimeTasks.ts:38–82 — one channel, one cache, fanout listeners.

let cache: LeadRow[] = []
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
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error && error.code !== 'PGRST205') {
      // 404 / table-missing during pre-migration: degrade gracefully
      console.warn('[useRealtimeLeads] fetch error', error.message)
    }
    cache = (data as LeadRow[]) || []
    loadingCache = false
    notify()
    inflight = null
  })()
  return inflight
}

function attachChannelIfNeeded() {
  if (channel) return
  channel = supabase
    .channel('leads-rt-shared')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
      fetchAll()
    })
    .subscribe()
}

function detachChannelIfIdle() {
  if (refCount > 0 || !channel) return
  supabase.removeChannel(channel)
  channel = null
}

export function useRealtimeLeads(opts: Options = {}) {
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
      setTimeout(detachChannelIfIdle, 0)
    }
  }, [])

  const refresh = useCallback(() => { fetchAll() }, [])

  const sourceKey = opts.sourceTypeIn ? opts.sourceTypeIn.join('|') : ''
  const statusKey = opts.statusIn ? opts.statusIn.join('|') : ''
  const filterFn = opts.filter

  const leads = useMemo(() => {
    let out: LeadRow[] = cache
    if (opts.sourceTypeIn && opts.sourceTypeIn.length) {
      const allow = new Set(opts.sourceTypeIn)
      out = out.filter(l => allow.has(l.source_type))
    }
    if (opts.statusIn && opts.statusIn.length) {
      const allow = new Set(opts.statusIn)
      out = out.filter(l => allow.has(l.status))
    }
    if (filterFn) out = out.filter(filterFn)
    return out
  }, [sourceKey, statusKey, filterFn, cache])

  return { leads, loading: loadingCache, refresh }
}
