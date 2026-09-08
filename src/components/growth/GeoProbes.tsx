import React, { useMemo, useState } from 'react'
import { ChevronDown } from '@/lib/icons'
import { Chip, EmptyNote, ProductChip, SectionHead } from './atoms'
import {
  ENGINE_LABEL, PRODUCTS, PRODUCT_LABEL, asList, citationRate, dayLabel, pct,
  type GeoProbeRow, type ProductSlug,
} from '../../lib/growth'
import type { GrowthData } from '../../hooks/useGrowth'
import { SkeletonList } from '../shared/Skeleton'

/**
 * D) DO AI ANSWERS MENTION YOU: the GEO probe results.
 *
 * One number matters: the share of probes where we_cited is true. It is
 * computed from the rows on every render, never stored, so it can never drift
 * from the evidence underneath it.
 *
 * Read first, rows second (2026-09-08). The first version led with every row:
 * a question, the hosts cited instead, two lines of the engine's answer, and a
 * right-hand column of chips, all in one flex row. On a phone the chips took
 * the width and the text spiralled down a column three words wide. Krish: "I
 * don't know what this is trying to say". So each product now opens on one
 * sentence that says it (how many answers mentioned you, who got cited
 * instead), and the questions sit folded under it. The answer text stays in
 * the database and on the title attribute; it is never the thing you read.
 *
 * Probe rows are written by the GEO probe workflow. Until it has run, this
 * says so plainly instead of showing a placeholder rate.
 */

const WINDOW_DAYS = 30

