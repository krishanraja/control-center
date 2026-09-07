import React from 'react'
import { TrendingUp, TrendingDown, RefreshCw } from '@/lib/icons'
import { useRevenueAttribution } from '../hooks/useRevenueAttribution'
import { formatMrr } from '../lib/mrrDisplay'
import { formatCommittedMrr, syncAgeHours, SYNC_STALE_HOURS } from '../hooks/useRevenue'
import { useHomeIntelligence } from '../hooks/useHomeIntelligence'
import { useMoodSource } from './shared/AmbientField'
import { Skeleton } from './shared/Skeleton'
import { Sparkline } from './shared/Sparkline'
import { Working } from './shared/Working'
import { useToast } from './shared/Toast'

/** "just now", "5h ago", "3 days ago": plain words for how old the Stripe pull is. */
export function syncAgeLabel(hours: number | null): string {
  if (hours == null) return 'never synced'
  if (hours < 1) return 'synced just now'
  if (hours < 48) return `synced ${Math.round(hours)}h ago`
  return `synced ${Math.round(hours / 24)} days ago`
}

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
  const { liveMrr, mrrDelta7d, revenue, syncNow, syncing } = useRevenueAttribution()
  const { intel } = useHomeIntelligence()
  const { toast } = useToast()
  const sparkline = intel.momentum?.mrr ?? []
  const ageHours = syncAgeHours(revenue)
  const behind = ageHours == null || ageHours > SYNC_STALE_HOURS

  const runSync = async () => {
    const err = await syncNow()
    if (err) toast(`Stripe sync failed: ${err}`, 'error')
    else toast('Stripe synced. Revenue and subscribers are current.', 'success')
  }

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
            <Sparkline data={sparkline} positive={deltaPositive} ariaLabel="7-day MRR trend" />
          )}
        </div>
      </div>

      {/* Freshness, stated. Every number above comes from the daily Stripe
          pull; when that pull is behind, the tab says so in the same breath
          rather than presenting a stale figure as today's. Sync now is the
          on-demand backstop for the same route the cron hits. */}
      {revenue && (
        <div className={`mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3 flex-wrap text-micro ${behind ? 'text-amber-300' : 'text-white/40'}`}>
          <span>
            {behind && ageHours != null ? 'Stripe is behind: ' : 'Stripe '}
            {syncAgeLabel(ageHours)}
          </span>
          <button
            type="button"
            onClick={() => { void runSync() }}
            disabled={syncing}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-micro font-medium text-white/70 hover:bg-white/[0.08] disabled:opacity-50"
            title="Pull Stripe now"
          >
            {syncing ? <Working size={11} /> : <RefreshCw size={11} />}
            {syncing ? 'Syncing' : 'Sync now'}
          </button>
        </div>
      )}
      {/* The goal bar is gone with system_config.mrr_goal_usd (2026-08-20):
          a revenue target belongs on the goal ladder, judged by the gate,
          not in a display setting beside the number. */}
    </div>
  )
}
