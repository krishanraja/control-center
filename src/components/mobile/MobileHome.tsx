import React, { useEffect, useState } from 'react'
import { MobileShell as MobileShellPrim, TabHeader, HeroCard, StatPill, FeedCard, FeedRow, EmptyState } from './primitives'
import { DetailSheet } from './DetailSheet'
import { Logomark } from './Logomark'
import { useRealtimeTasks, type TaskRow } from '../../hooks/useRealtimeTasks'
import { useRealtimeLeads } from '../../hooks/useRealtimeLeads'
import { useRealtimeContentIdeas } from '../../hooks/useRealtimeContentIdeas'
import { useHaptics } from '../../hooks/useHaptics'
import { supabase } from '../../lib/supabase'
import { MrrTicker } from '../MrrTicker'
import { DailyBriefBanner } from '../DailyBriefBanner'
import { StreakPills } from '../StreakPills'
import { DailyLockBanner } from '../DailyLockBanner'

interface ExternalSignal {
  signal: string
  source?: string
  relevance?: string
  recommended_action?: string | null
}

type NavigateFn = (tab: string, params?: Record<string, string>) => void

export function MobileHome({ onNavigate }: { onNavigate?: NavigateFn } = {}) {
  const h = useHaptics()
  const { tasks } = useRealtimeTasks()
  const { leads } = useRealtimeLeads({
    statusIn: ['new', 'enriching', 'ready', 'contacted', 'conversation'],
  })
  const { ideas } = useRealtimeContentIdeas({
    stateIn: ['seeded', 'researching', 'drafting', 'review'],
  })
  const [signals, setSignals] = useState<ExternalSignal[]>([])
  const [openSignal, setOpenSignal] = useState<ExternalSignal | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('home_intelligence')
        .select('external_signals, summary')
        .eq('id', 'current')
        .single()
      if (cancelled || !data) return
      const raw = data.external_signals
      const parsed: ExternalSignal[] = Array.isArray(raw)
        ? raw
        : (typeof raw === 'string' ? safeParse(raw) : [])
      setSignals(parsed)
    })()
    return () => { cancelled = true }
  }, [])

  const waiting = tasks.filter(t => t.status === 'waiting' && !isNoise(t)).slice(0, 5)
  const heroSignal = signals[0] || null

  return (
    <MobileShellPrim
      header={<TabHeader title="Mindmaker" subtitle="Decisions, not admin" leading={<Logomark size={36} />} />}
    >
      <DailyLockBanner />
      <DailyBriefBanner />
      <MrrTicker variant="mobile" />
      <StreakPills variant="mobile" />
      {heroSignal && (
        <HeroCard
          eyebrow="What needs you"
          accent="amber"
          title={heroSignal.signal}
          detail={heroSignal.relevance}
          meta={heroSignal.recommended_action ? `Move: ${truncate(heroSignal.recommended_action, 90)}` : heroSignal.source}
          cta="Open"
          onClick={() => { h.select(); setOpenSignal(heroSignal) }}
        />
      )}

      <div className="flex gap-3 flex-shrink-0">
        <StatPill
          label="Content"
          value={ideas.length}
          color={ideas.length > 0 ? 'text-rose-300' : 'text-white/45'}
        />
        <StatPill
          label="Leads"
          value={leads.length}
          color={leads.length > 0 ? 'text-emerald-300' : 'text-white/45'}
        />
        <StatPill
          label="Waiting"
          value={waiting.length}
          color={waiting.length > 0 ? 'text-amber-300' : 'text-white/45'}
          sub="on you"
        />
      </div>

      {signals.length > 1 && (
        <FeedCard title={`Signals · ${signals.length}`}>
          {signals.slice(1, 5).map((sig, i) => (
            <FeedRow
              key={i}
              dotColor="bg-amber-400"
              title={sig.signal}
              detail={sig.relevance}
              onClick={() => { h.select(); setOpenSignal(sig) }}
            />
          ))}
        </FeedCard>
      )}

      {waiting.length > 0 && (
        <FeedCard
          title={`Needs you · ${waiting.length}`}
          action={
            <button
              onClick={() => { h.tap(); onNavigate?.('today') }}
              className="text-[13px] text-white/55 font-medium active:text-white"
            >
              Open Today →
            </button>
          }
        >
          {waiting.map(t => (
            <FeedRow
              key={t.id}
              dotColor="bg-amber-400"
              title={t.title}
              detail={t.next_step || (t.agent ? `From ${t.agent}` : undefined)}
              onClick={() => { h.select(); onNavigate?.('today', { task: t.id }) }}
            />
          ))}
        </FeedCard>
      )}

      {!heroSignal && waiting.length === 0 && (
        <EmptyState label="Quiet morning. No signals, no waiting decisions." />
      )}

      <DetailSheet
        open={openSignal != null}
        onClose={() => setOpenSignal(null)}
        eyebrow={openSignal?.source || 'Marcus signal'}
        title={openSignal?.signal || ''}
        body={
          openSignal
            ? [
                openSignal.relevance ? `Why it matters: ${openSignal.relevance}` : null,
                openSignal.recommended_action ? `Recommended move: ${openSignal.recommended_action}` : null,
              ].filter(Boolean).join('\n\n')
            : undefined
        }
        agent="marcus"
        actions={
          openSignal
            ? [
                {
                  label: 'Open Intelligence',
                  variant: 'primary',
                  onClick: () => { h.tap(); onNavigate?.('exec'); setOpenSignal(null) },
                },
              ]
            : []
        }
      />
    </MobileShellPrim>
  )
}

function safeParse(s: string): ExternalSignal[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function isNoise(t: TaskRow): boolean {
  if (!t.title) return false
  return /^\s*health alert:\s*0\s*down,\s*0\s*stale/i.test(t.title) ||
         /^\s*sync engine running every/i.test(t.title)
}
