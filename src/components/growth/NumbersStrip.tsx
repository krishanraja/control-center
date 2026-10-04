/**
 * Growth: the headline strip. Four instruments answering "is anyone finding
 * my products?" in the time it takes to glance: a visual, a number, a short
 * label, and which way it moved. Each one is a button into its evidence.
 *
 *   AI answers   growth_geo_probes, last 30 days (productSignals)
 *   Site visits  the measured sites' totals (useWebInsights)
 *   On Google    GET /api/growth/seo-rank (useSeoRank)
 *   Clips        growth_creative_queue, this loop week
 */
import React from 'react'
import { ArrowDown, ArrowUp, ChevronRight, Minus } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { relativeTime } from '../../lib/ageHelpers'
import { BATCH_MAX, BATCH_MIN } from '../../lib/growth'
import { Columns, DotGrid, ShareBar, type Tone } from './viz'
import { aiSummary, fmtSearches, googleSummary, visitsSummary, type Trend } from './numbers'
import { ProductTag } from './bits'
import type { GrowthTabModel } from './useGrowthTab'

export type NumberAnchor = 'ai' | 'visits' | 'google' | 'clips'

type StripLayout = 'phone' | 'tablet' | 'desk'

function Delta({ tone, dir, children, bare = false }: { tone: Tone; dir: Trend; children: React.ReactNode; bare?: boolean }) {
  const color = tone === 'mint' ? 'text-accent' : tone === 'amber' ? 'text-accent-3' : 'text-ink-muted'
  const Icon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus
  return (
    <span className={`inline-flex items-start gap-1 text-micro font-semibold ${color}`}>
      {!bare && <Icon size={12} className="mt-[1px] flex-shrink-0" aria-hidden />}
      <span>{children}</span>
    </span>
  )
}

const trendTone = (t: Trend): Tone => (t === 'up' ? 'mint' : t === 'down' ? 'amber' : 'neutral')

function Tile({ layout, label, value, unit, visual, delta, onOpen, openLabel, testId }: {
  layout: StripLayout
  label: string
  value: string
  unit?: string
  visual: React.ReactNode
  delta: React.ReactNode
  onOpen: () => void
  openLabel: string
  testId: string
}) {
  // Touch shells: the instrument on top, then the number, then what it is,
  // then which way it moved. Read top to bottom in a glance.
  if (layout !== 'desk') {
    const tab = layout === 'tablet'
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={openLabel}
        data-testid={testId}
        className={`surface group flex min-w-0 flex-1 flex-col items-start rounded-2xl text-left transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${tab ? 'gap-1.5 p-3.5' : 'gap-1 px-2 pb-2.5 pt-2.5'}`}
      >
        <div className={`mb-1 flex w-full items-end ${tab ? 'h-[30px]' : 'h-[24px]'}`}>{visual}</div>
        <p className="flex flex-wrap items-baseline gap-1 leading-none">
          {value && <span className={`font-display font-semibold tabular-nums text-ink ${tab ? 'text-heading' : 'text-title'}`}>{value}</span>}
          {unit && <span className={`${tab ? 'text-label' : 'text-micro'} text-ink-muted`}>{unit}</span>}
        </p>
        <p className={`${tab ? 'text-label' : 'text-micro'} text-ink-muted`}>{label}</p>
        {delta}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={openLabel}
      data-testid={testId}
      className="surface group flex min-w-0 flex-1 flex-col gap-2.5 rounded-2xl p-4 text-left transition-colors hover:border-violet-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
    >
      <div className="flex items-center gap-2">
        <Eyebrow className="flex-1">{label}</Eyebrow>
        <ChevronRight size={14} className="text-ink-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="flex flex-wrap items-baseline gap-1.5 leading-none">
          {value && <span className="font-display text-heading font-semibold tabular-nums text-ink">{value}</span>}
          {unit && <span className="text-label text-ink-muted">{unit}</span>}
        </p>
        <div className="flex h-[30px] items-end">{visual}</div>
      </div>
      {delta}
    </button>
  )
}

/** Five slots: filled for each clip picked, solid up to the aim of 3, dashed to the most of 5. */
export function ClipSlots({ have, h = 22, w = 9 }: { have: number; h?: number; w?: number }) {
  return (
    <span role="img" aria-label={`${have} of ${BATCH_MIN} clips, up to ${BATCH_MAX}`} className="inline-flex items-end gap-1">
      {Array.from({ length: BATCH_MAX }).map((_, i) => (
        <span
          key={i}
          style={{ height: h, width: w }}
          className={`rounded-[3px] ${i < have ? 'bg-accent' : i < BATCH_MIN ? 'border border-white/25' : 'border border-dashed border-white/15'}`}
        />
      ))}
    </span>
  )
}

