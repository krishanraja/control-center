import React from 'react'
import {
  TrendingUp, TrendingDown, Inbox, ChevronRight, CheckCircle2, ArrowRight,
} from 'lucide-react'
import { useAltitudes, type Altitude, type AltitudeId } from '../../hooks/useAltitudes'
import { useRevenueAttribution } from '../../hooks/useRevenueAttribution'
import { splitDecisions } from '../../lib/decisionKinds'
import { useRealtimeDecisionsWaiting } from '../../hooks/useRealtimeDecisionsWaiting'
import { useHaptics } from '../../hooks/useHaptics'
import { openFocusRitual } from '../../lib/focusRitual'
import { formatMrr } from '../../lib/mrrDisplay'

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

  // Q1 contract: the spine's number is the same typed-rulings count as the anchor.
  const waiting = splitDecisions(decisions).decisions.length
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
          className="w-full flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-left active:bg-white/[0.07] transition-colors"
        >
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] font-semibold text-white">
              Set what's stale ({pending.length})
            </span>
            <span className="block text-[11px] text-white/45 mt-0.5">
              {pending.map(p => p.label).join(' · ')} · {budget}
            </span>
          </span>
          <span className="flex-shrink-0 inline-flex items-center gap-1 text-[12px] font-semibold text-white/80 bg-white/[0.06] border border-white/10 rounded-lg px-3 py-1.5">
            Start <ArrowRight size={13} />
          </span>
        </button>
      ) : (
        <div className="w-full flex items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5">
          <CheckCircle2 size={15} className="text-status-active flex-shrink-0" />
          <span className="text-[13px] font-semibold text-white/80">You're set for today</span>
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
            ? <TrendingUp size={13} className="text-status-active flex-shrink-0" />
            : <TrendingDown size={13} className="text-status-blocked flex-shrink-0" />}
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">MRR</span>
            <span className="block text-[16px] font-bold font-mono tabular-nums text-white leading-tight">
              {revLoading ? '—' : formatMrr(liveMrr)}
            </span>
          </span>
          {!revLoading && (
            <span className={`ml-auto text-[10px] tabular-nums ${deltaPositive ? 'text-status-active/90' : 'text-status-blocked/90'}`}>
              {deltaPositive ? '+' : ''}{Math.round(mrrDelta7d).toLocaleString()}/wk
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => { h.select(); onNavigate?.('today') }}
          className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-left active:bg-white/[0.07] transition-colors"
        >
          <Inbox size={13} className={waiting > 0 ? 'text-status-needsYou flex-shrink-0' : 'text-white/40 flex-shrink-0'} />
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">Waiting</span>
            <span className="block text-[16px] font-bold font-mono tabular-nums text-white leading-tight">{waiting}</span>
          </span>
          <span className={`ml-auto text-[10px] ${waiting > 0 ? 'text-status-needsYou/90' : 'text-white/45'}`}>
            {waiting === 0 ? 'decision zero' : 'on you'}
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
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] font-semibold text-white/70">
        <CheckCircle2 size={13} className="text-status-active flex-shrink-0" />
        Set
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => { h.select(); openFocusRitual(null) }}
      aria-label={`Set what's stale, ${pending.length} pending`}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.05] px-3 py-1.5 text-[12px] font-semibold text-white/80 active:bg-white/[0.08] transition-colors"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-status-needsYou flex-shrink-0" />
      <span className="whitespace-nowrap">Set stale · {pending.length}</span>
      <ArrowRight size={13} className="flex-shrink-0 text-white/50" />
    </button>
  )
}

const DOT: Record<Altitude['state'], string> = {
  set:   'bg-status-active',
  stale: 'bg-status-needsYou',
  unset: 'bg-white/40',
}

function AltitudePill({ altitude, onOpen }: { altitude: Altitude; onOpen: () => void }) {
  const { label, state, summary, needsAttention, count } = altitude
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative overflow-hidden flex flex-col items-start gap-1.5 rounded-2xl border px-3.5 py-3.5 text-left transition-colors min-h-[84px] ${
        needsAttention
          ? 'border-white/[0.12] bg-white/[0.055] active:bg-white/[0.08]'
          : 'border-white/[0.07] bg-white/[0.03] active:bg-white/[0.06]'
      }`}
    >
      <div className="flex items-center gap-1.5 w-full">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[state]}`} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">{label}</span>
        {needsAttention && count > 0 && (
          <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-white/[0.08] text-white/70 text-[10px] font-semibold tabular-nums leading-none">
            {count}
          </span>
        )}
        <ChevronRight size={12} className="ml-auto text-white/25 flex-shrink-0" />
      </div>
      <span className={`text-[14px] leading-snug line-clamp-2 ${needsAttention ? 'text-white/90 font-medium' : 'text-white/60'}`}>{summary}</span>
    </button>
  )
}
