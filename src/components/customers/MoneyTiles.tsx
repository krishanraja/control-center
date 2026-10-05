/**
 * Subscriptions' money line: four figures and the Substack, as tiles on the
 * desk and as one compact band on a phone. Every figure is Stripe's own
 * (api/_revenue.ts), so it agrees with the revenue ticker on Home.
 */
import React from 'react'
import { Upload } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { Skeleton } from '../shared/Skeleton'
import { Button } from '../ui/button'
import { formatCommittedMrr } from '../../hooks/useRevenue'
import { formatMrr } from '../../lib/mrrDisplay'
import type { SubscriptionsModel } from './useSubscriptionsModel'

function Tile({ label, value, note, testId, children }: { label: string; value: React.ReactNode; note: React.ReactNode; testId: string; children?: React.ReactNode }) {
  return (
    <div className="surface flex min-w-0 flex-col gap-1 rounded-2xl px-4 py-3" data-testid={testId}>
      <Eyebrow>{label}</Eyebrow>
      <div className="font-mono text-heading font-semibold tabular-nums text-ink">{value}</div>
      <div className="text-label text-ink-faint">{note}</div>
      {children}
    </div>
  )
}

const cents = (c: number) => formatMrr(c / 100)

export function MoneyTiles({ s }: { s: SubscriptionsModel }) {
  const r = s.revenue
  // A skeleton is for a read in flight. Once the read is over with nothing in
  // it, three bars that never resolve look like a page still loading, and a
  // zero would look like a figure. Say it once, plainly; the move above says
  // what to do about it.
  const wait = s.loading ? <Skeleton h={28} w={96} r={6} /> : <span className="font-sans text-ui font-medium text-ink-faint">Not read</span>
  return (
    <>
      <Tile label="Collected · 30 days" testId="subscriptions-collected"
        value={r ? <span className="money-text">{cents(r.collected_30d_net_cents)}</span> : wait}
        note={r ? `${cents(r.collected_all_time_net_cents)} net all time` : ' '} />
      <Tile label="Committed MRR" testId="subscriptions-mrr"
        value={r ? formatCommittedMrr(r) : wait}
        note={r ? 'a month, live plans' : ' '} />
      <Tile label="Paying" testId="subscriptions-paying"
        value={r ? r.active_subscriptions : wait}
        note={r ? (r.substack?.active_subscriptions ? `${r.substack.active_subscriptions} through the Substack` : 'live subscriptions') : ' '} />
      <Tile label="Free sign-ups" testId="subscriptions-free"
        value={s.freeSignups.wired ? s.freeSignups.count : '-'}
        note={`${s.freeSignups.wired} of ${s.freeSignups.of} products counted`} />
    </>
  )
}

/** The Substack, accounted for on its own: paid from Stripe (automatic), free from the CSV (by hand). */
export function SubstackTile({ s, onImport, compact = false }: { s: SubscriptionsModel; onImport: () => void; compact?: boolean }) {
  const paid = s.revenue?.substack
  const free = s.substack
  const freeLine = free.lastImport
    ? `${free.lastImport.total} on the list at the last export (${new Date(`${free.lastImport.on}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })})`
    : free.inLeads
      ? `${free.inLeads} free readers in Leads`
      : 'Free readers: never imported'
  return (
    <div className={`surface flex min-w-0 flex-col gap-1 rounded-2xl ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`} data-testid="subscriptions-substack">
      <div className="flex items-center gap-2">
        <Eyebrow className="flex-1">Substack</Eyebrow>
        <Button variant="ghost" size="sm" className="tap-44 -my-1 -mr-2 min-h-0 px-2 py-0.5" onClick={onImport} data-testid="subscriptions-substack-import">
          <Upload size={12} aria-hidden /> Import
        </Button>
      </div>
      <div className="flex items-baseline gap-2">
        {paid ? (
          <>
            <span className={`font-mono font-semibold tabular-nums text-ink ${compact ? 'text-ui' : 'text-heading'}`}>{paid.active_subscriptions}</span>
            <span className="text-label text-ink-muted">paid{paid.committed_mrr_usd_cents || paid.committed_mrr_other.length ? `, ${formatCommittedMrr(paid)} a month` : ''}{compact ? ', from Stripe' : ''}</span>
          </>
        ) : (
          // Said in words: a dash beside "paid" read like a figure.
          <span className="text-ui font-medium text-ink-faint">{s.loading ? 'Reading Stripe' : 'Paid: not read from Stripe yet'}</span>
        )}
      </div>
      <div className="text-label text-ink-faint">{freeLine}</div>
    </div>
  )
}