export function NumbersStrip({ m, layout, onOpen }: { m: GrowthTabModel; layout: StripLayout; onOpen: (a: NumberAnchor) => void }) {
  const { products, totals } = m.signals
  const ai = aiSummary(products, totals)
  const visits = visitsSummary(m.web.data, totals)
  const google = googleSummary(m.seo.rows)
  const have = totals.clips.made
  const phone = layout === 'phone'
  const touch = layout !== 'desk'
  const growthDown = !!m.growthError

  const aiTile = (
    <Tile
      key="ai" layout={layout} testId="growth-number-ai"
      label={phone ? 'AI answers' : touch ? 'AI answers name you' : 'AI answers that name you'}
      value={growthDown ? '' : String(ai.mentioned)}
      unit={growthDown ? 'Not read' : `of ${ai.asked}`}
      openLabel="Open AI answers in Numbers"
      visual={growthDown || ai.weekly.length === 0 ? null : <Columns values={ai.weekly.map(w => w.mentioned)} w={phone ? 52 : 72} h={phone ? 24 : 30} label={`Answers that named you, by week: ${ai.weekly.map(w => w.mentioned).join(', ')}`} />}
      delta={growthDown
        ? <Delta tone="amber" dir="flat">Could not read</Delta>
        : ai.asked === 0
          ? <Delta bare tone="neutral" dir="flat">Not asked yet</Delta>
          : <Delta bare={phone} tone={trendTone(ai.trend)} dir={ai.trend}>
              {phone ? (ai.trend === 'up' ? 'Rising' : ai.trend === 'down' ? 'Falling' : 'No change') : ai.trend === 'flat' ? `${ai.last} a week, no change` : `${ai.trend === 'up' ? 'Up' : 'Down'} from ${ai.first} a week to ${ai.last}`}
            </Delta>}
      onOpen={() => onOpen('ai')}
    />
  )
  const visitsTile = (
    <Tile
      key="visits" layout={layout} testId="growth-number-visits"
      label={phone ? 'This week' : touch ? 'Site visits this week' : `Visits to your ${visits.sites.length === 4 ? 'four ' : ''}sites`}
      value={visits.cur == null ? '' : String(visits.cur)}
      unit={visits.cur == null ? 'Not counted yet' : touch ? 'visits' : 'this week'}
      openLabel="Open site visits in Numbers"
      visual={visits.cur == null ? null : <Columns values={visits.weekly} w={phone ? 52 : 72} h={phone ? 24 : 30} tone="neutral" label={`Visits by week, oldest first: ${visits.weekly.join(', ')}`} />}
      delta={visits.cur == null
        ? <Delta bare tone="neutral" dir="flat">{m.web.error ? 'Could not read' : 'No site counted'}</Delta>
        : <Delta bare={phone} tone={trendTone(visits.trend)} dir={visits.trend}>
            {visits.trend === 'flat' ? (phone ? 'No change' : 'Same as last week') : `${visits.trend === 'up' ? 'Up' : 'Down'} from ${visits.prev}`}
          </Delta>}
      onOpen={() => onOpen('visits')}
    />
  )
  const googleTile = (
    <Tile
      key="google" layout={layout} testId="growth-number-google"
      label={phone ? 'On Google' : 'Searches that find you'}
      value={google.total ? String(google.ranking) : ''}
      unit={google.total ? `of ${google.total}` : m.seo.error ? 'Not read' : 'None tracked'}
      openLabel="Open Google in Numbers"
      visual={google.total ? <DotGrid total={google.total} lit={google.ranking} cols={phone ? 13 : touch ? 15 : 19} dot={phone ? 3 : 3.5} gap={phone ? 1.6 : 1.5} label={`${google.ranking} of ${google.total} searches find you`} /> : null}
      delta={<Delta bare={phone} tone={google.top10 > 0 ? 'mint' : 'neutral'} dir="flat">{phone ? `${google.top10} in top 10` : google.top10 === 1 ? '1 in the top 10' : `${google.top10} in the top 10`}</Delta>}
      onOpen={() => onOpen('google')}
    />
  )
  const clipsTile = (
    <Tile
      key="clips" layout={layout} testId="growth-number-clips"
      label="Clips this week"
      value={growthDown ? '' : String(have)}
      unit={growthDown ? 'Not read' : `of ${BATCH_MIN}`}
      openLabel="Open this week's clips"
      visual={growthDown ? null : <ClipSlots have={have} />}
      delta={growthDown
        ? <Delta tone="amber" dir="flat">Could not read</Delta>
        : <Delta tone={have >= BATCH_MIN ? 'mint' : 'amber'} dir={have > 0 ? 'up' : 'flat'}>{have >= BATCH_MIN ? 'This week\'s aim is met' : `The aim is ${BATCH_MIN} to ${BATCH_MAX}`}</Delta>}
      onOpen={() => onOpen('clips')}
    />
  )

  return (
    <div className={`flex ${phone ? 'gap-2' : 'gap-3'}`} data-testid="growth-numbers-strip">
      {aiTile}
      {visitsTile}
      {googleTile}
      {!phone && clipsTile}
    </div>
  )
}

/**
 * The widest desk gives the numbers a column of their own, so each one can
 * carry the next level down: rate per product, visits per site, the biggest
 * search missed. Still glanceable; the rows behind them stay in Numbers.
 */
