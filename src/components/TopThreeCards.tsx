import React, { useEffect, useMemo, useState } from 'react'
import { TrendingUp, Sparkles, AlertTriangle, ArrowRight, Replace, Check, X, Target } from 'lucide-react'
import type { TopThreeCard } from '../hooks/useHomeIntelligence'
import { navigateDecision } from '../lib/routeDecision'
import { useHaptics } from '../hooks/useHaptics'
import { useToast } from './shared/Toast'
import { supabase } from '../lib/supabase'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

interface Props {
  cards: TopThreeCard[]
  onNavigate?: NavigateFn
  variant?: 'desktop' | 'mobile'
  generatedAt?: string | null
}

const KIND_META: Record<TopThreeCard['kind'], {
  label: string
  Icon: typeof TrendingUp
  border: string
  bg: string
  accent: string
  dot: string
}> = {
  revenue: {
    label: 'Revenue',
    Icon: TrendingUp,
    border: 'border-emerald-500/25 hover:border-emerald-500/50',
    bg: 'bg-gradient-to-br from-emerald-500/[0.08] to-emerald-500/[0.01]',
    accent: 'text-emerald-200',
    dot: 'bg-emerald-400',
  },
  growth: {
    label: 'Growth',
    Icon: Sparkles,
    border: 'border-violet-500/25 hover:border-violet-500/50',
    bg: 'bg-gradient-to-br from-violet-500/[0.08] to-violet-500/[0.01]',
    accent: 'text-violet-200',
    dot: 'bg-violet-400',
  },
  risk: {
    label: 'Risk',
    Icon: AlertTriangle,
    border: 'border-amber-500/25 hover:border-amber-500/50',
    bg: 'bg-gradient-to-br from-amber-500/[0.08] to-amber-500/[0.01]',
    accent: 'text-amber-200',
    dot: 'bg-amber-400',
  },
}

const KIND_ORDER: TopThreeCard['kind'][] = ['revenue', 'growth', 'risk']

/**
 * Three hero cards driven by Marcus's `home_intelligence.top_three`. Each
 * card has one purpose: tell Krish what to do next on this dimension and
 * route him there with one click. We sort to a stable revenue → growth →
 * risk order so the layout never reflows when Marcus reranks; if a kind
 * is missing we still render the slot empty rather than collapsing the
 * grid (predictable mental model).
 *
 * Each card also carries a swap affordance. When Marcus's pick is off,
 * Krish hits the swap icon, optionally types what he would have picked
 * instead, and submits. That writes a feedback_queue row with
 * reason_code='marcus_priority_override'. Marcus's daily synthesis loads
 * the last 14 days of those overrides and adjusts today's picks.
 */
// Phase 4: enrich task cards with their parent portfolio objective so each
// tactical pick can show "ladders up to: X". Marcus's daily synthesis will
// eventually write parent_objective into top_three directly (per his brief);
// until then we look it up client-side via tasks.milestone_id ->
// milestones.goal_id -> goals.title.
function useTaskParentObjectives(cards: TopThreeCard[]): Record<string, string> {
  const taskIds = useMemo(
    () => cards.filter(c => c.action_kind === 'task' && c.action_target_id).map(c => c.action_target_id as string),
    [cards],
  )
  const key = taskIds.slice().sort().join('|')
  const [parents, setParents] = useState<Record<string, string>>({})

  useEffect(() => {
    if (taskIds.length === 0) { setParents({}); return }
    let cancelled = false
    void (async () => {
      try {
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, milestone_id')
          .in('id', taskIds)
        const milestoneIds = (tasks || []).map(t => t.milestone_id).filter(Boolean) as string[]
        if (milestoneIds.length === 0) { if (!cancelled) setParents({}); return }
        const { data: milestones } = await supabase
          .from('milestones')
          .select('id, goal_id')
          .in('id', milestoneIds)
        const goalIds = Array.from(new Set((milestones || []).map(m => m.goal_id).filter(Boolean) as string[]))
        if (goalIds.length === 0) { if (!cancelled) setParents({}); return }
        const { data: goals } = await supabase
          .from('goals')
          .select('id, title')
          .in('id', goalIds)
        const goalTitle = new Map<string, string>((goals || []).map(g => [g.id as string, g.title as string]))
        const milestoneGoal = new Map<string, string>((milestones || []).map(m => [m.id as string, m.goal_id as string]))
        const taskMilestone = new Map<string, string>((tasks || []).map(t => [t.id as string, t.milestone_id as string]))
        const next: Record<string, string> = {}
        for (const tid of taskIds) {
          const mid = taskMilestone.get(tid)
          if (!mid) continue
          const gid = milestoneGoal.get(mid)
          if (!gid) continue
          const title = goalTitle.get(gid)
          if (title) next[tid] = title
        }
        if (!cancelled) setParents(next)
      } catch {
        if (!cancelled) setParents({})
      }
    })()
    return () => { cancelled = true }
  }, [key, taskIds])

  return parents
}

