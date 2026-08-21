import React from 'react'
import { ChevronRight, Compass } from 'lucide-react'
import { useHaptics } from '../../hooks/useHaptics'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * Home's door into Focus & Purpose (docs/FOCUS-PURPOSE.md).
 *
 * It used to be the last item on the vitals line, where two things went wrong
 * at once: on a narrow phone the line wrapped and "Focus" dropped alone onto a
 * second row, and sitting between MRR and the queue count it read as one more
 * metric — which it is doctrinally forbidden from being. So it is its own
 * full-width row now, in the quiet space at the bottom of Home: unmistakably a
 * doorway, never a number.
 *
 * The hub's rule carries over: nothing about the operator is ever counted back
 * at him from ambient chrome. No ask streak, no "3 this week", no state dot.
 * One label, one plain line about what is inside, one chevron.
 */
export function FocusDoor({ onNavigate, compact = false }: { onNavigate?: NavigateFn; compact?: boolean }) {
  const h = useHaptics()
  return (
    <button
      type="button"
      data-testid="vitals-focus"
      onClick={() => { h.select(); onNavigate?.('focus') }}
      className={`group flex w-full items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-left transition-colors hover:bg-white/[0.05] active:scale-[0.99] ${compact ? 'gap-2.5 px-3.5 py-2' : 'gap-3 px-4 py-3.5'}`}
    >
      <span className={`inline-flex flex-shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.04] text-white/70 ${compact ? 'h-7 w-7' : 'h-9 w-9'}`}>
        <Compass size={compact ? 14 : 16} aria-hidden />
      </span>
      {compact ? (
        // One line on a phone: the door must not out-weigh the canon above it.
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="text-ui font-semibold leading-tight text-white/90">Focus</span>
          <span className="min-w-0 truncate text-label leading-tight text-white/45">
            Today&rsquo;s ask, scripts, steadying moves.
          </span>
        </span>
      ) : (
        <span className="min-w-0 flex-1">
          <span className="block text-ui font-semibold leading-tight text-white/90">Focus</span>
          <span className="mt-0.5 block truncate text-label leading-tight text-white/45">
            Today&rsquo;s ask, and the scripts for hard conversations.
          </span>
        </span>
      )}
      <ChevronRight size={16} className="flex-shrink-0 text-white/30 transition-colors group-hover:text-white/60" aria-hidden />
    </button>
  )
}
