import React from 'react'
import { TrendingUp, TrendingDown, Target } from 'lucide-react'
import { useRevenueAttribution } from '../hooks/useRevenueAttribution'
import { useHomeIntelligence } from '../hooks/useHomeIntelligence'
import { useMoodSource } from './shared/AmbientField'

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
  const { liveMrr, mrrDelta7d, projection, mrrGoal, gapToGoal, goalPct, loading } = useRevenueAttribution()
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
      aria-label="Live MRR ticker"
    >
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-emerald-300/70 mb-1.5">
            Live MRR
          </p>
          <p className={`${isMobile ? 'text-[46px]' : 'text-[36px]'} font-display font-bold tabular-nums leading-none`}>
            <span className="money-text">${Math.round(liveMrr).toLocaleString()}</span>
            <span className="text-white/35 text-[18px] font-medium">/mo</span>
          </p>
          <div className={`flex items-center gap-1.5 mt-2 ${deltaColor}`}>
            <DeltaIcon size={isMobile ? 14 : 12} />
            <span className={`${isMobile ? 'text-[14px]' : 'text-[12px]'} font-semibold tabular-nums`}>
              {deltaPositive ? '+' : ''}${Math.round(mrrDelta7d).toLocaleString()} this week
            </span>
          </div>
        </div>

        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1.5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35 mb-1">
              90d projected
            </p>
            <p className={`${isMobile ? 'text-[22px]' : 'text-[18px]'} font-semibold tabular-nums text-white/85`}>
              ${Math.round(projection).toLocaleString()}
            </p>
          </div>
          {sparkline.length > 0 && (
            <Sparkline data={sparkline} positive={deltaPositive} />
          )}
        </div>
      </div>

      {/* Goal bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
            <Target size={11} />
            Path to ${Math.round(mrrGoal).toLocaleString()}
          </div>
          <span className="text-[11px] tabular-nums text-white/55">
            Gap: ${Math.round(gapToGoal).toLocaleString()}
          </span>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-violet-300 rounded-full transition-all duration-700"
            style={{ width: `${goalPct}%` }}
          />
        </div>
        <p className="text-[10px] text-white/35 mt-1.5 tabular-nums">
          {goalPct.toFixed(1)}% of goal
          {loading ? ' · loading…' : ''}
        </p>
      </div>
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
