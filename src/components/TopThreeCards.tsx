import React from 'react'
import { TrendingUp, Sparkles, AlertTriangle, ArrowRight } from 'lucide-react'
import type { TopThreeCard } from '../hooks/useHomeIntelligence'
import { navigateDecision } from '../lib/routeDecision'
import { useHaptics } from '../hooks/useHaptics'

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
 */
export function TopThreeCards({ cards, onNavigate, variant = 'desktop', generatedAt }: Props) {
  const h = useHaptics()
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
      <header className="flex items-baseline justify-between mb-2 px-0.5">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
          Three things that move the needle
        </h2>
        {generatedAt && (
          <span className="text-[10px] text-white/30 tabular-nums">
            {humanAgo(generatedAt)}
          </span>
        )}
      </header>
      <div className={`grid gap-2.5 ${variant === 'mobile' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'}`}>
        {ordered.map(card => (
          <Card key={card.kind} card={card} onActivate={() => handle(card)} />
        ))}
      </div>
    </section>
  )
}

function Card({ card, onActivate }: { card: TopThreeCard; onActivate: () => void }) {
  const meta = KIND_META[card.kind]
  const Icon = meta.Icon
  return (
    <button
      type="button"
      onClick={onActivate}
      className={`group text-left rounded-2xl border ${meta.border} ${meta.bg} p-4 transition-colors min-h-[44px] flex flex-col`}
    >
      <header className="flex items-center gap-1.5 mb-2">
        <Icon size={12} className={meta.accent} />
        <span className={`text-[10px] font-bold uppercase tracking-[0.16em] ${meta.accent}`}>
          {meta.label}
        </span>
        <span className={`ml-auto w-1.5 h-1.5 rounded-full ${meta.dot} opacity-70`} />
      </header>
      <p className="text-[14px] font-semibold text-white leading-snug mb-1.5 break-words">
        {card.title}
      </p>
      {card.why_now && (
        <p className="text-[12px] text-white/60 leading-snug mb-3 line-clamp-2 break-words">
          {card.why_now}
        </p>
      )}
      <span
        className={`mt-auto inline-flex items-center gap-1 text-[12px] font-semibold ${meta.accent} group-hover:gap-1.5 transition-all`}
      >
        {card.action_label}
        <ArrowRight size={11} />
      </span>
    </button>
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
