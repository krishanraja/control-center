import React, { useEffect, useMemo, useState } from 'react'
import { Zap } from 'lucide-react'
import { MobileShell as MobileShellPrim, TabHeader, HeroCard, FeedCard, FeedRow, EmptyState } from './primitives'
import { DetailSheet } from './DetailSheet'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { supabase } from '../../lib/supabase'
import { AskMarcus } from '../AskMarcus'
import { NextActionStrip } from '../shared/NextActionStrip'

type SignalUrgency = 'critical' | 'high' | 'medium' | 'low'

interface ExternalSignal {
  signal: string
  source?: string
  relevance?: string
  recommended_action?: string | null
  // Extended fields — Marcus prompt patch 2026-05-21 populates these so the
  // UI can render an urgency chip, a days-until countdown, and a deep-link
  // back to the source artifact (CFP url, podcast url, etc.).
  source_url?: string | null
  event_id?: string | null
  urgency?: SignalUrgency | null
  days_until?: number | null
}

const URGENCY_DOT: Record<SignalUrgency, string> = {
  critical: 'bg-red-500',
  high:     'bg-red-400',
  medium:   'bg-amber-400',
  low:      'bg-violet-400',
}

const URGENCY_ACCENT: Record<SignalUrgency, 'red' | 'amber' | 'violet'> = {
  critical: 'red',
  high:     'red',
  medium:   'amber',
  low:      'violet',
}

function urgencyChip(u?: SignalUrgency | null, days?: number | null): string | undefined {
  if (!u && (days == null || !Number.isFinite(days))) return undefined
  const label = u ? u.toUpperCase() : ''
  const dayPart = (days != null && Number.isFinite(days))
    ? (days <= 0 ? 'past' : `${days}d`)
    : ''
  return [label, dayPart].filter(Boolean).join(' · ')
}

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
  const { toast } = useToast()
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

  // "Hot" signals on mobile = urgency critical|high. Mirrors desktop's score>=8
  // filter using the field that mobile's data source actually carries.
  const hotSignals = useMemo(
    () => state.signals.filter(s => s.urgency === 'critical' || s.urgency === 'high'),
    [state.signals],
  )

  return (
    <MobileShellPrim
      header={
        <TabHeader
          title="Intelligence"
          subtitle={
            state.loading
              ? 'Loading…'
              : state.headline || (state.generatedAt ? `Updated ${humanAgo(state.generatedAt)}` : 'Marcus synthesis')
          }
        />
      }
    >
      <NextActionStrip
        headline={hotSignals.length}
        headlineLabel="hot"
        insight={hero
          ? `Top: ${hero.signal.slice(0, 90)}${hero.signal.length > 90 ? '…' : ''}`
          : state.signals.length > 0
            ? `${state.signals.length} signal${state.signals.length === 1 ? '' : 's'} tracked — nothing critical yet`
            : 'Marcus is synthesizing. Check back after his next run.'}
        ctaLabel={hero ? 'Open' : 'View signals'}
        onCta={() => { if (hero) { h.select(); setOpenSignal(hero) } }}
        icon={Zap}
        accent={hotSignals.length > 0 ? 'text-amber-300' : 'text-violet-300'}
        disabled={!hero}
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
                  <p className="text-[20px] font-semibold text-white leading-snug truncate">
                    {m.label}
                  </p>
                  <div className="flex items-baseline gap-2 mt-1.5">
                    <span className="text-[16px] text-white/85 tabular-nums">{m.value}</span>
                    {m.target && (
                      <span className="text-[14px] text-white/35 tabular-nums">/ {m.target}</span>
                    )}
                  </div>
                  <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden mt-3">
                    <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className={`text-[22px] font-bold tabular-nums ${pct >= 80 ? 'text-emerald-300' : pct >= 40 ? 'text-amber-300' : 'text-red-300'}`}>
                  {pct}%
                </span>
              </div>
            )
          })}
        </FeedCard>
      )}

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
                  <span className="text-[12px] font-semibold tabular-nums text-white/70">{chip}</span>
                ) : null}
                onClick={() => { h.select(); setOpenSignal(sig) }}
              />
            )
          })}
        </FeedCard>
      )}

      {state.recommendedFocus && (
        <FeedCard title="Focus this week">
          <div className="px-7 py-5 text-[16px] text-amber-100/85 leading-relaxed">
            {state.recommendedFocus}
          </div>
        </FeedCard>
      )}

      {!hero && state.metrics.length === 0 && !state.loading && (
        <EmptyState label="No fresh intelligence yet — Marcus runs Mon/Wed/Fri." />
      )}

      <DetailSheet
        open={openSignal != null}
        onClose={() => setOpenSignal(null)}
        eyebrow={
          urgencyChip(openSignal?.urgency, openSignal?.days_until) ||
          openSignal?.source ||
          'Marcus signal'
        }
        title={openSignal?.signal || ''}
        body={
          openSignal
            ? [
                openSignal.relevance ? `Why it matters: ${openSignal.relevance}` : null,
                openSignal.recommended_action ? `Recommended move: ${openSignal.recommended_action}` : null,
                openSignal.source ? `Source: ${openSignal.source}` : null,
              ].filter(Boolean).join('\n\n')
            : undefined
        }
        agent="marcus"
        docUrl={openSignal?.source_url || undefined}
        actions={openSignal ? [
          {
            label: 'Create task',
            variant: 'primary',
            onClick: async () => {
              h.heavy()
              try {
                const r = await fetch('/api/task', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    title: openSignal.recommended_action || openSignal.signal,
                    description: [openSignal.signal, openSignal.relevance, openSignal.source_url].filter(Boolean).join('\n\n'),
                    owner: 'krish',
                    agent: 'marcus',
                    status: 'todo',
                    priority: openSignal.urgency === 'high' ? 'high' : 'medium',
                    workstream: 'intel',
                  }),
                })
                if (!r.ok) throw new Error(`HTTP ${r.status}`)
                h.success()
                toast('Task created.', 'success')
                setOpenSignal(null)
              } catch (e: any) {
                h.error()
                toast(`Could not create task: ${e?.message || 'try again'}`, 'error')
              }
            },
          },
          {
            label: 'Add to bets',
            variant: 'secondary',
            onClick: async () => {
              h.heavy()
              try {
                const r = await fetch('/api/bets/', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    hypothesis: openSignal.signal,
                    wins_if: openSignal.recommended_action || 'Krish acts on this signal',
                    kind: 'experiment',
                    measure_by_days: 14,
                  }),
                })
                if (!r.ok) throw new Error(`HTTP ${r.status}`)
                h.success()
                toast('Added to bets.', 'success')
                setOpenSignal(null)
              } catch (e: any) {
                h.error()
                toast(`Could not add: ${e?.message || 'try again'}`, 'error')
              }
            },
          },
        ] : []}
      />
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
