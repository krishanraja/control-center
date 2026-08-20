import React from 'react'
import { Skeleton } from '../shared/Skeleton'
import { useDeferredPending } from '../shared/useDeferredPending'
import { useDailyFocus, isFocusEnabled } from '../../hooks/useDailyFocus'
import { CarryOverPrompt } from './CarryOverPrompt'
import { FocusCalibrator } from './FocusCalibrator'
import { ContextHeader } from './ContextHeader'
import { TrackStep } from './TrackStep'
import { CloseStep } from './CloseStep'
import { usePilotState } from '../../hooks/usePilot'

// The daily spine. One orchestrator that walks a single linear journey driven
// by daily_focus.status, replacing the five overlapping Home surfaces
// (next-action strip, FocusBar, FocusCalibrator, TopThreeCards, the brief banner).
// Nothing renders out of phase, so the day reads as one decision at a time:
//
//   context + commit  (no daily_focus row)  -> frame the day, then lock 3
//   track             (row exists)          -> do the work; a mapping banner
//                                              shows while status is 'pending'
//   close             (all 3 done)          -> reflect, seed tomorrow
//
// Gated by VITE_DAILY_FOCUS_ENABLED via isFocusEnabled(). Consumes only the
// existing shared hooks; opens no new realtime channels (ADR-002).
export function DailyDriver() {
  const { today, loading } = useDailyFocus()
  // Last night's ONE, seeded as the first slot so the pilot layer and the focus
  // spine hold one commitment rather than two.
  const { state: pilot } = usePilotState()
  const pilotOne = pilot?.last_evening?.tomorrow_one ?? null
  const waiting = useDeferredPending(loading)

  if (!isFocusEnabled()) return null
  // Feature-off is the only reason to render nothing. Once it is on there is
  // always either a calibrator or a tracker here, so the wait reserves that
  // space rather than letting the spine below jump when it lands.
  if (loading) {
    return <Skeleton quiet={!waiting} h={188} r={18} className="border border-white/[0.06]" />
  }

  // CONTEXT + COMMIT: no commitment yet. Read the frame, surface yesterday's
  // open loop, then lock today's 3.
  if (!today) {
    return (
      <div className="flex flex-col gap-3">
        <ContextHeader />
        <CarryOverPrompt />
        <FocusCalibrator pilotOne={pilotOne} />
      </div>
    )
  }

  // TRACK (with a mapping banner while status==='pending') + CLOSE once the
  // three are shipped or the row is marked complete.
  const allDone =
    !!today.target_1_completed_at &&
    !!today.target_2_completed_at &&
    !!today.target_3_completed_at

  return (
    <div className="flex flex-col gap-3">
      <TrackStep />
      {(allDone || today.status === 'complete') && <CloseStep />}
    </div>
  )
}
