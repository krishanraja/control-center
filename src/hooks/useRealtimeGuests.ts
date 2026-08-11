import { useEffect, useMemo, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// Builder Economy was fully retired 2026-08-11 and Signal & Noise is now a
// distribution channel carrying Mindmaker Live's Built conversations. The old
// value stays in the union because scouted guests still carry it; it is no
// longer offered as a choice.
export type GuestPodcastTarget = 'signal_noise' | 'builder_economy' | 'either'

export type GuestStatus =
  | 'scouted'
  | 'enriched'
  | 'pitched'
  | 'responded'
  | 'scheduled'
  | 'confirmed'
  | 'recorded'
  | 'published'
  | 'dropped'
  | 'skipped'

export type GuestQualityScore = 'red' | 'amber' | 'green'

export type GuestBriefingStatus = 'none' | 'generating' | 'ready' | 'failed'

export interface GuestRow {
  id: string
  name: string
  email: string | null
  linkedin_url: string | null
  twitter_handle: string | null
  personal_url: string | null
  podcast_target: GuestPodcastTarget
  one_liner: string | null
  why_fit: string | null
  best_channel: string | null
  pitch_draft: string | null
  fit_score: number | null
  attainability_score: number | null
  quality_score: GuestQualityScore | null
  status: GuestStatus
  /** Pre-spend triage signal (deterministic, $0). 0-100, higher = worth enriching/briefing. */
  triage_score: number | null
  triage_reason: string | null
  /** Speaker Briefing generation lifecycle (rides guests-rt-shared). */
  briefing_status: GuestBriefingStatus | null
  briefing_doc_url: string | null
  briefing_requested_at: string | null
  briefing_generated_at: string | null
  scheduled_at: string | null
  recorded_at: string | null
  published_at: string | null
  notes: string | null
  raw_data: Record<string, unknown> | null
  source: string
  cascade_fired_at: string | null
  /** 'user' rows are never auto-buried by the backburner sweep. */
  origin?: 'user' | 'agent' | null
  buried_at?: string | null
  buried_reason?: string | null
  protected_at?: string | null
  created_at: string
  updated_at: string
}

interface Options {
  statusIn?: GuestStatus[]
  targetIn?: GuestPodcastTarget[]
  filter?: (g: GuestRow) => boolean
}

let cache: GuestRow[] = []
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
      .from('guests')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error && error.code !== 'PGRST205') {
      console.warn('[useRealtimeGuests] fetch error', error.message)
    }
    cache = (data as GuestRow[]) || []
    loadingCache = false
    notify()
    inflight = null
  })()
  return inflight
}

function attachChannelIfNeeded() {
  if (channel) return
  channel = supabase
    .channel('guests-rt-shared')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'guests' }, () => {
      fetchAll()
    })
    .subscribe()
}

function detachChannelIfIdle() {
  if (refCount > 0 || !channel) return
  supabase.removeChannel(channel)
  channel = null
}

export function useRealtimeGuests(opts: Options = {}) {
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

  const statusKey = opts.statusIn ? opts.statusIn.join('|') : ''
  const targetKey = opts.targetIn ? opts.targetIn.join('|') : ''
  const filterFn = opts.filter

  const guests = useMemo(() => {
    let out: GuestRow[] = cache
    if (opts.statusIn && opts.statusIn.length) {
      const allow = new Set(opts.statusIn)
      out = out.filter(g => allow.has(g.status))
    }
    if (opts.targetIn && opts.targetIn.length) {
      const allow = new Set(opts.targetIn)
      out = out.filter(g => allow.has(g.podcast_target))
    }
    if (filterFn) out = out.filter(filterFn)
    return out
  }, [statusKey, targetKey, filterFn, cache])

  return { guests, loading: loadingCache, refresh }
}
