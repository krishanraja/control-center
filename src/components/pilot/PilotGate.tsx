import React, { useEffect, useState } from 'react'
import type { PilotMode } from '../../types/pilot'
import { usePilotState } from '../../hooks/usePilot'
import { intentByKey, type Intent } from '../../lib/pilotIntent'
import { MorningCheckin } from './MorningCheckin'
import { RedMode } from './RedMode'

// Wraps the entire app. Nothing renders behind it until today's morning
// check-in exists, and on a red day nothing renders behind it until either a
// ship is logged or the escape hatch is taken.
//
// Fails OPEN. If the pilot routes are unreachable the dashboard renders
// normally, because a broken check-in service must never be the thing that
// locks the operator out of his own control center.

/**
 * Once a day means once a day.
 *
 * The date check alone was not enough. The civil day can roll over while the
 * operator is mid-session, and the gate would reappear on a day he had already
 * answered. So a morning row inside this window suppresses the gate regardless
 * of what date it was filed under. Slightly under a full day, so a genuine next
 * morning is never suppressed.
 */
const SUPPRESS_MS = 20 * 60 * 60 * 1000

interface Props {
  children: React.ReactNode
  /** Called once, after a check-in, with the surface the day is for. */
  onIntent?: (intent: Intent) => void
}

export function PilotGate({ children, onIntent }: Props) {
  const { state, loading, error, refresh } = usePilotState()
  const [unlocked, setUnlocked] = useState(false)
  const [justChose, setJustChose] = useState<PilotMode | null>(null)
  const [routed, setRouted] = useState(false)

  // Route to the day's intent once, after the gate clears. Only on a green day:
  // red mode owns the screen and must not be navigated out from under.
  const savedIntent = intentByKey(state?.morning?.intent)
  const mode: PilotMode | null = justChose ?? state?.morning?.mode ?? null
  useEffect(() => {
    if (routed || !onIntent || !savedIntent) return
    if (mode !== 'green') return
    setRouted(true)
    onIntent(savedIntent)
  }, [routed, onIntent, savedIntent, mode])

  if (loading) return null
  if (error || !state) return <>{children}</>

  const recentMorning = state.last_morning_at
    ? Date.now() - new Date(state.last_morning_at).getTime() < SUPPRESS_MS
    : false
  const answered = Boolean(state.morning) || recentMorning

  if (!answered) {
    return (
      <MorningCheckin
        onDone={(next, intent) => {
          setJustChose(next)
          if (next === 'green' && intent) { setRouted(true); onIntent?.(intent) }
          refresh()
        }}
      />
    )
  }

  // A logged override on today's row survives a reload, so the escape hatch is
  // taken once per day rather than once per page load.
  const overrodeToday = Boolean(state.morning?.override_at)

  if (mode === 'red' && !unlocked && !overrodeToday) {
    return (
      <RedMode
        lastEvening={state.last_evening}
        onUnlock={() => { setUnlocked(true); refresh() }}
      />
    )
  }

  return <>{children}</>
}