export function TopThreeCards({ cards, onNavigate, variant = 'desktop', generatedAt }: Props) {
  const h = useHaptics()
  // Hook calls must precede any early return per react-hooks/rules-of-hooks.
  // The hook handles empty/non-task cards internally.
  const parentObjectives = useTaskParentObjectives(cards || [])
  if (!cards || cards.length === 0) return null

  const byKind = new Map<TopThreeCard['kind'], TopThreeCard>()
  for (const c of cards) if (!byKind.has(c.kind)) byKind.set(c.kind, c)
  const ordered = KIND_ORDER.map(k => byKind.get(k)).filter((c): c is TopThreeCard => !!c)
  if (ordered.length === 0) return null

  const handle = (c: TopThreeCard) => {
    h.select()
    navigateDecision(onNavigate, c.action_kind, c.action_target_id)
  }

  return (
    <section aria-label="Today's three priorities">
      <header className="flex items-baseline justify-between mb-2 px-5">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
          Marcus's leverage picks
        </h2>
        {generatedAt && (
          <span className="text-[10px] text-white/30 tabular-nums">
            {humanAgo(generatedAt)}
          </span>
        )}
      </header>
      <div className={`grid gap-2.5 ${variant === 'mobile' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'}`}>
        {ordered.map((card, i) => (
          <Card
            key={card.kind}
            card={card}
            slotIndex={i}
            parentObjective={card.action_kind === 'task' && card.action_target_id ? parentObjectives[card.action_target_id] : undefined}
            onActivate={() => handle(card)}
          />
        ))}
      </div>
    </section>
  )
}

type SwapPhase = 'idle' | 'open' | 'submitting' | 'captured'

