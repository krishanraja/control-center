import { useCallback, useState } from 'react'
import { useObjectives } from './useObjectives'
import { useWeeklyFocus, isWeeklyFocusEnabled } from './useWeeklyFocus'
import { useDailyFocus, isFocusEnabled } from './useDailyFocus'
import { isFocusRitualEnabled } from '../lib/homeV2'
import { civilYmd } from '../lib/civilDate'
import { usePilotStateContext } from '../contexts/PilotStateContext'

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
  const pilot = usePilotStateContext()
  const [, setV] = useState(0)

  // Capacity gates DEMAND, not availability. On a depleted day the OS stops
  // asking for portfolio and weekly decisions, because reviewing objectives is
  // exactly the scope-expanding move the pilot layer exists to interrupt. The
  // daily altitude is deliberately never suppressed: one commitment is the
  // floor, and it is what red mode already runs on. Every altitude stays
  // reachable by tapping its pill, so nothing is taken away.
  const demandOk = pilot.profile.allowsHigherAltitudeDemand

  const loading = obj.loading || wf.loading || df.loading
  const todayYmd = civilYmd(new Date())
  const dismissedToday = safeGet(DISMISS_KEY) === todayYmd

  // ── Portfolio ──────────────────────────────────────────────────────────────
  // Needs attention when Marcus has nominated objectives to ratify, when the
  // board is empty, or when it's over the soft cap. Otherwise it's set.
  const noms = obj.nominations.length
  const noActive = obj.active_count === 0
  const overCap = obj.active_count > obj.soft_cap
  // Marcus-proposed milestones across the active board still awaiting accept/reject.
  const proposedMilestones = obj.active.reduce((s, o) => s + (o.proposed_milestone_count || 0), 0)
  const portfolioNeeds = demandOk && (noms > 0 || noActive || overCap || proposedMilestones > 0)
  const portfolio: Altitude = {
    id: 'portfolio',
    label: 'OS',
    state: noActive ? 'unset' : portfolioNeeds ? 'stale' : 'set',
    needsAttention: portfolioNeeds,
    summary: noActive
      ? 'No active objectives'
      : noms > 0
        ? `${noms} proposed to review`
        : proposedMilestones > 0
          ? `${proposedMilestones} milestone${proposedMilestones === 1 ? '' : 's'} to review`
          : overCap
            ? `${obj.active_count} active · over cap`
            : `${obj.active_count} active objective${obj.active_count === 1 ? '' : 's'}`,
    count: noms + proposedMilestones,
  }

  // ── Weekly ─────────────────────────────────────────────────────────────────
  // Participates when the weekly ritual is enabled (or the unified ritual flag is
  // on, which subsumes it). Set once committed for the current ISO week; stale on
  // a new uncommitted week with objectives to plan, until committed or snoozed.
  const weeklyActive = isWeeklyFocusEnabled() || isFocusRitualEnabled()
  const weeklySet = !!wf.thisWeek || wf.committedThisWeekLS
  const weeklyNeeds = demandOk && weeklyActive && !weeklySet && obj.active.length > 0 && !wf.snoozedToday
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
    summary: dailySet
      ? `Today ${doneCount}/${pilot.profile.targets}`
      : `Pick your ${pilot.profile.targets}`,
    count: dailyNeeds ? 1 : 0,
  }

  const altitudes = [portfolio, weekly, daily]
  const pending = altitudes.filter(a => a.needsAttention)
  const allSet = !loading && pending.length === 0

  const dismissToday = useCallback(() => {
    safeSet(DISMISS_KEY, civilYmd(new Date()))
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
