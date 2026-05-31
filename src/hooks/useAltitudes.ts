import { useCallback, useState } from 'react'
import { useObjectives } from './useObjectives'
import { useWeeklyFocus, isWeeklyFocusEnabled } from './useWeeklyFocus'
import { useDailyFocus, isFocusEnabled } from './useDailyFocus'
import { isFocusRitualEnabled } from '../lib/homeV2'
import { londonYmd } from '../lib/londonDate'

// The unifying state machine behind the Focus Ritual. Every altitude shares one
// lifecycle — Marcus proposes -> Krish ratifies -> it's "set" until its cadence
// expires -> it goes stale -> it re-enters the queue. This hook composes the
// three already-shared singleton readers (useObjectives / useWeeklyFocus /
// useDailyFocus) into one descriptor per altitude. It opens NO new realtime
// channels or fetches — it only derives state from caches already mounted on Home.

export type AltitudeId = 'portfolio' | 'weekly' | 'daily'
export type AltitudeState = 'set' | 'stale' | 'unset'

export interface Altitude {
  id: AltitudeId
  label: string
  // 'set' = ratified and fresh; 'stale' = was set but its cadence expired or
  // something changed; 'unset' = never set.
  state: AltitudeState
  // True when this altitude is asking for a decision right now (stale/unset AND
  // its cadence is active AND not snoozed). Drives the spine's amber + the ritual.
  needsAttention: boolean
  summary: string   // the current commitment, one line
  count: number     // open decisions at this altitude
}

const DISMISS_KEY = 'focus_ritual_dismissed_date'

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeSet(key: string, val: string): void {
  try { localStorage.setItem(key, val) } catch { /* ignore */ }
}

export interface AltitudesResult {
  altitudes: Altitude[]            // always [portfolio, weekly, daily]
  portfolio: Altitude
  weekly: Altitude
  daily: Altitude
  pending: Altitude[]              // needsAttention, in altitude order
  allSet: boolean                  // nothing pending (and not loading)
  loading: boolean
  isMonday: boolean
  dismissedToday: boolean
  dismissToday: () => void
}

export function useAltitudes(): AltitudesResult {
  const obj = useObjectives()
  const wf = useWeeklyFocus()
  const df = useDailyFocus()
  const [, setV] = useState(0)

  const loading = obj.loading || wf.loading || df.loading
  const todayYmd = londonYmd(new Date())
  const dismissedToday = safeGet(DISMISS_KEY) === todayYmd

  // ── Portfolio ──────────────────────────────────────────────────────────────
  // Needs attention when Marcus has nominated objectives to ratify, when the
  // board is empty, or when it's over the soft cap. Otherwise it's set.
  const noms = obj.nominations.length
  const noActive = obj.active_count === 0
  const overCap = obj.active_count > obj.soft_cap
  const portfolioNeeds = noms > 0 || noActive || overCap
  const portfolio: Altitude = {
    id: 'portfolio',
    label: 'Portfolio',
    state: noActive ? 'unset' : portfolioNeeds ? 'stale' : 'set',
    needsAttention: portfolioNeeds,
    summary: noActive
      ? 'No active objectives'
      : noms > 0
        ? `${noms} proposed to review`
        : overCap
          ? `${obj.active_count} active · over cap`
          : `${obj.active_count} active objective${obj.active_count === 1 ? '' : 's'}`,
    count: noms,
  }

  // ── Weekly ─────────────────────────────────────────────────────────────────
  // Participates when the weekly ritual is enabled (or the unified ritual flag is
  // on, which subsumes it). Set once committed for the current ISO week; stale on
  // a new uncommitted week with objectives to plan, until committed or snoozed.
  const weeklyActive = isWeeklyFocusEnabled() || isFocusRitualEnabled()
  const weeklySet = !!wf.thisWeek || wf.committedThisWeekLS
  const weeklyNeeds = weeklyActive && !weeklySet && obj.active.length > 0 && !wf.snoozedToday
  const weekly: Altitude = {
    id: 'weekly',
    label: 'Week',
    state: weeklySet ? 'set' : weeklyActive ? 'stale' : 'unset',
    needsAttention: weeklyNeeds,
    summary: weeklySet
      ? 'Week committed'
      : obj.active.length === 0
        ? 'No objectives to plan'
        : 'Plan this week',
    count: weeklyNeeds ? 1 : 0,
  }

  // ── Daily ──────────────────────────────────────────────────────────────────
  // The everyday altitude. Set once today's daily_focus row exists; unset (and
  // demanding) until then, unless dismissed for the day.
  const focusOn = isFocusEnabled()
  const dailySet = !!df.today
  const doneCount = df.today
    ? [df.today.target_1_completed_at, df.today.target_2_completed_at, df.today.target_3_completed_at].filter(Boolean).length
    : 0
  const dailyNeeds = focusOn && !dailySet && !dismissedToday
  const daily: Altitude = {
    id: 'daily',
    label: 'Today',
    state: dailySet ? 'set' : 'unset',
    needsAttention: dailyNeeds,
    summary: dailySet ? `Today ${doneCount}/3` : 'Pick your 3',
    count: dailyNeeds ? 1 : 0,
  }

  const altitudes = [portfolio, weekly, daily]
  const pending = altitudes.filter(a => a.needsAttention)
  const allSet = !loading && pending.length === 0

  const dismissToday = useCallback(() => {
    safeSet(DISMISS_KEY, londonYmd(new Date()))
    setV(v => v + 1)
  }, [])

  return {
    altitudes, portfolio, weekly, daily,
    pending, allSet, loading,
    isMonday: wf.isMonday,
    dismissedToday,
    dismissToday,
  }
}