export function GeoProbes({ g, variant }: { g: GrowthData; variant: 'desktop' | 'mobile' }) {
  // The same 30-day window the Sunday review uses, so the two never disagree.
  const recent = useMemo(() => {
    const since = Date.now() - WINDOW_DAYS * 86_400_000
    const inWindow = g.probes.filter(p => Date.parse(p.run_at) >= since)
    return inWindow.length ? inWindow : g.probes
  }, [g.probes])
  const overall = useMemo(() => citationRate(recent), [recent])
  const groups = useMemo(
    () => PRODUCTS
      .map(p => ({ product: p, rows: recent.filter(r => r.product_slug === p) }))
      .filter(gr => gr.rows.length),
    [recent],
  )
  const unknownProduct = useMemo(
    () => recent.filter(r => !PRODUCTS.includes(r.product_slug as ProductSlug)),
    [recent],
  )

  if (g.loading) {
    return <div className="space-y-4"><SkeletonList rows={4} /></div>
  }

  const cited = recent.filter(p => p.we_cited).length
  const engines = Array.from(new Set(recent.map(p => p.engine)))
  const hosts = topHosts(recent, 3)

  // No bottom padding here: SignalsPanel owns the section's tail spacing so the
  // SEO rank panel sits directly under the GEO block rather than a gap away.
  return (
    <div className="space-y-4">
      <SectionHead
        title="Do AI answers mention you?"
        sub={variant === 'desktop' ? 'The questions your buyers ask, put to the AI answer engines. One score: how often you are in the answer.' : undefined}
      />

      {g.probes.length === 0 ? (
        <EmptyNote>
          Nobody has asked the engines yet, so there is no score to show. The probe workflow fills this one question
          at a time per engine. It stays empty here rather than showing a made-up number.
        </EmptyNote>
      ) : (
        <>
          {/* The read. One sentence that says it, then who is winning instead. */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 flex flex-col gap-2">
            <div className="flex items-end gap-3 flex-wrap">
              <p className="text-display font-semibold text-white tabular-nums leading-none">{pct(overall)}</p>
              <p className="text-label text-white/45 pb-1">of answers mention you</p>
            </div>
            <p className="text-body text-white/85 leading-snug">
              {readLine(cited, recent.length, engines.length, dayLabel(recent[0]?.run_at))}
            </p>
            {hosts.length > 0 && (
              <p className="text-label text-white/50 leading-snug">
                Cited instead of you, most often: {hosts.map(h => `${h.host} (${h.times})`).join(', ')}.
              </p>
            )}
            {cited === 0 && (
              <p className="text-label text-white/50 leading-snug">
                What to do about it is the Weekly review&rsquo;s job. It reads these same rows every Sunday.
              </p>
            )}
          </div>

          {groups.map(gr => (
            <ProductRead key={gr.product} product={gr.product} rows={gr.rows} variant={variant} />
          ))}

          {unknownProduct.length > 0 && (
            <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
              <header className="px-3 py-2 border-b border-white/[0.06] text-micro text-white/40">
                Questions on a product the map does not know ({unknownProduct.length})
              </header>
              <div>{unknownProduct.map(p => <ProbeRow key={p.id} probe={p} variant={variant} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function readLine(cited: number, total: number, engines: number, lastRun: string): string {
  const q = `${total} question${total === 1 ? '' : 's'}`
  const e = `${engines} engine${engines === 1 ? '' : 's'}`
  const when = lastRun ? ` Last asked ${lastRun}.` : ''
  if (cited === 0) return `Asked ${q} across ${e} in the last ${WINDOW_DAYS} days. Not one answer mentioned you.${when}`
  if (cited === total) return `Asked ${q} across ${e} in the last ${WINDOW_DAYS} days. Every answer mentioned you.${when}`
  return `Asked ${q} across ${e} in the last ${WINDOW_DAYS} days. ${cited} answer${cited === 1 ? '' : 's'} mentioned you.${when}`
}

/** Who gets cited instead, by host, most often first. */
function topHosts(rows: GeoProbeRow[], n: number): Array<{ host: string; times: number }> {
  const tally = new Map<string, number>()
  for (const p of rows) {
    for (const h of new Set(asList(p.competitors_cited).map(hostLabel))) tally.set(h, (tally.get(h) || 0) + 1)
  }
  return Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([host, times]) => ({ host, times }))
}

/**
 * One product: its sentence, then its questions folded. The desk opens the
 * list because it has the room; the phone opens on the sentence.
 */
function ProductRead({ product, rows, variant }: { product: ProductSlug; rows: GeoProbeRow[]; variant: 'desktop' | 'mobile' }) {
  const [open, setOpen] = useState(variant === 'desktop')
  const cited = rows.filter(r => r.we_cited).length
  const rate = citationRate(rows)
  const hosts = topHosts(rows, 2)
  const sentence = cited === 0
    ? `None of the ${rows.length} answers mentioned ${PRODUCT_LABEL[product]}.`
    : `${cited} of the ${rows.length} answers mentioned ${PRODUCT_LABEL[product]}.`
  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <div className="px-3 py-2.5 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <ProductChip slug={product} />
          <span className="flex-1" />
          <span className={`text-label font-semibold tabular-nums ${rate && rate > 0 ? 'text-emerald-300' : 'text-white/40'}`}>
            {pct(rate)}
          </span>
        </div>
        <p className="text-body text-white/85 leading-snug">{sentence}</p>
        {hosts.length > 0 && (
          <p className="text-label text-white/45 leading-snug">Cited instead: {hosts.map(h => h.host).join(', ')}.</p>
        )}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 text-label text-white/45 hover:text-white/70 self-start min-h-[36px]"
        >
          <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          {open ? 'Hide the questions' : `Show the ${rows.length} question${rows.length === 1 ? '' : 's'}`}
        </button>
      </div>
      {open && <div className="border-t border-white/[0.06]">{rows.map(p => <ProbeRow key={p.id} probe={p} variant={variant} />)}</div>}
    </section>
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

/**
 * One question. Stacked, never a row with a right-hand column: the question
 * gets the full width, the engine and the verdict sit under it as chips.
 */
function ProbeRow({ probe, variant }: { probe: GeoProbeRow; variant: 'desktop' | 'mobile' }) {
  const competitors = asList(probe.competitors_cited)
  const hosts = Array.from(new Set(competitors.map(hostLabel)))
  return (
    <div className="px-3 py-2.5 border-t border-white/[0.05] first:border-t-0 flex flex-col gap-1 min-w-0">
      <p className="text-label text-white/85 leading-snug break-words">{probe.question}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Chip>{ENGINE_LABEL[probe.engine] || probe.engine}</Chip>
        {probe.we_cited
          ? <Chip tone="text-emerald-300 border-emerald-500/30">mentioned you</Chip>
          : <Chip tone="text-white/35 border-white/[0.08]">did not mention you</Chip>}
        <span className="text-micro text-white/25 tabular-nums">{dayLabel(probe.run_at)}</span>
      </div>
      {hosts.length > 0 && (
        <p className="text-micro text-white/40 leading-snug break-words" title={competitors.join('\n')}>
          Cited instead: {hosts.slice(0, variant === 'mobile' ? 3 : 8).join(', ')}{hosts.length > (variant === 'mobile' ? 3 : 8) ? ` and ${hosts.length - (variant === 'mobile' ? 3 : 8)} more` : ''}
        </p>
      )}
      {variant === 'desktop' && probe.answer_snapshot && (
        <p className="text-micro text-white/30 leading-snug line-clamp-2 break-words" title={probe.answer_snapshot}>{probe.answer_snapshot}</p>
      )}
    </div>
  )
}