export function FindingColumn({ m, onOpen }: { m: GrowthTabModel; onOpen: (a: NumberAnchor) => void }) {
  const { products, totals } = m.signals
  const ai = aiSummary(products, totals)
  const visits = visitsSummary(m.web.data, totals)
  const google = googleSummary(m.seo.rows)
  const have = totals.clips.made
  const card = 'surface w-full rounded-2xl p-4 text-left transition-colors hover:border-violet-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50'
  const maxMentioned = Math.max(1, ...ai.byProduct.map(p => p.aiAnswers.mentioned))
  const gap = google.missing[0]
  return (
    <div className="flex flex-col gap-3" data-testid="growth-numbers-column">
      <Eyebrow>Is anyone finding you?</Eyebrow>
      <button type="button" className={card} onClick={() => onOpen('ai')} aria-label="Open AI answers in Numbers" data-testid="growth-number-ai">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-label text-ink-muted">AI answers that name you</p>
          {ai.asked > 0 && !m.growthError && <Delta tone={trendTone(ai.trend)} dir={ai.trend}>{ai.trend === 'flat' ? 'No change' : `${ai.trend === 'up' ? 'Up' : 'Down'} from ${ai.first} a week`}</Delta>}
        </div>
        <p className="mt-1 flex items-baseline gap-1.5">
          {!m.growthError && <span className="font-display text-heading font-semibold tabular-nums text-ink">{ai.mentioned}</span>}
          <span className="text-label text-ink-muted">{m.growthError ? 'Not read just now' : `of ${ai.asked} in 30 days`}</span>
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {ai.byProduct.map(p => (
            <li key={p.slug} className="grid grid-cols-[80px_1fr_auto] items-center gap-2">
              <span className="text-label text-ink-muted break-words">{p.label}</span>
              <ShareBar value={p.aiAnswers.mentioned} max={maxMentioned} label={`${p.aiAnswers.mentioned} of ${p.aiAnswers.asked}`} />
              <span className="font-mono text-micro tabular-nums text-ink-muted">{p.aiAnswers.mentioned}/{p.aiAnswers.asked}</span>
            </li>
          ))}
        </ul>
      </button>
      <button type="button" className={card} onClick={() => onOpen('visits')} aria-label="Open site visits in Numbers" data-testid="growth-number-visits">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-label text-ink-muted">Visits to your sites</p>
          {visits.cur != null && <Delta tone="neutral" dir={visits.trend}>{visits.trend === 'flat' ? 'Same as last week' : `From ${visits.prev}`}</Delta>}
        </div>
        <p className="mt-1 flex items-baseline gap-1.5">
          {visits.cur != null && <span className="font-display text-heading font-semibold tabular-nums text-ink">{visits.cur}</span>}
          <span className="text-label text-ink-muted">{visits.cur == null ? 'No site is counted yet' : 'this week'}</span>
        </p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {visits.sites.map(s => (
            <li key={s.prefix} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3">
              <span className="text-label text-ink-muted break-words">{s.label}</span>
              {s.totals ? (
                <>
                  <span className="font-mono text-ui font-semibold tabular-nums text-ink">{s.totals.cur.sessions}</span>
                  <span className="font-mono text-micro tabular-nums text-ink-muted">was {s.totals.prev.sessions}</span>
                </>
              ) : (
                <span className="col-span-2 text-micro text-ink-muted">Not counted</span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-micro text-ink-muted">This week, and the week before. Checked {relativeTime(m.web.data?.last_run?.run_at) ?? 'not yet'}.</p>
      </button>
      <button type="button" className={card} onClick={() => onOpen('google')} aria-label="Open Google in Numbers" data-testid="growth-number-google">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-label text-ink-muted">Searches that find you on Google</p>
          <Delta tone={google.top10 > 0 ? 'mint' : 'neutral'} dir="flat">{google.top10} in the top 10</Delta>
        </div>
        <div className="mt-1 flex items-end justify-between gap-3">
          <p className="flex items-baseline gap-1.5">
            <span className="font-display text-heading font-semibold tabular-nums text-ink">{google.ranking}</span>
            <span className="text-label text-ink-muted">of {google.total}</span>
          </p>
          {google.total > 0 && <DotGrid total={google.total} lit={google.ranking} cols={19} dot={4} gap={2} label={`${google.ranking} of ${google.total} searches find you`} />}
        </div>
        {gap && (
          <>
            <p className="mt-3 text-micro text-ink-muted">Biggest search you are missing</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-ink">
              <span className="font-semibold break-words">"{gap.keyword}"</span>
              <span className="font-mono text-micro text-ink-muted">{fmtSearches(gap.monthly_searches)}</span>
              <ProductTag slug={gap.product} />
            </p>
          </>
        )}
      </button>
      <button type="button" className={card} onClick={() => onOpen('clips')} aria-label="Open this week's clips" data-testid="growth-number-clips">
        <div className="flex items-center justify-between gap-2">
          <p className="text-label text-ink-muted">Clips this week</p>
          <ClipSlots have={have} h={18} w={8} />
        </div>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="font-display text-heading font-semibold tabular-nums text-ink">{have}</span>
          <span className="text-label text-ink-muted">of {BATCH_MIN}. The aim is {BATCH_MIN} to {BATCH_MAX}.</span>
        </p>
      </button>
    </div>
  )
}

