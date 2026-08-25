import React from 'react'
import { SlideOver } from '../shared/SlideOver'
import { Eyebrow } from '../shared/Eyebrow'
import { formatCommittedMrr, type RevenueSummary } from '../../hooks/useRevenue'

const usd = (cents: number): string => {
  const n = cents / 100
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 })}`
}

/**
 * The money-in drill behind the KPI band's tile: committed MRR with its full
 * per-currency breakdown, then what has actually been collected. The two
 * figures answer different questions and are never added together — most of
 * the money collected to date came from a single one-off payment that no MRR
 * figure can represent.
 */
export function RevenueSheet({ open, onClose, revenue }: {
  open: boolean
  onClose: () => void
  revenue: RevenueSummary | null
}) {
  return (
    <SlideOver open={open} onClose={onClose} ariaLabel="Revenue detail" label="Money in">
      <div className="flex flex-col gap-5" data-testid="revenue-detail">
        {!revenue || revenue.empty ? (
          <p className="text-body leading-relaxed text-white/45">
            No revenue read yet. This fills in from Stripe once /api/revenue has
            data to report.
          </p>
        ) : (
          <>
            <div>
              <span className="font-mono tabular-nums text-heading font-semibold text-white">
                {formatCommittedMrr(revenue)}
              </span>
              <span className="ml-2 text-label text-white/45">committed / month</span>
              <p className="mt-0.5 text-label text-white/40">
                {revenue.active_subscriptions} active subscription{revenue.active_subscriptions === 1 ? '' : 's'}.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <div className="px-1 pb-1"><Eyebrow>Collected</Eyebrow></div>
              <Row label="Last 30 days, net" value={usd(revenue.collected_30d_net_cents)} />
              <Row label="Last 90 days, net" value={usd(revenue.collected_90d_net_cents)} />
              <Row label="All time, net" value={usd(revenue.collected_all_time_net_cents)} />
              <Row label="All time, gross" value={usd(revenue.collected_all_time_gross_cents)} muted />
            </div>

            {revenue.one_time_share_pct != null && (
              <p className="text-label leading-relaxed text-white/40">
                {Math.round(revenue.one_time_share_pct)}% of everything collected
                came from one-off payments, which is why committed MRR and
                collected cash are shown apart and never added together.
              </p>
            )}
          </>
        )}
      </div>
    </SlideOver>
  )
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
      <span className={`min-w-0 flex-1 truncate text-ui ${muted ? 'text-white/50' : 'text-white/80'}`}>{label}</span>
      <span className={`shrink-0 font-mono tabular-nums text-ui ${muted ? 'text-white/45' : 'text-white/85'}`}>{value}</span>
    </div>
  )
}
