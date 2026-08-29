import { useMemo, useState } from 'react'
import { DollarSign, TrendingUp, AlertTriangle, CheckCircle2, Mail } from '@/lib/icons'
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
import { SubscriptionsWatchHero } from '../customers/SubscriptionsWatchHero'
import { SubscribersList } from '../customers/SubscribersList'
import { useFocusMode, isFocusModeEnabled } from '../../hooks/useFocusMode'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { FocusLanes, FocusModeToggle } from '../focus/FocusLanes'
import { BoardSkeleton, Skeleton } from '../shared/Skeleton'

export function DesktopCustomers() {
  const { buckets, totals, customers, loading, error } = useCustomers()
  const [selected, setSelected] = useState<CustomerProduct | null>(null)
  const { mode, setMode } = useFocusMode()
  const { today: focusToday } = useDailyFocus()
  const calibrated = focusToday?.status === 'calibrated' || focusToday?.status === 'complete'
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

  // Full Focus Mode (Phase 3): when enabled and the day is calibrated, the
  // expansion-plays list regroups into the 3 daily-target lanes via
  // relevance_index (table 'customers'). One uniform row renderer feeds both
  // the lanes and the muted set.
  const showFocus = isFocusModeEnabled() && !!calibrated && mode === 'focus'
  const renderExpansionRow = (c: typeof expansionPlays[number]) => (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label font-medium text-white truncate">{c.full_name || c.email || 'unnamed'}</span>
        {c.mrr_usd != null && (
          <span className="text-micro tabular-nums text-emerald-300 flex-shrink-0">${c.mrr_usd}/mo</span>
        )}
      </div>
      {c.email && <p className="text-micro text-white/45 truncate">{c.email}</p>}
    </div>
  )

  const scrollToExpansion = () => {
    const el = document.getElementById('expansion-plays')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const left = (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl xl:text-heading font-semibold text-white tracking-tight">
          Subscriptions
        </h1>
        {loading ? (
          <Skeleton h={12} w={256} r={4} className="mt-1.5 mb-[3px]" />
        ) : (
          <p className="text-xs md:text-body text-white/50 mt-0.5">
            {`${totals.paid} paid · $${Math.round(totals.mrrUsd).toLocaleString()}/mo · ${totals.freeSignups} free · ${totals.waitlist} waitlist`}
          </p>
        )}
      </div>

      {expansionPlays.length > 0 && (
        <section id="expansion-plays" className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3">
          <header className="flex items-baseline gap-2 mb-2">
            <Mail size={12} className="text-emerald-300" />
            <h2 className="text-micro font-semibold uppercase tracking-[0.14em] text-emerald-300">Expansion plays</h2>
            {isFocusModeEnabled() && calibrated && (
              <span className="ml-auto"><FocusModeToggle mode={mode} onChange={setMode} /></span>
            )}
            <span className={`text-micro text-white/45 tabular-nums ${isFocusModeEnabled() && calibrated ? '' : 'ml-auto'}`}>{expansionPlays.length}</span>
          </header>
          <p className="text-micro text-white/45 mb-2">
            Paid accounts Maya flagged for outreach. Open each to draft an email.
          </p>
          {showFocus ? (
            <FocusLanes
              rows={expansionPlays}
              table="customers"
              keyOf={c => String(c.id)}
              renderItem={renderExpansionRow}
              fallback={null}
              mutedLabel="Off focus"
            />
          ) : (
            <ul className="space-y-1.5">
              {expansionPlays.slice(0, 5).map(c => (
                <li key={c.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-label font-medium text-white truncate">{c.full_name || c.email || 'unnamed'}</span>
                    {c.mrr_usd != null && (
                      <span className="text-micro tabular-nums text-emerald-300 flex-shrink-0">${c.mrr_usd}/mo</span>
                    )}
                  </div>
                  {c.email && <p className="text-micro text-white/45 truncate">{c.email}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="text-micro text-white/30">
        Ambient surface: revenue truth to read, nothing to action here. Expansion plays worth a decision land on Home.
      </p>
      <MrrTicker variant="desktop" />
      <SubscribersList />
      <CustomerCouncilCard />
      <ExpansionRadar />
      <CustomerSourcesPanel />

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-label text-red-200">
          {error}
        </div>
      )}

      {activeProducts.length === 0 && !loading && !error && (
        <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] px-4 py-6 text-center">
          <p className="text-label text-white/45">
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
                  <p className="text-body font-semibold text-white">
                    {PRODUCT_LABEL[b.product]}
                  </p>
                  {b.churned > 0 && (
                    <span className="ml-auto text-micro text-red-300 tabular-nums">
                      {b.churned} churn
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2 text-micro">
                  <div>
                    <p className="text-micro uppercase tracking-[0.14em] text-white/35">Paid</p>
                    <p className="text-emerald-300 tabular-nums font-semibold">{b.paid}</p>
                  </div>
                  <div>
                    <p className="text-micro uppercase tracking-[0.14em] text-white/35">MRR</p>
                    <p className="text-emerald-300 tabular-nums font-semibold">
                      ${Math.round(b.mrrUsd).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-micro uppercase tracking-[0.14em] text-white/35">Free / wait</p>
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
        <h1 className="text-xl md:text-2xl xl:text-heading font-semibold text-white tracking-tight">
          {PRODUCT_LABEL[current.product]}
        </h1>
        <p className="text-label text-white/50">
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
        <p className="text-micro uppercase tracking-[0.14em] text-white/35 mb-2">Recent</p>
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
    <div className="h-full flex items-center justify-center text-body text-white/30">
      Select a product
    </div>
  )

  if (loading && customers.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <BoardSkeleton lanes={3} cardsPerLane={3} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <SubscriptionsWatchHero
        expansionPlays={expansionPlays}
        totals={{ mrrUsd: totals.mrrUsd, paid: totals.paid }}
        onOpen={() => scrollToExpansion()}
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
      <p className="text-micro font-bold uppercase tracking-widest text-white/35 mb-1">
        <Icon size={9} className="inline mr-1" />
        {label}
      </p>
      <p className="text-title font-bold tabular-nums">{value}</p>
    </div>
  )
}
