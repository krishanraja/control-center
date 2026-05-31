import React from 'react'
import { Target, ArrowRight } from 'lucide-react'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useHaptics } from '../../hooks/useHaptics'
import { TrackStep } from '../focus/TrackStep'
import { CloseStep } from '../focus/CloseStep'
import { openFocusRitual } from '../../lib/focusRitual'

// The day on the read-only board (Focus Ritual mode). Picking the 3 lives in the
// ritual, so this only tracks and closes: TrackStep once locked, CloseStep when
// all three ship. When nothing's locked yet it's a single calm nudge back into
// the ritual rather than the full picker eating the scroll.
export function BoardDaily() {
  const { today } = useDailyFocus()
  const h = useHaptics()

  if (!today) {
    return (
      <button
        type="button"
        onClick={() => { h.select(); openFocusRitual('daily') }}
        className="w-full flex items-center gap-3 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.06] to-transparent px-4 py-3.5 text-left active:bg-violet-500/[0.10] transition-colors"
      >
        <Target size={16} className="text-violet-300 flex-shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold text-white">Pick your 3 for today</span>
          <span className="block text-[11px] text-white/55 mt-0.5">Frame the day and lock today's focus.</span>
        </span>
        <ArrowRight size={15} className="text-violet-300/80 flex-shrink-0" />
      </button>
    )
  }

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
