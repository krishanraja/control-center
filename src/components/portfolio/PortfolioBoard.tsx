/**
 * The portfolio board, the one view of "which products am I growing, in what
 * order, and what do the six numbers say". Growth and Subscriptions render
 * this same component over the same model (src/lib/portfolioBoard.ts), so the
 * two tabs cannot drift apart again.
 *
 * Priority is shown by scale and by the numeral, not by colour: mint means the
 * answer in this design system and amber means what moved, so neither is spent
 * on rank. Priority 1 rows are the tallest and carry the filled numeral.
 *
 * An unwired cell is drawn with a dashed edge and says "Not wired"; it never
 * prints a zero. Opening a row shows each number's source, or what is missing.
 */
import React from 'react'
import { ChevronRight } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { METRICS, TIER_LABEL, type MetricKey, type Tier } from '../../lib/portfolio'
import type { BoardCell, BoardRow } from '../../lib/portfolioBoard'

const TIERS: Tier[] = [1, 2, 3]

function opensLine(on: string | null, now = new Date()): string | null {
  if (!on) return null
  const d = new Date(`${on}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.getTime() < now.getTime() - 86_400_000) return null
  return `opens ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
}

export function TierBadge({ tier, size = 'md' }: { tier: Tier; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'size-5 text-micro' : 'size-6 text-label'
  const tone = tier === 1
    ? 'bg-[rgb(var(--action-bg))] text-[rgb(var(--action-fg))] font-semibold'
    : tier === 2
      ? 'border border-accent/70 text-accent'
      : 'border border-white/15 text-ink-muted'
  return (
    <span className={`inline-grid flex-shrink-0 place-items-center rounded-full font-mono tabular-nums ${box} ${tone}`} aria-label={TIER_LABEL[tier]} title={TIER_LABEL[tier]}>
      {tier}
    </span>
  )
}

function Cell({ c, dense }: { c: BoardCell; dense: boolean }) {
  if (c.state === 'unwired') {
    return (
      <div className="flex min-w-0 flex-col justify-center rounded-xl border border-dashed border-white/[0.12] px-2.5 py-1.5" title={c.fix ? `${c.source} ${c.fix}` : c.source} data-state="unwired">
        <span className="text-label text-ink-faint">Not wired</span>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col justify-center rounded-xl bg-white/[0.03] px-2.5 py-1.5" title={c.source} data-state={c.state}>
      <span className={`font-mono tabular-nums ${dense ? 'text-label' : 'text-ui'} ${c.state === 'live' ? 'font-semibold text-ink' : 'text-ink-muted'}`}>{c.value}</span>
      {!dense && c.note && <span className="text-micro text-ink-faint">{c.note}</span>}
    </div>
  )
}

/**
 * Desk: a table, one column per metric, grouped by priority. `emphasis` lifts
 * the columns the host tab is about (money on Subscriptions, finding on
 * Growth) without changing their order, so the two tabs still line up.
 */
export function PortfolioTable({ rows, onOpen, emphasis }: {
  rows: BoardRow[]
  onOpen: (venture: string) => void
  emphasis?: MetricKey[]
}) {
  const grid = 'grid grid-cols-[minmax(150px,1.15fr)_repeat(6,minmax(0,1fr))] gap-1.5'
  return (
    <div className="flex flex-col gap-1.5" data-testid="portfolio-board" role="table" aria-label="Products by priority">
      <div className={`${grid} px-3`} role="row">
        <span role="columnheader"><Eyebrow>Product</Eyebrow></span>
        {METRICS.map(m => (
          <span key={m.key} role="columnheader" title={m.about} className="px-2.5">
            <Eyebrow className={emphasis?.includes(m.key) ? 'text-ink' : ''}>{m.label}</Eyebrow>
          </span>
        ))}
      </div>
      {TIERS.map(tier => {
        const inTier = rows.filter(r => r.product.tier === tier)
        if (!inTier.length) return null
        const dense = tier === 3
        return (
          <div key={tier} className={`flex flex-col gap-1.5 rounded-2xl ${tier === 1 ? 'surface border-accent/25 p-1.5' : ''}`} data-testid={`portfolio-tier-${tier}`}>
            {inTier.map(r => {
              const opens = opensLine(r.product.opensOn)
              return (
                <button
                  key={r.product.venture}
                  type="button"
                  role="row"
                  onClick={() => onOpen(r.product.venture)}
                  className={`${grid} w-full items-stretch rounded-xl px-1.5 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${tier === 1 ? 'py-1.5' : tier === 2 ? 'surface py-1.5' : 'surface py-1'}`}
                  data-testid={`portfolio-row-${r.product.venture}`}
                >
                  <span role="rowheader" className="flex min-w-0 items-center gap-2.5 px-1.5">
                    <TierBadge tier={tier} size={dense ? 'sm' : 'md'} />
                    <span className="flex min-w-0 flex-col">
                      <span className={`font-display font-semibold text-ink ${tier === 1 ? 'text-lede' : 'text-ui'}`}>{r.product.label}</span>
                      <span className="text-micro text-ink-faint">{[r.product.domain, opens].filter(Boolean).join(' · ')}</span>
                    </span>
                  </span>
                  {METRICS.map(m => <Cell key={m.key} c={r.cells[m.key]} dense={dense} />)}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/** One product's six numbers with where each comes from. The detail both tabs open. */
export function PortfolioDetail({ row, children }: { row: BoardRow; children?: React.ReactNode }) {
  const opens = opensLine(row.product.opensOn)
  return (
    <div className="flex flex-col gap-4" data-testid={`portfolio-detail-${row.product.venture}`}>
      <div className="flex items-start gap-3">
        <TierBadge tier={row.product.tier} />
        <div className="min-w-0">
          <h2 className="font-display text-title font-semibold text-ink">{row.product.label}</h2>
          <p className="text-label text-ink-muted">{TIER_LABEL[row.product.tier]}{row.product.domain ? ` · ${row.product.domain}` : ''}{opens ? ` · ${opens}` : ''}</p>
          <p className="mt-1 text-body text-ink-muted">{row.product.what}</p>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {METRICS.map(m => {
          const c = row.cells[m.key]
          return (
            <li key={m.key} className={`flex flex-col gap-0.5 rounded-xl px-3 py-2 ${c.state === 'unwired' ? 'border border-dashed border-white/[0.12]' : 'bg-white/[0.03]'}`}>
              <div className="flex items-baseline justify-between gap-3">
                <Eyebrow>{m.label}</Eyebrow>
                <span className={`font-mono text-ui tabular-nums ${c.state === 'live' ? 'font-semibold text-ink' : c.state === 'zero' ? 'text-ink-muted' : 'text-ink-faint'}`}>{c.value}</span>
              </div>
              {c.state === 'unwired' ? (
                <>
                  <p className="text-label text-ink-muted">{c.source}</p>
                  {c.fix && <p className="text-label text-ink">{c.fix}</p>}
                </>
              ) : (
                <p className="text-label text-ink-faint">{[c.note, c.source].filter(Boolean).join('. ')}</p>
              )}
            </li>
          )
        })}
      </ul>
      {children}
    </div>
  )
}

/**
 * Phone: one row per product, priority first. Six marks show what is wired at
 * a glance (filled: a number, ring: wired but nothing yet, dashed: not wired),
 * with the one figure that matters most on the right. Tap opens the detail.
 */
export function PortfolioList({ rows, onOpen, headline }: {
  rows: BoardRow[]
  onOpen: (venture: string) => void
  /** Which metric gives the right-hand figure. */
  headline: MetricKey
}) {
  return (
    <ul className="flex flex-col gap-1.5" data-testid="portfolio-board" aria-label="Products by priority">
      {rows.map(r => {
        const c = r.cells[headline]
        const opens = opensLine(r.product.opensOn)
        const tier = r.product.tier
        return (
          <li key={r.product.venture}>
            <button
              type="button"
              onClick={() => onOpen(r.product.venture)}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 text-left active:bg-white/[0.06] ${tier === 1 ? 'surface border-accent/25 py-2.5' : 'surface py-2'}`}
              data-testid={`portfolio-row-${r.product.venture}`}
            >
              <TierBadge tier={tier} size={tier === 1 ? 'md' : 'sm'} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-baseline gap-2">
                  <span className={`font-display font-semibold text-ink ${tier === 1 ? 'text-lede' : 'text-ui'}`}>{r.product.label}</span>
                  {opens && <span className="text-micro text-ink-faint">{opens}</span>}
                </span>
                <span className="flex gap-1" aria-label={METRICS.map(m => `${m.label}: ${r.cells[m.key].state === 'unwired' ? 'not wired' : r.cells[m.key].value}`).join(', ')}>
                  {METRICS.map(m => {
                    const s = r.cells[m.key].state
                    return (
                      <span
                        key={m.key}
                        className={`h-1.5 w-5 rounded-full ${s === 'live' ? 'bg-accent' : s === 'zero' ? 'border border-accent/50' : 'border border-dashed border-white/25'}`}
                      />
                    )
                  })}
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className={`font-mono text-ui tabular-nums ${c.state === 'live' ? 'font-semibold text-ink' : 'text-ink-faint'}`}>{c.value}</span>
                <span className="text-micro text-ink-faint">{METRICS.find(m => m.key === headline)?.label}</span>
              </span>
              <ChevronRight size={14} className="flex-shrink-0 text-ink-faint" aria-hidden />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** The "wire next" list: the first gaps in priority order. */
export function WireNext({ gaps, limit = 3, onOpen }: {
  gaps: Array<{ product: { venture: string; label: string; tier: Tier }; label: string; gap: string; fix: string | null }>
  limit?: number
  onOpen?: (venture: string) => void
}) {
  if (!gaps.length) return null
  const shown = gaps.slice(0, limit)
  return (
    <div className="flex flex-col gap-2" data-testid="portfolio-wire-next">
      <div className="flex items-baseline gap-2">
        <Eyebrow className="flex-1">Wire next, in priority order</Eyebrow>
        {gaps.length > limit && <span className="text-label text-ink-faint">{gaps.length - limit} more after these</span>}
      </div>
      <ol className="flex flex-col gap-1.5">
        {shown.map((g, i) => (
          <li key={`${g.product.venture}-${g.label}-${i}`}>
            <button type="button" onClick={() => onOpen?.(g.product.venture)} className="flex w-full items-start gap-2.5 rounded-xl px-2 py-1 text-left hover:bg-white/[0.04]">
              <TierBadge tier={g.product.tier} size="sm" />
              <span className="text-body text-ink-muted">
                <span className="font-semibold text-ink">{g.product.label}, {g.label}.</span> {g.fix ?? g.gap}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
