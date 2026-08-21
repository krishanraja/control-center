import React from 'react'
import { Sun, Moon, Monitor, Sparkles } from 'lucide-react'
import { useTheme, type ThemeMode } from '../../lib/theme'
import { useHaptics } from '../../hooks/useHaptics'

const MODE_META: Record<ThemeMode, { Icon: typeof Sun; label: string }> = {
  system: { Icon: Monitor, label: 'System' },
  light: { Icon: Sun, label: 'Light' },
  dark: { Icon: Moon, label: 'Dark' },
}

/**
 * ThemeToggle — the "at will" control. A cycle button (System → Light → Dark)
 * plus a switch for the experimental ambient layer (aurora field + grain +
 * mood). Turn ambient off for a clean, flat adaptive light/dark.
 *
 * `expanded=false` collapses to icon-only (for the rail's narrow state).
 */
export function ThemeToggle({ expanded = true }: { expanded?: boolean }) {
  const { mode, ambient, cycleMode, setAmbient } = useTheme()
  const h = useHaptics()
  const { Icon, label } = MODE_META[mode]

  const onCycle = () => { h.select(); cycleMode() }
  const onAmbient = () => { h.select(); setAmbient(!ambient) }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onCycle}
        aria-label={`Theme: ${label}. Tap to change.`}
        title={`Theme: ${label}`}
        className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
      >
        <Icon className="w-4 h-4" strokeWidth={1.8} />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onCycle}
        aria-label={`Theme: ${label}. Tap to change.`}
        className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-label font-medium text-white/60 border border-white/[0.07] hover:text-white/90 hover:bg-white/[0.05] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
      >
        <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.9} />
        <span className="truncate">{label}</span>
      </button>
      <button
        type="button"
        onClick={onAmbient}
        aria-pressed={ambient}
        aria-label={`Ambient effects ${ambient ? 'on' : 'off'}`}
        title={`Ambient FX: ${ambient ? 'On' : 'Off'}`}
        className={`flex h-[30px] w-[30px] items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
          ambient
            ? 'border-violet-400/40 bg-violet-500/15 text-accent'
            : 'border-white/[0.07] text-white/35 hover:text-white/60 hover:bg-white/[0.05]'
        }`}
      >
        <Sparkles className="w-3.5 h-3.5" strokeWidth={1.9} />
      </button>
    </div>
  )
}