function Card({
  card,
  slotIndex,
  parentObjective,
  onActivate,
}: {
  card: TopThreeCard
  slotIndex: number
  parentObjective?: string
  onActivate: () => void
}) {
  const meta = KIND_META[card.kind]
  const Icon = meta.Icon
  const h = useHaptics()
  const { toast } = useToast()
  const [phase, setPhase] = useState<SwapPhase>('idle')
  const [replacement, setReplacement] = useState('')

  const submitOverride = async () => {
    if (phase === 'submitting') return
    setPhase('submitting')
    h.tap()
    try {
      const trimmed = replacement.trim()
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_table: 'home_intelligence',
          source_id: String(slotIndex),
          agent_id: 'marcus',
          vote: -1,
          reason_code: 'marcus_priority_override',
          reason_text: trimmed || null,
          meta: {
            original_pick_title: card.title,
            original_pick_meta: card,
            replaced_with_text: trimmed || null,
            captured_at: new Date().toISOString(),
          },
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const payload = await r.json().catch(() => ({}))
      if (!payload.ok) throw new Error(payload.error || 'unknown error')
      h.success()
      setPhase('captured')
    } catch (e) {
      h.error()
      toast(`Could not capture override: ${(e as Error).message}`, 'error')
      setPhase('open')
    }
  }

  // Once captured, the card morphs into a calm confirmation. The fade and
  // height transitions are CSS so we don't pull in a motion library just
  // for this surface.
  if (phase === 'captured') {
    return (
      <div
        className={`rounded-2xl border ${meta.border} ${meta.bg} p-4 transition-all duration-500 opacity-80`}
        role="status"
        aria-live="polite"
      >
        <header className="flex items-center gap-1.5 mb-2">
          <Icon size={12} className={`${meta.accent} opacity-50`} />
          <span className={`text-[10px] font-bold uppercase tracking-[0.16em] ${meta.accent} opacity-50`}>
            {meta.label}
          </span>
        </header>
        <p className="text-[14px] font-semibold text-white/40 leading-snug mb-1.5 break-words line-through">
          {card.title}
        </p>
        <p className="text-[12px] text-white/55 leading-snug">
          Override captured. Marcus will learn.
        </p>
      </div>
    )
  }

  return (
    <div
      className={`group relative rounded-2xl border ${meta.border} ${meta.bg} transition-colors`}
    >
      <button
        type="button"
        onClick={onActivate}
        className="w-full text-left p-4 min-h-[44px] flex flex-col"
      >
        <header className="flex items-center gap-1.5 mb-2">
          <Icon size={12} className={meta.accent} />
          <span className={`text-[10px] font-bold uppercase tracking-[0.16em] ${meta.accent}`}>
            {meta.label}
          </span>
          {typeof card.leverage_score === 'number' && (
            <span className={`ml-auto text-[10px] tabular-nums ${
              card.leverage_score === 0
                ? 'text-amber-300'
                : card.leverage_score >= 80
                  ? 'text-emerald-300'
                  : card.leverage_score >= 60
                    ? 'text-white/55'
                    : 'text-white/35'
            }`}>
              {card.leverage_score === 0 ? 'fallback' : `lev ${card.leverage_score}`}
            </span>
          )}
          {typeof card.leverage_score !== 'number' && (
            <span className={`ml-auto w-1.5 h-1.5 rounded-full ${meta.dot} opacity-70`} aria-hidden="true" />
          )}
        </header>
        <p className="text-[14px] font-semibold text-white leading-snug mb-1.5 break-words">
          {card.title}
        </p>
        {card.why_now && (
          <p className="text-[12px] text-white/60 leading-snug mb-1.5 line-clamp-2 break-words">
            {card.why_now}
          </p>
        )}
        {card.reasoning && (
          <p className="text-[11px] text-white/45 italic leading-snug mb-3 line-clamp-2 break-words">
            {card.reasoning}
          </p>
        )}
        {parentObjective && (
          <p className="text-[10px] text-white/45 leading-snug mb-2 inline-flex items-start gap-1 break-words">
            <Target size={9} className="mt-[2px] flex-shrink-0 opacity-60" />
            <span>
              Ladders up to: <span className="text-white/65">{parentObjective}</span>
            </span>
          </p>
        )}
        <span
          className={`mt-auto inline-flex items-center gap-1 text-[12px] font-semibold ${meta.accent} group-hover:gap-1.5 transition-all`}
        >
          {card.action_label}
          <ArrowRight size={11} />
        </span>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          h.tap()
          setPhase(phase === 'open' ? 'idle' : 'open')
        }}
        aria-label="Swap this pick"
        title="Swap this pick"
        className="absolute top-2 right-2 p-1.5 rounded-md text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
      >
        <Replace size={12} />
      </button>

      {phase === 'open' || phase === 'submitting' ? (
        <div
          className="border-t border-white/[0.06] px-4 py-3 bg-black/20 rounded-b-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <label className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-1.5">
            What would you have picked instead? (optional)
          </label>
          <textarea
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            disabled={phase === 'submitting'}
            rows={2}
            placeholder="Leave blank to just flag this pick as off"
            className="w-full text-[12px] bg-black/30 border border-white/[0.08] rounded-md px-2 py-1.5 text-white/85 placeholder:text-white/25 focus:border-white/25 focus:outline-none resize-none disabled:opacity-60"
          />
          <div className="mt-2 flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                h.tap()
                setPhase('idle')
                setReplacement('')
              }}
              disabled={phase === 'submitting'}
              className="inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white/80 px-2 py-1 rounded disabled:opacity-60"
            >
              <X size={11} />
              Cancel
            </button>
            <button
              type="button"
              onClick={submitOverride}
              disabled={phase === 'submitting'}
              className={`inline-flex items-center gap-1 text-[11px] font-semibold ${meta.accent} hover:text-white px-2.5 py-1 rounded bg-white/[0.04] hover:bg-white/10 disabled:opacity-60`}
            >
              <Check size={11} />
              {phase === 'submitting' ? 'Submitting...' : 'Submit override'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function humanAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const hr = Math.floor(m / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}
