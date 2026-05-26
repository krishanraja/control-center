import { useMemo, useState } from 'react'
import { DollarSign, TrendingUp, AlertTriangle, CheckCircle2, Mail } from 'lucide-react'
import { SplitPane } from '../SplitPane'
import { CustomerCard } from '../CustomerCard'
import {
  useCustomers, PRODUCT_LABEL, PRODUCT_ACCENT,
  type CustomerProduct,
} from '../../hooks/useCustomers'
import { MrrTicker } from '../MrrTicker'
import { CustomerCouncilCard } from '../CustomerCouncilCard'
import { ExpansionRadar } from '../ExpansionRadar'
import { CustomerSourcesPanel } from '../CustomerSourcesPanel'
import { NextActionStrip } from '../shared/NextActionStrip'

export function DesktopCustomers() {
  const { buckets, totals, customers, loading, error } = useCustomers()
  const [selected, setSelected] = useState<CustomerProduct | null>(null)
  const activeProducts = buckets.filter(b => b.total > 0)
  const current = (selected && buckets.find(b => b.product === selected)) || activeProducts[0] || null

  // Expansion plays = paid customers whose Maya sweeper flagged them for
  // outreach (`needs_outreach_at <= now`) AND we haven't emailed them recently.
  // Ranked by MRR so the highest-leverage account is first.
  const expansionPlays = useMemo(() => {
    const now = Date.now()
    return customers
      .filter(c => c.kind === 'paid' && c.needs_outreach_at && new Date(c.needs_outreach_at).getTime() <= now)
      .filter(c => {
        if (!c.last_emailed_at) return true
        const ageDays = (now - new Date(c.last_emailed_at).getTime()) / (24 * 60 * 60 * 1000)
        return ageDays >= 7
      })
      .sort((a, b) => (b.mrr_usd || 0) - (a.mrr_usd || 0))
  }, [customers])
  const topExpansion = expansionPlays[0] || null

  const scrollToExpansion = () => {
    const el = document.getElementById('expansion-plays')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const left = (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white tracking-tight">
          Subscriptions
        </h1>
        <p className="text-xs md:text-[13px] text-white/50 mt-0.5">
          {loading
            ? 'Loading…'
            : `${totals.paid} paid · $${Math.round(totals.mrrUsd).toLocaleString()}/mo · ${totals.freeSignups} free · ${totals.waitlist} waitlist`}
        </p>
      </div>

      {expansionPlays.length > 0 && (
        <section id="expansion-plays" className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3">
          <header className="flex items-baseline gap-2 mb-2">
            <Mail size={12} className="text-emerald-300" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Expansion plays</h2>
            <span className="text-[10px] text-white/45 tabular-nums ml-auto">{expansionPlays.length}</span>
          </header>
          <p className="text-[10px] text-white/45 mb-2">
            Paid accounts Maya flagged for outreach. Open each to draft an email.
          </p>
          <ul className="space-y-1.5">
            {expansionPlays.slice(0, 5).map(c => (
              <li key={c.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-white truncate">{c.full_name || c.email || 'unnamed'}</span>
                  {c.mrr_usd != null && (
                    <span className="text-[10px] tabular-nums text-emerald-300 flex-shrink-0">${c.mrr_usd}/mo</span>
                  )}
                </div>
                {c.email && <p className="text-[10px] text-white/45 truncate">{c.email}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <MrrTicker variant="desktop" />
      <CustomerCouncilCard />
      <ExpansionRadar />
      <CustomerSourcesPanel />

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-[12px] text-red-200">
          {error}
        </div>
      )}

      {activeProducts.length === 0 && !loading && !error && (
        <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] px-4 py-6 text-center">
          <p className="text-[12px] text-white/45">
            No customers yet. Apply the customers migration + activate the Maya sweeper.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {activeProducts
          .sort((a, b) => b.mrrUsd - a.mrrUsd || b.paid - a.paid)
          .map(b => {
            const isSelected = current?.product === b.product
            return (
              <button
                key={b.product}
                type="button"
                onClick={() => setSelected(b.product)}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${
                  isSelected
                    ? 'border-white/[0.18] bg-white/[0.05]'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${PRODUCT_ACCENT[b.product]}`} />
                  <p className="text-[13px] font-semibold text-white">
                    {PRODUCT_LABEL[b.product]}
                  </p>
                  {b.churned > 0 && (
                    <span className="ml-auto text-[10px] text-red-300 tabular-nums">
                      {b.churned} churn
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2 text-[11px]">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.12em] text-white/35">Paid</p>
                    <p className="text-emerald-300 tabular-nums font-semibold">{b.paid}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.12em] text-white/35">MRR</p>
                    <p className="text-emerald-300 tabular-nums font-semibold">
                      ${Math.round(b.mrrUsd).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.12em] text-white/35">Free / wait</p>
                    <p className="text-white/70 tabular-nums">
                      {b.freeSignups}/{b.waitlist}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
      </div>
    </div>
  )

  const right = current ? (
    <div className="h-full overflow-y-auto p-5 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white tracking-tight">
          {PRODUCT_LABEL[current.product]}
        </h1>
        <p className="text-[12px] text-white/50">
          {current.total} customers · ${Math.round(current.mrrUsd).toLocaleString()}/mo
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KpiTile label="Paid"     value={current.paid}     icon={CheckCircle2} tone="emerald" />
        <KpiTile label="MRR / mo" value={`$${Math.round(current.mrrUsd).toLocaleString()}`} icon={DollarSign} tone="emerald" />
        <KpiTile label="Signups"  value={current.freeSignups} icon={TrendingUp} tone="violet" />
        <KpiTile label="Churn"    value={current.churned}  icon={AlertTriangle} tone={current.churned > 0 ? 'red' : 'mute'} />
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.14em] text-white/35 mb-2">Recent</p>
        <div className="space-y-2">
          {customers
            .filter(c => c.product === current.product)
            .slice(0, 20)
            .map(c => (
              <CustomerCard key={c.id} customer={c} />
            ))}
        </div>
      </div>
    </div>
  ) : (
    <div className="h-full flex items-center justify-center text-[13px] text-white/30">
      Select a product
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <NextActionStrip
        headline={expansionPlays.length}
        headlineLabel="plays"
        insight={topExpansion
          ? `${topExpansion.full_name || topExpansion.email || 'unnamed'}${topExpansion.mrr_usd ? ` ($${topExpansion.mrr_usd}/mo)` : ''} flagged for outreach`
          : `$${Math.round(totals.mrrUsd).toLocaleString()}/mo MRR · no expansion plays waiting`}
        ctaLabel={topExpansion ? 'Open plays' : 'View accounts'}
        onCta={scrollToExpansion}
        icon={TrendingUp}
        accent={expansionPlays.length > 0 ? 'text-emerald-300' : 'text-violet-300'}
        disabled={expansionPlays.length === 0}
      />
      <SplitPane left={left} right={right} hasSelection={current != null} onBack={() => setSelected(null)} />
    </div>
  )
}

function KpiTile({
  label, value, icon: Icon, tone,
}: {
  label: string
  value: number | string
  icon: any
  tone: 'emerald' | 'violet' | 'red' | 'mute'
}) {
  const toneClass =
    tone === 'emerald' ? 'border-emerald-500/25 text-emerald-300' :
    tone === 'violet'  ? 'border-violet-500/25 text-violet-300' :
    tone === 'red'     ? 'border-red-500/25 text-red-300' :
                         'border-white/[0.08] text-white/45'
  return (
    <div className={`rounded-xl border ${toneClass} bg-white/[0.02] p-3`}>
      <p className="text-[9px] font-bold uppercase tracking-widest text-white/35 mb-1">
        <Icon size={9} className="inline mr-1" />
        {label}
      </p>
      <p className="text-[18px] font-bold tabular-nums">{value}</p>
    </div>
  )
}
