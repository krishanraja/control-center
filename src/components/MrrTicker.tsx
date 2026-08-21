import React from 'react'
import { TrendingUp, TrendingDown, Target } from '@/lib/icons'
import { useRevenueAttribution } from '../hooks/useRevenueAttribution'
import { formatMrr } from '../lib/mrrDisplay'
import { formatCommittedMrr } from '../hooks/useRevenue'
import { useHomeIntelligence } from '../hooks/useHomeIntelligence'
import { useMoodSource } from './shared/AmbientField'
import { Skeleton } from './shared/Skeleton'

interface Props {
  variant?: 'mobile' | 'desktop'
  className?: string
}

/**
 * Pillar 1 hero: the dashboard's only number that matters.
 * Live MRR · 7d delta · 90d projection · gap to $100k goal · 7d sparkline.
 *
 * Mounted at the top of Home (both mobile + desktop) and on the Customers
 * tab. Everything else on screen is auxiliary to this number. Sparkline is
 * driven by `home_intelligence.momentum.mrr` (Marcus, daily brief).
 */
export function MrrTicker({ variant = 'mobile', className = '' }: Props) {
  const { liveMrr, mrrDelta7d, loading, revenue } = useRevenueAttribution()
  const { intel } = useHomeIntelligence()
  const sparkline = intel.momentum?.mrr ?? []

  const isMobile = variant === 'mobile'
  const deltaPositive = mrrDelta7d >= 0
  const DeltaIcon = deltaPositive ? TrendingUp : TrendingDown
  const deltaColor = deltaPositive ? 'text-emerald-300' : 'text-red-300'

  // When the money is growing, the whole app's ambient field warms. Cleared on
  // unmount (leaving Home / Customers), so it never lingers falsely.
  useMoodSource('mrr', deltaPositive && liveMrr > 0 ? 'warm' : null, 3)

  return (
    <div
      className={`rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.06] via-emerald-500/[0.02] to-transparent shadow-e2 p-5 ${className}`}
      aria-label="Revenue"
    >
      <div className="flex items-end justify-between gap-3 flex-wrap">
        {/* Cash collected leads, because most of the money to date arrived as
            one-off payments that no MRR figure can represent. Committed MRR
            sits beside it. The two are never added together. */}
        <div className="min-w-0">
          <p className="text-micro font-display font-bold uppercase tracking-[0.14em] text-emerald-300/70 mb-1.5">
            Collected · 30 days
          </p>
          <p className={`${isMobile ? 'text-display' : 'text-display'} font-display font-bold tabular-nums leading-none`}>
            <span className="money-text">
              {formatMrr((revenue?.collected_30d_net_cents ?? 0) / 100)}
            </span>
            <span className="text-white/35 text-title font-medium"> net</span>
          </p>
          <p className="text-micro text-white/40 mt-2 tabular-nums">
            {revenue
              ? `$${(revenue.collected_all_time_net_cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} all time`
              : <Skeleton h={14} w={72} r={4} className="inline-block align-middle" />}
            {revenue?.one_time_share_pct != null && revenue.one_time_share_pct > 0 && (
              <span className="text-white/30"> · {revenue.one_time_share_pct}% one-off</span>
            )}
          </p>
        </div>

        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1.5">
          <div>
            <p className="text-micro font-bold uppercase tracking-[0.14em] text-white/35 mb-1">
              Committed MRR
            </p>
            <p className={`${isMobile ? 'text-title' : 'text-title'} font-semibold tabular-nums text-white/85`}>
              {formatCommittedMrr(revenue)}
              <span className="text-white/30 text-body font-medium">/mo</span>
            </p>
            <p className="text-micro text-white/30 mt-0.5 tabular-nums">
              {revenue ? `${revenue.active_subscriptions} live subscription${revenue.active_subscriptions === 1 ? '' : 's'}` : ''}
            </p>
          </div>
          <div className={`flex items-center gap-1.5 ${deltaColor}`}>
            <DeltaIcon size={isMobile ? 14 : 12} />
            <span className={`${isMobile ? 'text-body' : 'text-micro'} font-semibold tabular-nums`}>
              {deltaPositive ? '+' : ''}${Math.round(mrrDelta7d).toLocaleString()}/wk
            </span>
          </div>
          {sparkline.length > 0 && (
            <Sparkline data={sparkline} positive={deltaPositive} />
          )}
        </div>
      </div>

      {/* The goal bar is gone with system_config.mrr_goal_usd (2026-08-20):
          a revenue target belongs on the goal ladder, judged by the gate,
          not in a display setting beside the number. */}
    </div>
  )
}

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = Math.max(1, max - min)
  const w = 84
  const h = 22
  const step = w / (data.length - 1)
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(' ')
  const stroke = positive ? '#34d399' : '#f87171'
  const fill = positive ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)'
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="7-day MRR trend">
      <polyline
        points={`0,${h} ${points} ${w},${h}`}
        fill={fill}
        stroke="none"
      />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
