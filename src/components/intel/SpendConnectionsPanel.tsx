import React, { useState } from 'react'
import { ChevronRight, CircleDollarSign, ExternalLink } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { Skeleton } from '../shared/Skeleton'
import { Sparkline } from '../shared/Sparkline'
import { StatusPill } from '../shared/StatusPill'
import { LastUpdated } from '../shared/LastUpdated'
import { RefreshRail } from '../shared/RefreshRail'
import { Badge } from '../ui/badge'
import { useFirstLoad } from '../shared/useDeferredPending'
import { useSpend, type SpendSummary } from '../../hooks/useSpend'
import { useHaptics } from '../../hooks/useHaptics'
import { SpendDetailSheet } from './SpendDetailSheet'

const usd = (n: number): string =>
  `$${Math.round(n).toLocaleString('en-US')}`

const daysUntil = (iso: string): number => Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 86_400_000))

/**
 * The live money-out and connections read, on both Intel shells.
 *
 * One card answers the two questions that used to need six dashboards: what
 * is the OS costing this month (receipts truth, USD headline), and which API
 * is broken or about to run dry. Anything that needs a hand is named right
 * here with its fix link; the full ranked list lives one tap away in the
 * detail sheet. Fed by GET /api/spend (receipts ingest + connections sweep).
 */
