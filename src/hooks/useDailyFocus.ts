import { useEffect, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { civilYmd } from '../lib/civilDate'

// Phase 1 of focus + tasks inbox brief. Single canonical reader of
// today's daily_focus row + yesterday's carry-over candidate. Shared
// across FocusCalibrator, FocusBar, CarryOverPrompt, DecisionsWaitingPanel
// lanes, and the 3-for-3 streak.

export type FocusSource = 'marcus_nominated' | 'krish_swapped' | 'krish_added' | null

export interface DailyFocusRow {
  id: string
  focus_date: string
  target_1_text: string | null
  target_1_concept_id: string | null
  target_1_source: FocusSource
  target_1_replaced_marcus_pick: Record<string, unknown> | null
  target_1_completed_at: string | null
  target_2_text: string | null
  target_2_concept_id: string | null
  target_2_source: FocusSource
  target_2_replaced_marcus_pick: Record<string, unknown> | null
  target_2_completed_at: string | null
  target_3_text: string | null
  target_3_concept_id: string | null
  target_3_source: FocusSource
  target_3_replaced_marcus_pick: Record<string, unknown> | null
  target_3_completed_at: string | null
  /**
   * Optional links from a daily pick to the weekly goal it serves (the canon
   * chain: OS → week → today). Columns land with the home-canon migration;
   * optional so a pre-migration row reads fine.
   */
  target_1_goal_id?: string | null
  target_2_goal_id?: string | null
  target_3_goal_id?: string | null
  status: 'pending' | 'calibrated' | 'complete' | 'carried_over'
  calibrated_at: string | null
  completed_at: string | null
  carried_from_date: string | null
  relevance_index: Record<string, { target: 1 | 2 | 3 | null; score: number }>
  marcus_suggestions: unknown[]
  created_at: string
  updated_at: string
}

interface DailyFocusState {
  today: DailyFocusRow | null
  carry_over: DailyFocusRow | null
  loading: boolean
}

// The operator's civil day, not UTC. focus_date used to be a UTC key while
// useAltitudes asked London whether today was set, so the two could disagree
// for an hour every day and all day for a European operator.
function ymd(d: Date): string {
  return civilYmd(d)
}

let cache: DailyFocusState = { today: null, carry_over: null, loading: true }
let loaded = false
let inflight: Promise<void> | null = null
let channel: RealtimeChannel | null = null
let refCount = 0
const listeners = new Set<() => void>()

function notify() { for (const l of listeners) l() }

async function fetchAll(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    const today = ymd(new Date())
    const y = new Date(); y.setUTCDate(y.getUTCDate() - 1)
    const yesterday = ymd(y)

    const [tRes, yRes] = await Promise.all([
      supabase.from('daily_focus').select('*').eq('focus_date', today).maybeSingle(),
      supabase.from('daily_focus').select('*').eq('focus_date', yesterday).maybeSingle(),
    ])
    const tRow = (tRes.data as DailyFocusRow | null) || null
    const yRow = (yRes.data as DailyFocusRow | null) || null
    cache = {
      today: tRow,
      carry_over: yRow && yRow.status !== 'complete' ? yRow : null,
      loading: false,
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
    .channel('daily-focus-rt-shared')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_focus' }, () => {
      fetchAll()
    })
    .subscribe()
}

function detachIfIdle() {
  if (refCount > 0 || !channel) return
  supabase.removeChannel(channel)
  channel = null
}

export function useDailyFocus() {
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

export function isFocusEnabled(): boolean {
  // Committed with the 2026-08-20 recompose: today's 3 IS the third layer of
  // the canon, so the surface is structural, not configured.
  return true
}
