import React, { useState } from 'react'
import { StatPill } from '../mobile/primitives'
import { useSpend } from '../../hooks/useSpend'
import { useRevenue } from '../../hooks/useRevenue'
import { useBets } from '../../hooks/useBets'
import { useFleetFunnel } from '../../hooks/useFleetFunnel'
import { SpendDetailSheet } from './SpendDetailSheet'
import { RevenueSheet } from './RevenueSheet'
import { FunnelSheet } from './FunnelSheet'
import { BetsSheet } from './BetsSheet'

const usd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`

const usdCents = (cents: number): string => {
  const n = cents / 100
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 })}`
}

type SheetId = 'spend' | 'revenue' | 'funnel' | 'bets' | null

/**
 * The console spine: five deterministic numbers, every one a door into its
 * detail sheet. System-of-record reads only — Stripe, receipts, the sweep,
 * the warehouse, the bets table. Marcus's own scoreboard (his authored
 * numbers with targets) deliberately does NOT live here; it renders inside
 * his card, where an analyst's numbers belong.
 */
export function KpiBand({ narrow }: { narrow: boolean }) {
  const { spend, loading: spendLoading } = useSpend()
  const { revenue, loading: revenueLoading } = useRevenue()
  const { live, overdueLive, hitRates, loading: betsLoading } = useBets()
  const { funnel, loading: funnelLoading } = useFleetFunnel()
  const [sheet, setSheet] = useState<SheetId>(null)

  // ── Money out ──────────────────────────────────────────────────────────
  const spendEmpty = !spend || spend.empty
  const moneyOut = (
    <StatPill
      label="Money out"
      value={spendEmpty ? '—' : usd(spend.month_usd)}
      valueTestId={spendEmpty ? undefined : 'spend-month-total'}
      testId="bi-kpi-money-out"
      tone={!spendEmpty && spend.ballooning ? 'bad' : 'default'}
      sub={
        spendEmpty ? 'no receipts yet'
        : spend.ballooning ? 'ballooning'
        : spend.delta_pct != null && spend.delta_pct >= 20 ? `up ${spend.delta_pct}% on usual`
        : spend.avg_3mo_usd > 0 ? `usual ${usd(spend.avg_3mo_usd)}`
        : 'this month'
      }
      loading={spendLoading && !spend}
      compact={narrow}
      onClick={spend ? () => setSheet('spend') : undefined}
    />
  )

  // ── Money in ───────────────────────────────────────────────────────────
  const revEmpty = !revenue || revenue.empty
  const moneyIn = (
    <StatPill
      label="Money in"
      value={revEmpty ? '—' : usdCents(revenue.committed_mrr_usd_cents)}
      testId="bi-kpi-money-in"
      tone={!revEmpty && revenue.committed_mrr_usd_cents > 0 ? 'good' : 'default'}
      sub={revEmpty ? 'no Stripe read yet' : 'committed / mo'}
      loading={revenueLoading && !revenue}
      compact={narrow}
      onClick={revenue ? () => setSheet('revenue') : undefined}
    />
  )

  // ── Connections ────────────────────────────────────────────────────────
  const conns = spend?.connections
  const checked = conns ? conns.ok + conns.low + conns.broken : 0
  const connections = (
    <StatPill
      label="APIs"
      value={!conns || checked === 0 ? '—' : `${conns.ok}/${checked}`}
      testId="bi-kpi-connections"
      tone={
        !conns || checked === 0 ? 'default'
        : conns.broken > 0 ? 'bad'
        : conns.low > 0 ? 'warn'
        : 'good'
      }
      sub={
        !conns || checked === 0 ? 'no sweep yet'
        : conns.broken > 0 ? `${conns.broken} broken`
        : conns.low > 0 ? `${conns.low} running low`
        : 'all healthy'
      }
      loading={spendLoading && !spend}
      compact={narrow}
      onClick={spend ? () => setSheet('spend') : undefined}
    />
  )

  // ── Funnel · 7d ────────────────────────────────────────────────────────
  const landed7 = (funnel?.byApp || []).reduce((s, a) => s + a.landed_7d, 0)
  const bought7 = (funnel?.byApp || []).reduce((s, a) => s + a.purchased_7d, 0)
  const funnelTile = (
    <StatPill
      label="Funnel 7d"
      value={!funnel ? '—' : landed7.toLocaleString('en-US')}
      testId="bi-kpi-funnel"
      tone={bought7 > 0 ? 'good' : 'default'}
      sub={!funnel ? 'no read yet' : `${bought7} bought`}
      loading={funnelLoading && !funnel}
      compact={narrow}
      onClick={funnel ? () => setSheet('funnel') : undefined}
    />
  )

  // ── Bets ───────────────────────────────────────────────────────────────
  const overall = hitRates.find(r => r.kind === 'all')
  const bets = (
    <StatPill
      label="Bets"
      value={live.length}
      testId="bi-kpi-bets"
      tone={overdueLive.length > 0 ? 'warn' : 'default'}
      sub={
        overdueLive.length > 0 ? (narrow ? `${overdueLive.length} overdue` : `${overdueLive.length} overdue — decide`)
        : overall && overall.total > 0 ? `${overall.pct.toFixed(0)}% hit · 90d`
        : live.length > 0 ? 'live'
        : 'none live'
      }
      loading={betsLoading}
      compact={narrow}
      onClick={() => setSheet('bets')}
    />
  )

  return (
    <section data-testid="bi-kpi-band" aria-label="The numbers" className="shrink-0">
      {narrow ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">{moneyOut}{moneyIn}</div>
          <div className="flex gap-3">{connections}{funnelTile}{bets}</div>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-3">
          {moneyOut}{moneyIn}{connections}{funnelTile}{bets}
        </div>
      )}

      {spend && (
        <SpendDetailSheet open={sheet === 'spend'} onClose={() => setSheet(null)} spend={spend} />
      )}
      <RevenueSheet open={sheet === 'revenue'} onClose={() => setSheet(null)} revenue={revenue} />
      <FunnelSheet open={sheet === 'funnel'} onClose={() => setSheet(null)} funnel={funnel} />
      <BetsSheet open={sheet === 'bets'} onClose={() => setSheet(null)} />
    </section>
  )
}
