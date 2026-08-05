import React, { useMemo } from 'react'
import { Chip, EmptyNote, ProductChip, SectionHead } from './atoms'
import {
  ENGINE_LABEL, PRODUCTS, asList, citationRate, dayLabel, pct,
  type GeoProbeRow, type ProductSlug,
} from '../../lib/growth'
import type { GrowthData } from '../../hooks/useGrowth'

/**
 * D) GEO PROBE RESULTS: did the answer engines cite us.
 *
 * One number matters: the citation rate, the share of probes where we_cited is
 * true. It is computed from the rows on every render, never stored, so it can
 * never drift from the evidence underneath it.
 *
 * Probe rows are written by the GEO probe workflow. Until it has run, this says
 * so plainly instead of showing a placeholder rate.
 */

export function GeoProbes({ g }: { g: GrowthData }) {
  const overall = useMemo(() => citationRate(g.probes), [g.probes])
  const groups = useMemo(
    () => PRODUCTS
      .map(p => ({ product: p, rows: g.probes.filter(r => r.product_slug === p) }))
      .filter(gr => gr.rows.length),
    [g.probes],
  )
  const unknownProduct = useMemo(
    () => g.probes.filter(r => !PRODUCTS.includes(r.product_slug as ProductSlug)),
    [g.probes],
  )

  if (g.loading) return <div className="text-white/40 text-sm py-10 text-center">Loading probes...</div>

  // No bottom padding here: SignalsPanel owns the section's tail spacing so the
  // SEO rank panel sits directly under the GEO block rather than a gap away.
  return (
    <div className="space-y-4">
      <SectionHead
        title="GEO probes"
        sub="What ChatGPT, Perplexity, Claude, Google AIO and Grok actually say when the ICP asks. Citation rate is the only score."
      />

      {g.probes.length === 0 ? (
        <EmptyNote>
          No GEO probes have been run yet, so there is no citation rate to show. This surface reads growth_geo_probes,
          which the probe workflow fills one question at a time per engine. An empty table stays empty here rather than
          showing a fabricated score.
        </EmptyNote>
      ) : (
        <>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 flex items-end gap-4 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-semibold">Citation rate</p>
              <p className="text-[34px] font-semibold text-white tabular-nums leading-none mt-1">{pct(overall)}</p>
            </div>
            <p className="text-[11.5px] text-white/45 pb-1">
              {g.probes.filter(p => p.we_cited).length} of {g.probes.length} probes cited us.
              Last run {dayLabel(g.probes[0]?.run_at) || 'unknown'}.
            </p>
          </div>

          {groups.map(gr => {
            const rate = citationRate(gr.rows)
            return (
              <section key={gr.product} className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
                <header className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
                  <ProductChip slug={gr.product} />
                  <span className="text-[11px] text-white/40 tabular-nums">{gr.rows.length} probes</span>
                  <span className="flex-1" />
                  <span className={`text-[12px] font-semibold tabular-nums ${rate && rate > 0 ? 'text-emerald-300' : 'text-white/40'}`}>
                    {pct(rate)} cited
                  </span>
                </header>
                <div>{gr.rows.map(p => <ProbeRow key={p.id} probe={p} />)}</div>
              </section>
            )
          })}

          {unknownProduct.length > 0 && (
            <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
              <header className="px-3 py-2 border-b border-white/[0.06] text-[11px] text-white/40">
                Probes on a product slug outside the map ({unknownProduct.length})
              </header>
              <div>{unknownProduct.map(p => <ProbeRow key={p.id} probe={p} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Probes come back with full citation URLs, which are unreadable in a row. The
 * host is the part that answers "who got cited instead of us", so that is what
 * shows; the full URL stays on the title attribute and in the database.
 */
function hostLabel(s: string): string {
  try {
    return new URL(s).hostname.replace(/^www\./, '')
  } catch {
    return s
  }
}

function ProbeRow({ probe }: { probe: GeoProbeRow }) {
  const competitors = asList(probe.competitors_cited)
  const hosts = Array.from(new Set(competitors.map(hostLabel)))
  return (
    <div className="px-3 py-2 border-t border-white/[0.05] flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] text-white/85 leading-snug">{probe.question}</p>
        {hosts.length > 0 && (
          <p className="text-[11px] text-white/40 leading-snug mt-0.5 break-words" title={competitors.join('\n')}>
            Cited instead: {hosts.join(', ')}
          </p>
        )}
        {probe.answer_snapshot && (
          <p className="text-[10.5px] text-white/30 leading-snug mt-0.5 line-clamp-2">{probe.answer_snapshot}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Chip>{ENGINE_LABEL[probe.engine] || probe.engine}</Chip>
        {probe.we_cited
          ? <Chip tone="text-emerald-300 border-emerald-500/30">cited</Chip>
          : <Chip tone="text-white/35 border-white/[0.08]">not cited</Chip>}
        <span className="text-[10px] text-white/25 tabular-nums w-12 text-right">{dayLabel(probe.run_at)}</span>
      </div>
    </div>
  )
}
