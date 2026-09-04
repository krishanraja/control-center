import React from 'react'
import { Globe } from '@/lib/icons'
import { useZone, ZONES } from '../../lib/civilDate'
import { useHaptics } from '../../hooks/useHaptics'

/**
 * The clock control. One setting drives every day boundary in the product: the
 * pilot gate and shutdown, the focus spine's week and day, daily_focus, the
 * ships rollup, and the pilot_daily view.
 *
 * AUTO IS THE RESTING STATE and the cycle always returns to it. This used to be
 * a three-city cycle with no auto, so the operator carried the job of telling
 * the app where he was, and the app silently used a stale answer whenever he
 * forgot. Now it follows the device and the pins exist only for the case where
 * he wants the day boundary somewhere other than where he is standing.
 *
 * Cycles rather than opening a menu, because it is four states and a cycle is
 * one thumb tap. Sits beside ThemeToggle in both navs, since it is the same
 * class of thing: a global switch the operator owns.
 */
export function TimezoneToggle({ expanded = true }: { expanded?: boolean }) {
  const { zone, meta, auto, setZone } = useZone()
  const h = useHaptics()

  // Auto, then the three pins, then back to auto.
  const cycle = () => {
    h.select()
    if (auto) return setZone(ZONES[0].id)
    const i = ZONES.findIndex(z => z.id === zone)
    setZone(i === -1 || i === ZONES.length - 1 ? null : ZONES[i + 1].id)
  }

  // Auto shows where it has landed, not the word "auto". What he needs at a
  // glance is which day the app thinks it is on, and a label saying "Auto"
  // withholds exactly that.
  const label = meta.label
  const hint = auto ? 'auto' : meta.hint
  const description = auto
    ? `Timezone: ${meta.label}, following this device. Tap to pin one.`
    : `Timezone: pinned to ${meta.label}. Tap to change.`

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={cycle}
        aria-label={description}
        title={description}
        className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
      >
        <Globe size={16} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={description}
      title={auto ? 'Following this device. Every day boundary follows it.' : 'Pinned. Every day boundary follows this.'}
      className="w-full min-h-[44px] flex items-center gap-2 px-2.5 rounded-lg text-white/55 hover:text-white/85 hover:bg-white/[0.06] transition-colors touch-manipulation"
    >
      <Globe size={16} className="shrink-0" />
      <span className="text-label truncate">{label}</span>
      <span className={`ml-auto text-micro shrink-0 ${auto ? 'text-ink-muted' : 'text-violet-200'}`}>{hint}</span>
    </button>
  )
}
