import React from 'react'
import { useRevenueAttribution } from '../hooks/useRevenueAttribution'
import { formatMrr } from '../lib/mrrDisplay'
import { Skeleton } from './shared/Skeleton'

/**
 * Pillar 1 — ROI panel. Surfaces which channel / agent / source is
 * producing the most MRR. Rendered on Customers tab below the main
 * per-product roll-up. Drives "do more of X" decisions.
 */
export function CustomerSourcesPanel() {
  const { buckets, liveMrr, loading } = useRevenueAttribution()
  const top = buckets.slice(0, 8)

  if (loading) {
    return (
      <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
        <header className="px-4 py-3 border-b border-white/[0.05] space-y-2">
          <Skeleton h={10} w={112} r={4} />
          <Skeleton h={8} w={160} r={4} />
        </header>
        <ul className="divide-y divide-white/[0.04]">
          {[68, 44, 30].map((w, i) => (
            <li key={i} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <Skeleton h={10} w={`${w}%`} r={4} />
                <Skeleton h={10} w={48} r={4} className="flex-shrink-0" />
              </div>
              <div className="mt-2 h-1 bg-white/[0.05] rounded-full" />
            </li>
          ))}
        </ul>
      </section>
    )
  }

  if (buckets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] p-4">
        <p className="text-[11px] text-white/45">
          No paid customers yet. ROI breakdown will appear once Stripe webhooks land paid customers in `customers`.
        </p>
      </div>
    )
  }

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      <header className="px-4 py-3 border-b border-white/[0.05]">
        <h3 className="text-[12px] font-semibold text-white">Revenue by source</h3>
        <p className="text-[10px] text-white/45 mt-0.5">
          Where the {formatMrr(liveMrr)}/mo of committed MRR came from.
        </p>
      </header>
      <ul className="divide-y divide-white/[0.04]">
        {top.map(b => (
          <li key={b.key} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] font-semibold text-white truncate">{b.label}</p>
              <span className="text-[12px] tabular-nums text-emerald-300 flex-shrink-0">
                ${Math.round(b.mrr_usd).toLocaleString()}/mo
              </span>
            </div>
            <div className="mt-2 h-1 bg-white/[0.05] rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400/70 rounded-full"
                style={{ width: `${b.share_pct.toFixed(1)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[10px] text-white/40">
              <span>{b.paid_count} paid · ~${Math.round(b.ltv_estimate_usd).toLocaleString()} LTV</span>
              <span className="tabular-nums">{b.share_pct.toFixed(1)}%</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
