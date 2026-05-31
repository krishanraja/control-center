import { useEffect, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { londonParts, weekOfLondon, isMondayLondon } from '../lib/londonDate'

// Re-exported for callers that imported these from here historically.
export { weekOfLondon, isMondayLondon }

// Weekly focus gate + reader (Phase 2 of the focus spine). Mirrors
// useDailyFocus: one shared realtime channel on weekly_focus per session
// (ADR-002), module-level cache. The committed row (one per ISO week, keyed by
// the Monday in Europe/London) is the source of truth for whether Krish has run
// the weekly ritual. The commit itself goes through /api/weekly-focus/commit
// (service role writes the bridge rows); this hook reads the gate row and owns
// the localStorage fallbacks that keep the takeover from re-popping.

export interface WeeklyFocusRow {
  id: string
  week_of: string
  status: 'committed' | 'superseded'
  committed_at: string
  retro_ack: boolean
  source: string
  created_at: string
  updated_at: string
}

const SET_WEEK_KEY = 'weekly_focus_set_week'
const SNOOZE_DATE_KEY = 'weekly_focus_snoozed_date'

// Default OFF in production until verified. Daily focus defaults on; the weekly
// takeover and Full Focus Mode opt in explicitly.
export function isWeeklyFocusEnabled(): boolean {
  return import.meta.env.VITE_WEEKLY_FOCUS_ENABLED === 'true'
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeSet(key: string, val: string): void {
  try { localStorage.setItem(key, val) } catch { /* ignore */ }
}

interface State { thisWeek: WeeklyFocusRow | null; loading: boolean }
let cache: State = { thisWeek: null, loading: true }
let loaded = false
let inflight: Promise<void> | null = null
let channel: RealtimeChannel | null = null
let refCount = 0
const listeners = new Set<() => void>()
function notify() { for (const l of listeners) l() }

async function fetchThisWeek(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    const week = weekOfLondon(new Date())
    const { data } = await supabase.from('weekly_focus').select('*').eq('week_of', week).maybeSingle()
    cache = { thisWeek: (data as WeeklyFocusRow | null) || null, loading: false }
    loaded = true
    notify()
    inflight = null
  })()
  return inflight
}

function attach() {
  if (channel) return
  channel = supabase
    .channel('weekly-focus-rt-shared')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_focus' }, () => { fetchThisWeek() })
    .subscribe()
}

function detachIfIdle() {
  if (refCount > 0 || !channel) return
  supabase.removeChannel(channel)
  channel = null
}

export function useWeeklyFocus() {
  const [, setV] = useState(0)
  useEffect(() => {
    refCount += 1
    attach()
    if (!loaded && !inflight) fetchThisWeek()
    const l = () => setV(v => v + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
      refCount -= 1
      setTimeout(detachIfIdle, 0)
    }
  }, [])

  const refresh = useCallback(() => { fetchThisWeek() }, [])
  const markSetWeek = useCallback(() => { safeSet(SET_WEEK_KEY, weekOfLondon(new Date())) }, [])
  const snoozeToday = useCallback(() => { safeSet(SNOOZE_DATE_KEY, londonParts(new Date()).ymd) }, [])

  const now = new Date()
  const currentWeekOf = weekOfLondon(now)
  const todayLondon = londonParts(now).ymd

  return {
    thisWeek: cache.thisWeek,
    loading: cache.loading,
    currentWeekOf,
    // localStorage fast-path so a freshly committed (or snoozed) week never
    // re-pops before the realtime row lands.
    committedThisWeekLS: safeGet(SET_WEEK_KEY) === currentWeekOf,
    snoozedToday: safeGet(SNOOZE_DATE_KEY) === todayLondon,
    isMonday: isMondayLondon(now),
    markSetWeek,
    snoozeToday,
    refresh,
  }
}
