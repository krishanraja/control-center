import { useCallback, useState } from 'react'
import { useGoalCanon } from './useGoalCanon'
import { useDailyFocus, isFocusEnabled } from './useDailyFocus'
import { weekOf, isWeekend } from '../lib/civilDate'
import { isFlaggedToday, flagToday } from '../lib/dayFlag'
import { usePilotStateContext } from '../contexts/PilotStateContext'

// The staleness machine behind the canon: OS goals → this week's objectives →
// today's 3. Each layer shares one lifecycle — set, then its cadence expires,
// then it asks again. This hook composes the shared canon reader and the daily
// focus reader into one descriptor per layer plus THE single contextual CTA
// Home shows (one ask per screen; the highest stale layer wins).

export type AltitudeId = 'os' | 'weekly' | 'daily'
export type AltitudeState = 'set' | 'stale' | 'unset'

export interface Altitude {
  id: AltitudeId
  label: string
  state: AltitudeState
  // True when this layer is asking for a decision right now (stale/unset AND
  // its cadence is active AND not snoozed). Drives the amber + the ritual.
  needsAttention: boolean
  summary: string   // the current commitment, one line
  count: number     // open decisions at this layer
}

export interface CanonCta {
  /** Which layer the one CTA serves. 'os' opens the ladder; the rest open the ritual. */
  target: AltitudeId
  label: string
}

const DISMISS_KEY = 'focus_ritual_dismissed_date'

export interface AltitudesResult {
  altitudes: Altitude[]            // always [os, weekly, daily]
  os: Altitude
  weekly: Altitude
  daily: Altitude
  pending: Altitude[]              // needsAttention, in layer order
  /** The ONE contextual ask Home renders. Null when everything is fresh. */
  cta: CanonCta | null
  allSet: boolean                  // nothing pending (and not loading)
  loading: boolean
  dismissedToday: boolean
  dismissToday: () => void
}

export function useAltitudes(): AltitudesResult {
  const { canon, loading: canonLoading } = useGoalCanon()
  const df = useDailyFocus()
  const pilot = usePilotStateContext()
  const [, setV] = useState(0)

  // Capacity gates DEMAND, not availability. On a depleted day the OS stops
  // asking for weekly planning, because reviewing the week is exactly the
  // scope-expanding move the pilot layer exists to interrupt. The daily layer
  // is deliberately never suppressed: one commitment is the floor, and it is
  // what red mode already runs on. Every layer stays reachable by tapping it.
  const demandOk = pilot.profile.allowsHigherAltitudeDemand

  const loading = canonLoading || df.loading
  const dismissedToday = isFlaggedToday(DISMISS_KEY)
  const weekend = isWeekend()

  // ── OS ─────────────────────────────────────────────────────────────────────
  // The top of the canon. Rarely changes; stale after 90 untouched days
  // (goals_health). Empty only at cold start, and then it blocks everything
  // below (a weekly goal must name the OS goal it serves).
  const osGoals = canon?.os ?? []
  const osStaleCount = osGoals.filter(g => g.is_stale).length
  const osEmpty = !canonLoading && osGoals.length === 0
  const os: Altitude = {
    id: 'os',
    label: 'OS',
    state: osEmpty ? 'unset' : osStaleCount > 0 ? 'stale' : 'set',
    needsAttention: osEmpty || osStaleCount > 0,
    summary: osEmpty
      ? 'Set what the whole system is for'
      : osStaleCount > 0
        ? `${osStaleCount} stale`
        : `${osGoals.length} standing`,
    count: osEmpty ? 1 : osStaleCount,
  }

  // ── Weekly ─────────────────────────────────────────────────────────────────
  // A weekly row belongs to the week its week_start names (the operator's
  // Monday, written by POST /api/objectives). This week is set when at least
  // one row carries the current key. The Saturday close moves last week's
  // leftovers to `missed`, so on Monday the rung is empty and asks again. The
  // weekend is the one time it neither counts as set nor asks: the week has
  // closed, and Monday is when it refills.
  const currentWeek = canon?.currentWeek || weekOf(new Date())
  const weeklyRows = canon?.weekly ?? []
  // A row with no week_start predates the cadence; it counts as this week's.
  const thisWeekRows = weeklyRows.filter(g => !g.week_start || g.week_start === currentWeek)
  const weeklySet = thisWeekRows.length > 0
  const weeklyDoneCount = thisWeekRows.filter(g => g.status === 'done').length
  const weeklyNeeds = demandOk && !osEmpty && !weeklySet && !dismissedToday && !weekend
  const weekly: Altitude = {
    id: 'weekly',
    label: 'Week',
    state: weeklySet ? 'set' : weeklyRows.length > 0 ? 'stale' : 'unset',
    needsAttention: weeklyNeeds,
    summary: weeklySet
      ? `${weeklyDoneCount}/${thisWeekRows.length} done`
      : weekend
        ? 'Week closed. Set next week’s 3 on Monday'
        : (canon?.lastWeek?.length ?? 0) > 0
          ? 'New week. Set this week’s 3'
          : 'Set this week’s objectives',
    count: weeklyNeeds ? 1 : 0,
  }

  // ── Daily ──────────────────────────────────────────────────────────────────
  // Set once today's daily_focus row exists; unset (and asking) until then,
  // unless dismissed for the day. Always exactly 3 slots.
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

  const altitudes = [os, weekly, daily]
  const pending = altitudes.filter(a => a.needsAttention)
  const allSet = !loading && pending.length === 0

  // ── The ONE ask ────────────────────────────────────────────────────────────
  // Highest stale layer wins; Home renders exactly one CTA. An empty OS rung
  // outranks everything (nothing below can exist without it); OS staleness
  // alone never interrupts (it shows as a quiet marker on the rung instead).
  const cta: CanonCta | null = loading ? null
    : osEmpty ? { target: 'os', label: 'Set your OS goals' }
    : weeklyNeeds ? { target: 'weekly', label: 'Set this week’s 3' }
    : dailyNeeds ? { target: 'daily', label: 'Pick your 3 for today' }
    : null

  const dismissToday = useCallback(() => {
    flagToday(DISMISS_KEY)
    setV(v => v + 1)
  }, [])

  return {
    altitudes, os, weekly, daily,
    pending, cta, allSet, loading,
    dismissedToday,
    dismissToday,
  }
}
