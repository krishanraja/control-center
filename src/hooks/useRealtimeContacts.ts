import { useEffect, useMemo, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// ─── Relationship Engine: the durable Person spine ────────────────────────────
// Backs the Leads tab. Distinct from the older `leads` table (Services pipeline).
// A contact graduates: Person (contacts) → Play (opportunities.play_status='proposed')
// → Opportunity (committed). Provenance (origin_*) is immutable; tier/score evolve.

export type ConsentTier =
  | 'cold_scraped'
  | 'cold_engaged'
  | 'permissioned'
  | 'warm'
  | 'customer'

export type TriageStatus = 'pending' | 'triaged' | 'skipped'

export type ContactStatus = 'active' | 'dormant' | 'closed' | 'do_not_contact'

export interface ContactRow {
  id: string
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  linkedin_url?: string | null
  twitter_handle?: string | null
  company?: string | null
  title?: string | null
  location?: string | null
  // provenance (immutable by design — how we know how to speak to them)
  origin_channel?: string | null
  origin_venture?: string | null
  origin_campaign?: string | null
  acquired_at?: string | null
  sources?: Array<Record<string, unknown>> | null
  // evolving relationship state
  consent_tier?: ConsentTier | null
  relationship_strength?: number | null
  fit_scores?: Record<string, number> | null
  primary_venture?: string | null
  primary_play_type?: string | null
  heat_score?: number | null
  triage_status?: TriageStatus | null
  triaged_at?: string | null
  enrichment_status?: string | null
  deep_enriched_at?: string | null
  dossier?: Record<string, unknown> | null
  status?: ContactStatus | null
  tags?: string[] | null
  owner_agent?: string | null
  last_touch_at?: string | null
  next_touch_due_at?: string | null
  concept_id?: string | null
  created_at: string
  updated_at: string
}

export interface Options {
  /** Cap on rows pulled from PostgREST (anon caps at 1000). Default 1000. */
  limit?: number
  /** Server-side: only these triage statuses. Default ['triaged']. */
  triageStatusIn?: TriageStatus[]
  /** Client-side narrowing on the loaded page. */
  ventureIn?: string[]
  tierIn?: ConsentTier[]
  minHeat?: number
  search?: string
  filter?: (c: ContactRow) => boolean
}

// ─── Shared store (ADR-002: one channel per table, fanout listeners) ───────────

let cache: ContactRow[] = []
let loadingCache = true
let channel: RealtimeChannel | null = null
let refCount = 0
let inflight: Promise<void> | null = null
let currentLimit = 1000
let currentTriage: TriageStatus[] = ['triaged']
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

async function fetchAll(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .in('triage_status', currentTriage)
      .order('heat_score', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(currentLimit)
    if (error && error.code !== 'PGRST205') {
      console.warn('[useRealtimeContacts] fetch error', error.message)
    }
    cache = (data as ContactRow[]) || []
    loadingCache = false
    notify()
    inflight = null
  })()
  return inflight
}

function attachChannelIfNeeded() {
  if (channel) return
  channel = supabase
    .channel('contacts-rt-shared')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => {
      fetchAll()
    })
    .subscribe()
}

function detachChannelIfIdle() {
  if (refCount > 0 || !channel) return
  supabase.removeChannel(channel)
  channel = null
}

export function useRealtimeContacts(opts: Options = {}) {
  const [, setVersion] = useState(0)

  // Apply server-side params (limit + triage status) before first fetch.
  const triageKey = (opts.triageStatusIn ?? ['triaged']).join('|')
  useEffect(() => {
    currentLimit = opts.limit ?? 1000
    currentTriage = opts.triageStatusIn ?? ['triaged']
    fetchAll()
  }, [opts.limit, triageKey])

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

  const ventureKey = opts.ventureIn ? opts.ventureIn.join('|') : ''
  const tierKey = opts.tierIn ? opts.tierIn.join('|') : ''
  const minHeat = opts.minHeat
  const search = opts.search?.trim().toLowerCase() ?? ''
  const filterFn = opts.filter

  const contacts = useMemo(() => {
    let out: ContactRow[] = cache
    if (opts.ventureIn && opts.ventureIn.length) {
      const allow = new Set(opts.ventureIn)
      out = out.filter(c => c.primary_venture && allow.has(c.primary_venture))
    }
    if (opts.tierIn && opts.tierIn.length) {
      const allow = new Set(opts.tierIn)
      out = out.filter(c => c.consent_tier && allow.has(c.consent_tier))
    }
    if (typeof minHeat === 'number') {
      out = out.filter(c => (c.heat_score ?? 0) >= minHeat)
    }
    if (search) {
      out = out.filter(c =>
        (c.full_name ?? '').toLowerCase().includes(search) ||
        (c.company ?? '').toLowerCase().includes(search) ||
        (c.title ?? '').toLowerCase().includes(search) ||
        (c.origin_campaign ?? '').toLowerCase().includes(search)
      )
    }
    if (filterFn) out = out.filter(filterFn)
    return out
  }, [ventureKey, tierKey, minHeat, search, filterFn, cache])

  return { contacts, loading: loadingCache, refresh }
}
