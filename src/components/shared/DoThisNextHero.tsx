import React from 'react'
import { useReducedMotion } from './motion'
import { Working } from './Working'

/**
 * DoThisNextHero — the ONE "what do I do next" hero every tab renders through
 * (P-13 / P-22 + the all-tabs consistency mandate). Tabs differ only in the
 * nouns/verbs they feed in; the grammar, layout, tones, and behavior are
 * identical everywhere so the whole app feels like one product.
 *
 * Calm & Anticipatory: while there's something to do, this is the one focal
 * surface — it breathes with a slow violet halo so the eye lands on it without a
 * single hard cue, and the rest of the screen stays still. When the next thing
 * changes, the new instruction rises in rather than snapping. When you're clear,
 * the bar exhales into a quiet, settled state.
 *
 * Device intent: on desktop (orchestrate) the primary action carries a keyboard
 * affordance — this is a command surface you flow through with the keyboard. On
 * mobile (decide) it's a single, thumb-scale tap.
 */
export type HeroTone = 'emerald' | 'violet' | 'sky' | 'amber' | 'neutral'

export interface HeroDescriptor {
  /** Plain-language instruction — WHAT to do. */
  headline: string
  /** Why / how many — the supporting line. */
  sub: string
  /** Primary button label. Omit for a "clear / caught up" state (no button). */
  actionLabel?: string
  /** Icon shown in the badge + button. */
  icon?: React.ReactNode
  tone?: HeroTone
  /** True when there's nothing to do — renders the calm "caught up" state. */
  clear?: boolean
}

const TONE_BG: Record<HeroTone, string> = {
  emerald: 'border-emerald-500/30 bg-emerald-500/[0.06]',
  violet: 'border-violet-500/25 bg-violet-500/[0.06]',
  sky: 'border-sky-500/30 bg-sky-500/[0.06]',
  amber: 'border-amber-500/30 bg-amber-500/[0.06]',
  neutral: 'border-emerald-500/20 bg-emerald-500/[0.04]',
}

const TONE_BTN: Record<HeroTone, string> = {
  emerald: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/30',
  violet: 'bg-violet-500/20 border-violet-400/40 text-violet-100 hover:bg-violet-500/30',
  sky: 'bg-sky-500/20 border-sky-400/40 text-sky-100 hover:bg-sky-500/30',
  amber: 'bg-amber-500/20 border-amber-400/40 text-amber-100 hover:bg-amber-500/30',
  neutral: 'bg-white/[0.06] border-white/15 text-white/80 hover:bg-white/[0.1]',
}

interface Props {
  descriptor: HeroDescriptor
  /** The one-tap primary action. Omit when `clear` or when using `actionSlot`. */
  onAct?: () => void
  busy?: boolean
  /** Custom action node (e.g. an inline date picker) — replaces the button. */
  actionSlot?: React.ReactNode
  narrow?: boolean
}

export function DoThisNextHero({ descriptor, onAct, busy, actionSlot, narrow }: Props) {
  const { headline, sub, actionLabel, icon, clear } = descriptor
  const tone: HeroTone = descriptor.tone || (clear ? 'neutral' : 'violet')
  const reduced = useReducedMotion()

  // The active "next" surface breathes; the cleared one exhales once and rests.
  const sectionMotion = clear
    ? (reduced ? '' : 'animate-exhale')
    : (reduced ? 'shadow-glass' : 'animate-focus-halo')

  return (
    <section
      aria-label="Do this next"
      className={`relative rounded-2xl border ${TONE_BG[tone]} ${narrow ? 'p-3.5' : 'px-5 py-4'} flex items-center gap-3 ${sectionMotion}`}
    >
      {icon && (
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
          {icon}
        </div>
      )}
      {/* Keyed on the headline so a new "next" gently rises in instead of swapping. */}
      <div key={headline} className={`min-w-0 flex-1 ${reduced ? '' : 'animate-rise'}`}>
        {!clear && (
          <p className="text-micro font-display uppercase tracking-[0.14em] text-accent/70 mb-1">Do this next</p>
        )}
        <p className={`${narrow ? 'text-ui' : 'text-lede'} font-display font-semibold text-white leading-[1.15] tracking-tight truncate`}>
          {headline}
        </p>
        <p className="text-label text-white/55 leading-snug truncate mt-0.5">{sub}</p>
      </div>
      {!clear && actionSlot}
      {!clear && !actionSlot && actionLabel && (
        <button
          type="button"
          onClick={onAct}
          disabled={busy}
          className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl px-4 font-semibold transition-colors disabled:opacity-50 min-h-[44px] text-body border outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${TONE_BTN[tone]}`}
        >
          {busy ? <Working size={14} /> : icon}
          {actionLabel}
          {/* Desktop is a keyboard-driven command surface: Tab to the action,
              press Enter. Hidden on touch, where it's a single tap. */}
          {!narrow && (
            <kbd className="ml-1 hidden md:inline-block rounded-md border border-white/20 bg-white/[0.08] px-1.5 py-0.5 text-micro font-mono leading-none text-white/60">
              ⏎
            </kbd>
          )}
        </button>
      )}
    </section>
  )
}