export function SpendConnectionsPanel() {
  const h = useHaptics()
  const { spend, loading, refresh } = useSpend()
  const [open, setOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const firstPaint = useFirstLoad(loading, Boolean(spend))

  if (firstPaint) {
    return (
      <section className="relative shrink-0 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
        <div className="flex flex-col gap-3">
          <Skeleton h={14} w="40%" />
          <Skeleton h={28} w="60%" />
          <Skeleton h={18} w="80%" />
        </div>
      </section>
    )
  }
  if (!spend) return null

  const checkNow = async () => {
    if (checking) return
    h.select()
    setChecking(true)
    try {
      await fetch('/api/health/connections-sweep', { method: 'POST' })
      await refresh()
    } catch { /* the rail stops; the panel keeps its last good read */ }
    setChecking(false)
  }

  const needsHand = attention(spend)

  return (
    // shrink-0: MobileShell's content area is a flex column that compresses
    // shrinkable children when the tab overflows — without it this card
    // collapses to a sliver on the phone (every sibling card carries it too).
    <section data-testid="spend-panel" className="relative shrink-0 rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
      <RefreshRail active={checking} />
      <div className="flex flex-col gap-3.5 p-4">
        <header className="flex items-center gap-2">
          <CircleDollarSign size={14} className="text-emerald-200/80" aria-hidden />
          <Eyebrow>Spend &amp; connections</Eyebrow>
          <span className="ml-auto"><LastUpdated date={spend.as_of ? new Date(spend.as_of) : null} refreshing={checking} /></span>
        </header>

        {spend.empty ? (
          <p className="text-body leading-relaxed text-white/45">
            No receipts read and no connections checked yet. The first sweep and
            the Gmail backfill fill this in.
          </p>
        ) : (
          <>
            {/* The month, in one line: total out, what a normal month costs,
                and the six-month shape of it. */}
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span data-testid="spend-month-total" className="font-mono tabular-nums text-title font-semibold text-white">
                    {usd(spend.month_usd)}
                  </span>
                  <span className="whitespace-nowrap text-label text-white/45">out this month</span>
                  {spend.ballooning ? (
                    <Badge variant="danger" className="whitespace-nowrap" data-testid="spend-balloon">Ballooning</Badge>
                  ) : spend.delta_pct != null && spend.delta_pct >= 20 ? (
                    <Badge variant="warning" className="whitespace-nowrap">up {spend.delta_pct}%</Badge>
                  ) : null}
                </div>
                {spend.avg_3mo_usd > 0 && (
                  <p className="mt-0.5 text-label text-white/40">
                    A normal month is about <span className="font-mono tabular-nums">{usd(spend.avg_3mo_usd)}</span>
                    {spend.meter ? (
                      <> · on the meter so far: <span className="font-mono tabular-nums">${spend.meter.usd_mtd.toFixed(0)}</span></>
                    ) : null}
                  </p>
                )}
              </div>
              <Sparkline
                data={spend.months.map(m => m.total_usd)}
                positive={spend.delta_pct != null ? spend.delta_pct <= 0 : true}
                ariaLabel="6-month spend trend"
              />
            </div>

            {/* Connections: counts always, names only when a hand is needed. */}
            <div className="flex flex-wrap items-center gap-1.5" data-testid="spend-connections-strip">
              <StatusPill status="active" label={`${spend.connections.ok} ok`} />
              {spend.connections.low > 0 && <StatusPill status="needs_you" label={`${spend.connections.low} low`} />}
              {spend.connections.broken > 0 && <StatusPill status="blocked" label={`${spend.connections.broken} broken`} />}
              {spend.connections.unchecked > 0 && (
                <span className="text-micro text-white/30">{spend.connections.unchecked} unchecked</span>
              )}
            </div>

            {needsHand.length > 0 && (
              <ul className="flex flex-col gap-1" data-testid="spend-attention-list">
                {needsHand.map(item => (
                  <li key={item.key} className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2">
                    <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.tone === 'broken' ? 'bg-status-blocked' : 'bg-status-needsYou'}`} />
                    <span className="min-w-0 flex-1 truncate text-body text-white/80">{item.line}</span>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="inline-flex shrink-0 items-center gap-1 text-label font-medium text-emerald-200 hover:text-emerald-100"
                      >
                        {item.cta} <ExternalLink size={12} aria-hidden />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {spend.needs_review > 0 && (
              <p className="text-label text-white/40" data-testid="spend-review-line">
                {spend.needs_review} receipt{spend.needs_review === 1 ? '' : 's'} could not be read. They are flagged in the list, not counted as zero.
              </p>
            )}
          </>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="spend-panel-open"
            onClick={() => { h.select(); setOpen(true) }}
            className="group flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
          >
            <span className="min-w-0 flex-1 truncate text-ui font-medium text-white/85">Every service, ranked by cost</span>
            <ChevronRight size={14} className="shrink-0 text-white/30 transition-colors group-hover:text-white/60" aria-hidden />
          </button>
          <button
            type="button"
            data-testid="spend-check-now"
            onClick={checkNow}
            disabled={checking}
            className="shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-label font-medium text-white/70 transition-colors hover:bg-white/[0.05] disabled:opacity-50"
          >
            {checking ? 'Checking…' : 'Check now'}
          </button>
        </div>
      </div>

      <SpendDetailSheet open={open} onClose={() => setOpen(false)} spend={spend} />
    </section>
  )
}

interface AttentionItem { key: string; tone: 'broken' | 'low'; line: string; url: string | null; cta: string }

/** The rows worth a named line on the card: broken first, then low, then a
 *  renewal inside 30 days. Everything else stays behind the sheet. */
function attention(s: SpendSummary): AttentionItem[] {
  const items: AttentionItem[] = []
  for (const svc of s.services) {
    if (svc.status && ['auth_failed', 'exhausted', 'rate_limited'].includes(svc.status)) {
      const why = svc.status === 'exhausted' ? 'out of credits' : svc.status === 'auth_failed' ? 'key rejected' : 'rate limited'
      items.push({
        key: `broken-${svc.key}`,
        tone: 'broken',
        line: `${svc.name} is ${why}`,
        url: svc.top_up_url || svc.dashboard_url,
        cta: svc.status === 'exhausted' ? 'Top up' : 'Open',
      })
    } else if (svc.balance_low) {
      items.push({
        key: `low-${svc.key}`,
        tone: 'low',
        line: `${svc.name} is low: ${svc.balance} ${svc.balance_unit || ''} left`,
        url: svc.top_up_url || svc.dashboard_url,
        cta: 'Top up',
      })
    }
  }
  for (const r of s.renewals_due) {
    items.push({
      key: `renewal-${r.key}`,
      tone: 'low',
      line: `${r.name} renews in ${daysUntil(r.on)} days${r.amount ? ` (${r.currency || ''} ${r.amount})` : ''}`,
      url: null,
      cta: '',
    })
  }
  return items.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'broken' ? -1 : 1)).slice(0, 6)
}
