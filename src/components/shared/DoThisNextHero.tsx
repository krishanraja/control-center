import React from 'react'
import { Loader2 } from 'lucide-react'

/**
 * DoThisNextHero — the ONE "what do I do next" hero every tab renders through
 * (P-13 / P-22 + the all-tabs consistency mandate). Tabs differ only in the
 * nouns/verbs they feed in; the grammar, layout, tones, and behavior are
 * identical everywhere so the whole app feels like one product.
 *
 * Each tab computes a `HeroDescriptor` from its own pile and passes it in.
 * Rendering, color tone, the "DO THIS NEXT" eyebrow, and the one-tap primary
 * button live here and nowhere else.
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

  return (
    <section
      aria-label="Do this next"
      className={`rounded-2xl border ${TONE_BG[tone]} ${narrow ? 'p-3.5' : 'px-5 py-4'} flex items-center gap-3`}
    >
      {icon && (
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        {!clear && (
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/40 mb-0.5">Do this next</p>
        )}
        <p className={`${narrow ? 'text-[14px]' : 'text-[15px]'} font-semibold text-white leading-snug truncate`}>
          {headline}
        </p>
        <p className="text-[12px] text-white/55 leading-snug truncate">{sub}</p>
      </div>
      {!clear && actionSlot}
      {!clear && !actionSlot && actionLabel && (
        <button
          type="button"
          onClick={onAct}
          disabled={busy}
          className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl px-4 font-semibold transition-colors disabled:opacity-50 min-h-[44px] text-[13px] border ${TONE_BTN[tone]}`}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : icon}
          {actionLabel}
        </button>
      )}
    </section>
  )
}
