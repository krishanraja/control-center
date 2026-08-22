import React from 'react'
import { ChevronRight, Compass } from '@/lib/icons'
import { IconTile } from '../shared/IconTile'
import { useHaptics } from '../../hooks/useHaptics'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * Home's door into Focus & Purpose (docs/FOCUS-PURPOSE.md).
 *
 * It used to be the last item on the vitals line, where two things went wrong
 * at once: on a narrow phone the line wrapped and "Focus" dropped alone onto a
 * second row, and sitting between MRR and the queue count it read as one more
 * metric — which it is doctrinally forbidden from being. Then it was a
 * full-width row, which spent a whole band of the screen on a doorway while
 * the + button floated alone beside it. Two shapes now:
 *
 *   - `row` (desktop): the full-width quiet row at the bottom of Home.
 *   - `pill` (mobile): a compact pill sharing the + button's band, label and
 *     chevron only — the tab explains itself once opened.
 *
 * The hub's rule carries over: nothing about the operator is ever counted back
 * at him from ambient chrome. No ask streak, no "3 this week", no state dot.
 */
export function FocusDoor({ onNavigate, variant = 'row' }: {
  onNavigate?: NavigateFn
  variant?: 'row' | 'pill'
}) {
  const h = useHaptics()
  const go = () => { h.select(); onNavigate?.('focus') }

  if (variant === 'pill') {
    return (
      <button
        type="button"
        data-testid="vitals-focus"
        onClick={go}
        className="group flex shrink-0 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] py-1.5 pl-1.5 pr-3 text-left transition-colors hover:bg-white/[0.05] active:scale-[0.98]"
      >
        <IconTile icon={Compass} size="sm" />
        <span className="text-ui font-semibold leading-none text-white/90">Focus</span>
        <ChevronRight size={14} className="text-white/30 transition-colors group-hover:text-white/60" aria-hidden />
      </button>
    )
  }

  return (
    <button
      type="button"
      data-testid="vitals-focus"
      onClick={go}
      className="group flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 text-left transition-colors hover:bg-white/[0.05] active:scale-[0.99]"
    >
      <IconTile icon={Compass} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block text-ui font-semibold leading-tight text-white/90">Focus</span>
        <span className="mt-0.5 block truncate text-label leading-tight text-white/45">
          Today&rsquo;s ask, and the scripts for hard conversations.
        </span>
      </span>
      <ChevronRight size={16} className="flex-shrink-0 text-white/30 transition-colors group-hover:text-white/60" aria-hidden />
    </button>
  )
}
