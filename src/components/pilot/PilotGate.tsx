import React, { useState } from 'react'
import type { PilotMode } from '../../types/pilot'
import { usePilotState } from '../../hooks/usePilot'
import { MorningCheckin } from './MorningCheckin'
import { RedMode } from './RedMode'

// Wraps the entire app. Nothing renders behind it until today's morning
// check-in exists, and on a red day nothing renders behind it until either a
// ship is logged or the escape hatch is taken.
//
// Fails OPEN. If the pilot routes are unreachable the dashboard renders
// normally, because a broken check-in service must never be the thing that
// locks the operator out of his own control center.

export function PilotGate({ children }: { children: React.ReactNode }) {
  const { state, loading, error, refresh } = usePilotState()
  const [unlocked, setUnlocked] = useState(false)
  const [justChose, setJustChose] = useState<PilotMode | null>(null)

  if (loading) return null
  if (error || !state) return <>{children}</>

  const mode: PilotMode | null = justChose ?? state.morning?.mode ?? null

  if (!state.morning) {
    return (
      <MorningCheckin
        onDone={next => {
          setJustChose(next)
          refresh()
        }}
      />
    )
  }

  // A logged override on today's row survives a reload, so the escape hatch is
  // taken once per day rather than once per page load.
  const overrodeToday = Boolean(state.morning.override_at)

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
