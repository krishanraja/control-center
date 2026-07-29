import React from 'react'
import { Globe } from 'lucide-react'
import { useZone, ZONES } from '../../lib/civilDate'
import { useHaptics } from '../../hooks/useHaptics'

/**
 * The clock control. One setting drives every day boundary in the product: the
 * pilot gate and shutdown, the focus spine's week and day, daily_focus, the
 * ships rollup, and the pilot_daily view.
 *
 * Cycles rather than opening a menu, because there are only three and a cycle
 * is one thumb tap. Sits beside ThemeToggle in both navs, since it is the same
 * class of thing: a global switch the operator owns.
 */
export function TimezoneToggle({ expanded = true }: { expanded?: boolean }) {
  const { zone, meta, setZone } = useZone()
  const h = useHaptics()

  const cycle = () => {
    h.select()
    const i = ZONES.findIndex(z => z.id === zone)
    setZone(ZONES[(i + 1) % ZONES.length].id)
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={cycle}
        aria-label={`Timezone: ${meta.label}. Tap to change.`}
        title={`Timezone: ${meta.label} (${meta.hint})`}
        className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
      >
        <Globe className="w-4 h-4" strokeWidth={1.8} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Timezone: ${meta.label}. Tap to change.`}
      title="Every day boundary follows this"
      className="w-full min-h-[44px] flex items-center gap-2 px-2.5 rounded-lg text-white/55 hover:text-white/85 hover:bg-white/[0.06] transition-colors touch-manipulation"
    >
      <Globe className="w-4 h-4 shrink-0" strokeWidth={1.8} />
      <span className="text-[12px] truncate">{meta.label}</span>
      <span className="ml-auto text-[10px] text-white/30 shrink-0">{meta.hint}</span>
    </button>
  )
}
