import React, { useEffect } from 'react'
import { useDeviceClass, useReducedMotion } from './motion'
import { useHaptics } from '../../hooks/useHaptics'

/**
 * AllClear — the "you're done" moment. Replaces the old low-contrast "nothing
 * here" line with a small, earned sense of completion.
 *
 * Device-native, by design:
 *  • Mobile (decide): the screen exhales. A check draws itself inside a soft
 *    halo and a gentle success haptic fires — you cleared it, go live your life.
 *  • Desktop (orchestrate): a quieter, confident acknowledgment that keeps you
 *    in flow — it surfaces the next move (and the keyboard hint to take it)
 *    rather than celebrating, because a desk session isn't over yet.
 */
interface Props {
  /** Confident, plain headline — e.g. "You're all clear." */
  title: string
  /** Optional supporting line. */
  sub?: string
  /**
   * Desktop only: the natural next move, surfaced to keep momentum
   * (e.g. "Plan tomorrow", "Review pipeline"). Ignored on mobile.
   */
  nextHint?: { label: string; onClick?: () => void; shortcut?: string }
  /** Tone of the drawn check + halo. Defaults to emerald (complete). */
  tone?: 'emerald' | 'violet' | 'sky'
}

const TONE = {
  emerald: { stroke: '#34d399', halo: 'from-emerald-400/20 via-violet-400/10' },
  violet:  { stroke: '#a78bfa', halo: 'from-violet-400/20 via-sky-400/10' },
  sky:     { stroke: '#7dd3fc', halo: 'from-sky-400/20 via-emerald-400/10' },
}

/** A checkmark that draws itself once, calmly. */
function DrawnCheck({ size, stroke }: { size: number; stroke: string }) {
  const reduced = useReducedMotion()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="11" stroke={stroke} strokeOpacity="0.25" strokeWidth="1" />
      <path
        d="M6.5 12.5l3.5 3.5 7.5-8"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={reduced ? undefined : 'draw-check'}
        style={{ ['--len' as string]: 24 }}
      />
    </svg>
  )
}

export function AllClear({ title, sub, nextHint, tone = 'emerald' }: Props) {
  const device = useDeviceClass()
  const reduced = useReducedMotion()
  const h = useHaptics()
  const t = TONE[tone]

  // Mobile: a single, gentle success buzz on arrival — the felt reward for
  // reaching zero. Fires once when the all-clear state appears.
  useEffect(() => {
    if (device === 'mobile') h.success()
  }, [])

  if (device === 'mobile') {
    return (
      <div className={`flex flex-col items-center justify-center text-center px-8 py-14 ${reduced ? '' : 'animate-exhale'}`}>
        <div className="relative mb-6 flex items-center justify-center">
          <div className={`absolute -inset-8 rounded-full bg-gradient-to-br ${t.halo} to-transparent blur-2xl`} />
          <div className="relative w-[72px] h-[72px] rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center">
            <DrawnCheck size={40} stroke={t.stroke} />
          </div>
        </div>
        <p className="text-[19px] font-semibold text-white/90 tracking-tight">{title}</p>
        {sub && <p className="text-[13px] text-white/45 mt-2 max-w-[18rem] leading-relaxed">{sub}</p>}
      </div>
    )
  }

  // Desktop: quieter, and forward-leaning. The point isn't to celebrate — it's
  // to keep the session flowing to the next thing.
  return (
    <div className={`flex flex-col items-center justify-center text-center px-8 py-12 ${reduced ? '' : 'animate-exhale'}`}>
      <div className="relative mb-4 flex items-center justify-center">
        <div className={`absolute -inset-6 rounded-full bg-gradient-to-br ${t.halo} to-transparent blur-xl`} />
        <div className="relative w-14 h-14 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center">
          <DrawnCheck size={30} stroke={t.stroke} />
        </div>
      </div>
      <p className="text-[16px] font-semibold text-white/90 tracking-tight">{title}</p>
      {sub && <p className="text-[12.5px] text-white/45 mt-1.5 max-w-[22rem] leading-relaxed">{sub}</p>}
      {nextHint && (
        <button
          type="button"
          onClick={nextHint.onClick}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          {nextHint.label}
          {nextHint.shortcut && (
            <kbd className="rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-mono text-white/55">
              {nextHint.shortcut}
            </kbd>
          )}
        </button>
      )}
    </div>
  )
}
