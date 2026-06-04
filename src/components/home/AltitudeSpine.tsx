import React from 'react'
import {
  TrendingUp, TrendingDown, Inbox, ChevronRight, CheckCircle2, ArrowRight,
} from 'lucide-react'
import { useAltitudes, type Altitude, type AltitudeId } from '../../hooks/useAltitudes'
import { useRevenueAttribution } from '../../hooks/useRevenueAttribution'
import { useRealtimeDecisionsWaiting } from '../../hooks/useRealtimeDecisionsWaiting'
import { useHaptics } from '../../hooks/useHaptics'
import { openFocusRitual } from '../../lib/focusRitual'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * The always-on altitude spine: the single "where am I across portfolio / week /
 * today, and what's the one thing to set" control. Replaces GlanceHeader's role
 * under the unified Focus Ritual. One CTA opens the ritual at the first stale
 * altitude; each pill opens it at that altitude; Money/Waiting stay glanceable.
 */
export function AltitudeSpine({
  variant = 'mobile',
  onNavigate,
  showStaleCta = true,
}: {
  variant?: 'mobile' | 'desktop'
  onNavigate?: NavigateFn
  // When false, the inline "set what's stale" banner is omitted — used on
  // mobile, where the cue is relocated into the header (see StaleHeaderCue).
  showStaleCta?: boolean
}) {
  const h = useHaptics()
  const { altitudes, pending, allSet, loading } = useAltitudes()
  const { liveMrr, mrrDelta7d, loading: revLoading } = useRevenueAttribution()
  const { decisions } = useRealtimeDecisionsWaiting()

  const waiting = decisions.length
  const deltaPositive = mrrDelta7d >= 0

  const open = (id: AltitudeId | null) => { h.select(); openFocusRitual(id) }

  // ~1 minute budget per stale altitude — a bounded promise that kills avoidance.
  const budget = pending.length <= 1 ? '~1 min' : `~${pending.length} min`

  return (
    <section className={`flex flex-col gap-2.5 ${variant === 'mobile' ? 'px-1' : ''}`} aria-label="Altitudes">
      {/* CTA / set-state banner */}
      {showStaleCta && !loading && (pending.length > 0 ? (
        <button
          type="button"
          onClick={() => open(null)}
          className="w-full flex items-center gap-3 rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-500/[0.14] to-violet-500/[0.04] px-4 py-3 text-left active:from-violet-500/20 transition-colors"
        >
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] font-semibold text-white">
              Set what's stale ({pending.length})
            </span>
            <span className="block text-[11px] text-violet-200/70 mt-0.5">
              {pending.map(p => p.label).join(' · ')} · {budget}
            </span>
          </span>
          <span className="flex-shrink-0 inline-flex items-center gap-1 text-[12px] font-semibold text-violet-100 bg-violet-500/30 border border-violet-400/40 rounded-lg px-3 py-1.5">
            Start <ArrowRight size={13} />
          </span>
        </button>
      ) : (
        <div className="w-full flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-2.5">
          <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0" />
          <span className="text-[13px] font-semibold text-emerald-100">You're set for today</span>
        </div>
      ))}

      {/* Altitude pills */}
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Altitude status">
        {altitudes.map(a => (
          <AltitudePill key={a.id} altitude={a} onOpen={() => open(a.id)} />
        ))}
      </div>

      {/* Money + Waiting — passive numbers, tappable to their surfaces. */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => { h.select(); onNavigate?.('customers') }}
          className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-left active:bg-white/[0.07] transition-colors"
        >
          {deltaPositive
            ? <TrendingUp size={13} className="text-emerald-400 flex-shrink-0" />
            : <TrendingDown size={13} className="text-rose-400 flex-shrink-0" />}
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">MRR</span>
            <span className="block text-[16px] font-bold font-mono tabular-nums text-white leading-tight">
              {revLoading ? '—' : `$${Math.round(liveMrr).toLocaleString()}`}
            </span>
          </span>
          {!revLoading && (
            <span className={`ml-auto text-[10px] tabular-nums ${deltaPositive ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
              {deltaPositive ? '+' : ''}{Math.round(mrrDelta7d).toLocaleString()}/wk
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => { h.select(); onNavigate?.('today') }}
          className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-left active:bg-white/[0.07] transition-colors"
        >
          <Inbox size={13} className={waiting > 0 ? 'text-amber-400 flex-shrink-0' : 'text-white/40 flex-shrink-0'} />
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">Waiting</span>
            <span className="block text-[16px] font-bold font-mono tabular-nums text-white leading-tight">{waiting}</span>
          </span>
          <span className={`ml-auto text-[10px] ${waiting > 0 ? 'text-amber-400/80' : 'text-white/45'}`}>
            {waiting === 0 ? 'inbox zero' : 'on you'}
          </span>
        </button>
      </div>
    </section>
  )
}

/**
 * Compact "set what's stale" cue for the mobile header — the relocated, glanceable
 * twin of the inline banner. Sits beside the logo so the altitude cards below it
 * own the screen. One tap opens the ritual at the first stale altitude.
 */
export function StaleHeaderCue() {
  const h = useHaptics()
  const { pending, loading } = useAltitudes()

  if (loading) return null

  if (pending.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-1.5 text-[12px] font-semibold text-emerald-100">
        <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />
        Set
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => { h.select(); openFocusRitual(null) }}
      aria-label={`Set what's stale, ${pending.length} pending`}
      className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/[0.18] px-3 py-1.5 text-[12px] font-semibold text-violet-100 active:bg-violet-500/30 transition-colors animate-neon-pulse-violet"
    >
      <span className="whitespace-nowrap">Set stale · {pending.length}</span>
      <ArrowRight size={13} className="flex-shrink-0" />
    </button>
  )
}

const DOT: Record<Altitude['state'], string> = {
  set: 'bg-emerald-400',
  stale: 'bg-amber-400',
  unset: 'bg-white/25',
}

function AltitudePill({ altitude, onOpen }: { altitude: Altitude; onOpen: () => void }) {
  const { label, state, summary, needsAttention, count } = altitude
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative overflow-hidden flex flex-col items-start gap-1.5 rounded-2xl border px-3.5 py-3.5 text-left transition-colors min-h-[84px] ${
        needsAttention
          ? 'border-amber-400/40 bg-amber-500/[0.08] active:bg-amber-500/[0.12] animate-neon-pulse shimmer-sweep'
          : 'border-white/[0.08] bg-white/[0.04] active:bg-white/[0.07]'
      }`}
    >
      <div className="flex items-center gap-1.5 w-full">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT[state]} ${needsAttention ? 'animate-pulse' : ''}`} />
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">{label}</span>
        {needsAttention && count > 0 && (
          <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-amber-400/20 text-amber-200 text-[10px] font-bold tabular-nums leading-none">
            {count}
          </span>
        )}
        <ChevronRight size={12} className="ml-auto text-white/30 flex-shrink-0" />
      </div>
      <span className={`text-[14px] leading-snug line-clamp-2 ${needsAttention ? 'text-amber-50/90 font-medium' : 'text-white/70'}`}>{summary}</span>
    </button>
  )
}
