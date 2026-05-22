import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Visibility lane source #2: Nell's drafted podcast / speaker candidates.
 *
 * Deliberately NOT a realtime channel — `nell_candidates` is a low-volume
 * slow-lifecycle table (34 rows total at time of writing, all `status='new'`)
 * and ADR-002 says "no new channels unless absolutely necessary." This hook
 * polls on mount + window focus + tab activation, which is plenty for Nell's
 * cadence (a few additions per week at most).
 */

export interface NellCandidate {
  id: string
  name?: string | null
  email?: string | null
  linkedin_url?: string | null
  twitter_handle?: string | null
  personal_url?: string | null
  signal_type?: string | null
  signal_description?: string | null
  source?: string | null
  source_url?: string | null
  podcast_target?: string | null
  fit_score?: number | null
  attainability_score?: number | null
  best_channel?: string | null
  status?: string | null
  pitch_draft?: string | null
  surfaced_at?: string | null
  enriched_at?: string | null
  pitched_at?: string | null
  notes?: string | null
  // Added by 2026-05-22-nell-scheduled-task.sql — when Krish taps
  // "Schedule with Nell" the API creates a tasks row and stamps this
  // FK; skipped_at marks candidates Krish has opted to ignore.
  scheduled_task_id?: string | null
  skipped_at?: string | null
}

let cache: NellCandidate[] = []
let loadingCache = true
let inflight: Promise<void> | null = null
let refCount = 0
let lastFetched = 0
const POLL_MS = 60_000
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

async function fetchAll(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    const { data } = await supabase
      .from('nell_candidates')
      .select('*')
      .order('surfaced_at', { ascending: false })
    cache = (data as NellCandidate[]) || []
    loadingCache = false
    lastFetched = Date.now()
    notify()
    inflight = null
  })()
  return inflight
}

let pollTimer: ReturnType<typeof setInterval> | null = null

function startPolling() {
  if (pollTimer || refCount === 0) return
  pollTimer = setInterval(() => { fetchAll() }, POLL_MS)
  // Re-poll when the tab regains focus or visibility — cheap freshness on
  // the way in without holding a realtime channel open.
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onVisibility)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  window.removeEventListener('focus', onFocus)
  document.removeEventListener('visibilitychange', onVisibility)
}

function onFocus() {
  if (Date.now() - lastFetched > 5_000) fetchAll()
}

function onVisibility() {
  if (document.visibilityState === 'visible' && Date.now() - lastFetched > 5_000) fetchAll()
}

export function useNellCandidates() {
  const [, setVersion] = useState(0)

  useEffect(() => {
    refCount += 1
    if (loadingCache && !inflight) fetchAll()
    startPolling()

    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)

    return () => {
      listeners.delete(listener)
      refCount -= 1
      setTimeout(() => {
        if (refCount === 0) stopPolling()
      }, 0)
    }
  }, [])

  const refresh = useCallback(() => { fetchAll() }, [])

  return { candidates: cache, loading: loadingCache, refresh }
}

export function __resetNellCandidatesStore() {
  cache = []
  loadingCache = true
  inflight = null
  refCount = 0
  lastFetched = 0
  listeners.clear()
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}
