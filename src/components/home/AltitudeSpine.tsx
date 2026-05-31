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
}: {
  variant?: 'mobile' | 'desktop'
  onNavigate?: NavigateFn
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
      {!loading && (pending.length > 0 ? (
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
            <span className="block text-[15px] font-bold font-mono tabular-nums text-white leading-tight">
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
            <span className="block text-[15px] font-bold font-mono tabular-nums text-white leading-tight">{waiting}</span>
          </span>
          <span className={`ml-auto text-[10px] ${waiting > 0 ? 'text-amber-400/80' : 'text-white/45'}`}>
            {waiting === 0 ? 'inbox zero' : 'on you'}
          </span>
        </button>
      </div>
    </section>
  )
}

const DOT: Record<Altitude['state'], string> = {
  set: 'bg-emerald-400',
  stale: 'bg-amber-400',
  unset: 'bg-white/25',
}

function AltitudePill({ altitude, onOpen }: { altitude: Altitude; onOpen: () => void }) {
  const { label, state, summary, needsAttention } = altitude
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex flex-col items-start gap-1 rounded-2xl border px-3 py-2.5 text-left transition-colors min-h-[58px] ${
        needsAttention
          ? 'border-amber-400/30 bg-amber-500/[0.06] active:bg-amber-500/[0.10]'
          : 'border-white/[0.08] bg-white/[0.04] active:bg-white/[0.07]'
      }`}
    >
      <div className="flex items-center gap-1.5 w-full">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT[state]}`} />
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">{label}</span>
        <ChevronRight size={11} className="ml-auto text-white/30 flex-shrink-0" />
      </div>
      <span className="text-[11px] text-white/70 leading-snug line-clamp-2">{summary}</span>
    </button>
  )
}
