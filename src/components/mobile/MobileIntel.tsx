import React, { useEffect, useState } from 'react'
import { MobileShell as MobileShellPrim, TabHeader,
  HeaderSubtitleSkeleton, HeroCard, FeedCard, FeedRow, EmptyState, MobileLoadingScreen } from './primitives'
import { useHaptics } from '../../hooks/useHaptics'
import { supabase } from '../../lib/supabase'
import { AskMarcus } from '../AskMarcus'
import { FleetFunnelPanel } from '../FleetFunnelPanel'
import { NextIntelMobileHero } from '../intel/NextIntelMobileHero'
import { BetsStrip } from '../intel/BetsStrip'
import { SignalSheet, URGENCY_DOT, URGENCY_ACCENT, urgencyChip } from '../intel/SignalSheet'
import type { ExternalSignal } from '../../hooks/useHomeIntelligence'

interface Metric {
  id: string
  label: string
  value: string
  target?: string
  progress_pct?: number
}

interface IntelState {
  signals: ExternalSignal[]
  metrics: Metric[]
  headline?: string
  recommendedFocus?: string
  generatedAt?: string
  loading: boolean
}

export function MobileIntel() {
  const h = useHaptics()
  const [state, setState] = useState<IntelState>({ signals: [], metrics: [], loading: true })
  const [openSignal, setOpenSignal] = useState<ExternalSignal | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('home_intelligence')
        .select('summary, external_signals, metrics, generated_at')
        .eq('id', 'current')
        .single()
      if (cancelled || !data) {
        setState(s => ({ ...s, loading: false }))
        return
      }
      const summary = typeof data.summary === 'string' ? safeJson(data.summary) : (data.summary || {})
      const metrics = Array.isArray(data.metrics)
        ? data.metrics
        : (typeof data.metrics === 'string' ? safeJson<Metric[]>(data.metrics, []) : [])
      const signals = Array.isArray(data.external_signals)
        ? data.external_signals
        : (typeof data.external_signals === 'string' ? safeJson<ExternalSignal[]>(data.external_signals, []) : [])
      setState({
        signals: signals || [],
        metrics: metrics || [],
        headline: summary?.headline,
        recommendedFocus: summary?.recommended_focus,
        generatedAt: data.generated_at,
        loading: false,
      })
    })()
    return () => { cancelled = true }
  }, [])

  const hero = state.signals[0] || null
  const rest = state.signals.slice(1)

  if (state.loading && state.signals.length === 0 && state.metrics.length === 0) {
    return <MobileLoadingScreen title="Intelligence" subtitle="Gathering fresh signals…" />
  }

  return (
    <MobileShellPrim
      header={
        <TabHeader
          title="Intelligence"
          subtitle={
            state.loading
              ? <HeaderSubtitleSkeleton w={176} />
              : state.headline || (state.generatedAt ? `Updated ${humanAgo(state.generatedAt)}` : 'Marcus synthesis')
          }
        />
      }
    >
      <NextIntelMobileHero
        signals={state.signals}
        onOpen={(sig) => { h.select(); setOpenSignal(sig) }}
      />

      <AskMarcus />
      {hero && (
        <HeroCard
          eyebrow={urgencyChip(hero.urgency, hero.days_until) || 'Top signal'}
          accent={hero.urgency ? URGENCY_ACCENT[hero.urgency] : 'amber'}
          dotColor={hero.urgency ? URGENCY_DOT[hero.urgency] : undefined}
          title={hero.signal}
          detail={hero.relevance}
          meta={hero.recommended_action ? `Move: ${truncate(hero.recommended_action, 80)}` : hero.source}
          cta="Open"
          onClick={() => { h.select(); setOpenSignal(hero) }}
        />
      )}

      {state.metrics.length > 0 && (
        <FeedCard title={`KPIs · ${state.metrics.length}`}>
          {state.metrics.map(m => {
            const pct = Math.max(0, Math.min(100, m.progress_pct ?? 0))
            const color =
              pct >= 80 ? 'bg-emerald-400' :
              pct >= 40 ? 'bg-amber-400' :
              'bg-red-400'
            return (
              <div key={m.id} className="px-7 py-5 flex items-center gap-4" style={{ minHeight: 88 }}>
                <div className="flex-1 min-w-0">
                  <p className="text-title font-semibold text-white leading-snug truncate">
                    {m.label}
                  </p>
                  <div className="flex items-baseline gap-2 mt-1.5">
                    <span className="text-lede text-white/85 tabular-nums">{m.value}</span>
                    {m.target && (
                      <span className="text-ui text-white/35 tabular-nums">/ {m.target}</span>
                    )}
                  </div>
                  <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden mt-3">
                    <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className={`text-title font-bold tabular-nums ${pct >= 80 ? 'text-emerald-300' : pct >= 40 ? 'text-amber-300' : 'text-red-300'}`}>
                  {pct}%
                </span>
              </div>
            )
          })}
        </FeedCard>
      )}

      {/* BETS — falsifiable hypotheses with clocks. Relocated from Home's
          ambient fold in the 2026-08-20 recompose; Intel owns hypotheses. */}
      <BetsStrip />

      {rest.length > 0 && (
        <FeedCard title={`More signals · ${rest.length}`}>
          {rest.map((sig, i) => {
            const chip = urgencyChip(sig.urgency, sig.days_until)
            return (
              <FeedRow
                key={i}
                dotColor={sig.urgency ? URGENCY_DOT[sig.urgency] : 'bg-amber-400'}
                title={sig.signal}
                detail={sig.relevance}
                trailing={chip ? (
                  <span className="text-label font-semibold tabular-nums text-white/70">{chip}</span>
                ) : null}
                onClick={() => { h.select(); setOpenSignal(sig) }}
              />
            )
          })}
        </FeedCard>
      )}

      {state.recommendedFocus && (
        <FeedCard title="Focus this week">
          <div className="px-7 py-5 text-lede text-amber-100/85 leading-relaxed">
            {state.recommendedFocus}
          </div>
        </FeedCard>
      )}

      {!hero && state.metrics.length === 0 && !state.loading && (
        <EmptyState label="No fresh intelligence yet — Marcus runs Mon/Wed/Fri." />
      )}

      <FleetFunnelPanel />

      <SignalSheet signal={openSignal} onClose={() => setOpenSignal(null)} />
    </MobileShellPrim>
  )
}

function safeJson<T = any>(s: string, fallback?: T): T {
  try { return JSON.parse(s) } catch { return (fallback as T) }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function humanAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
