/**
 * Growth: the default view. The numbers at a glance, then the one move.
 *
 *   phone   strip of 3, the card, the next two moves
 *   tablet  strip of 4, the card, the next three
 *   wide    strip of 4, then the card beside the week's list
 *   xwide   the numbers as a column, the card, the week's list
 */
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronUp, SkipForward } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { Claim } from '../shared/Claim'
import { Skeleton } from '../shared/Skeleton'
import { Button } from '../ui/button'
import { relativeTime } from '../../lib/ageHelpers'
import { reviewWeekFor } from '../../lib/growth'
import { reviewMoves, type NextMove } from '../../lib/growthModel'
import { MoveCard, moveFact, moveHeadline, segStates, type SectionLink } from './MoveCard'
import { ORDER_RULE, WhyContent } from './Why'
import { NumbersStrip, FindingColumn, type NumberAnchor } from './NumbersStrip'
import { KIND, Overlay, ProductTag, minutesLabel, moveKind } from './bits'
import { SegBar, Ring } from './viz'
import type { GrowthTabModel } from './useGrowthTab'

export type Layout = 'phone' | 'tablet' | 'wide' | 'xwide'

/** Sunday 17:00 UTC, the next time the review is written. */
export function nextReviewAt(now: number): number {
  const d = new Date(now)
  const sunday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + ((7 - d.getUTCDay()) % 7), 17)
  return sunday > now ? sunday : sunday + 7 * 86_400_000
}

/** Why the week is short, when it is. One line, said once. */
export function shortWeekLine(m: GrowthTabModel): string | null {
  if (m.growthError) return null
  const week = reviewWeekFor(m.now)
  const current = m.split.thisWeek.filter(r => r.week_start.slice(0, 10) === week)
  const next = relativeTime(new Date(nextReviewAt(m.now.getTime())).toISOString()) ?? 'on Sunday'
  if (current.length === 0) return `No review was written for this week, so it added no moves. The next review is written ${next}.`
  if (current.every(r => reviewMoves(r).length === 0)) return `Sunday's review had numbers only, so it added no moves. The next review is written ${next}.`
  return null
}

export function NextView({ m, layout, mobile, summary, onSection, onLink, onNumber }: {
  m: GrowthTabModel
  layout: Layout
  mobile: boolean
  /** The one plain sentence; shown here on a touch shell, in the title band on the desk. */
  summary: string | null
  onSection: (s: 'week' | 'numbers' | 'places') => void
  onLink: SectionLink
  onNumber: (a: NumberAnchor) => void
}) {
  const [whyOpen, setWhyOpen] = useState(false)
  const [finished, setFinished] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const move: NextMove | undefined = m.queue[m.cursor]
  const showDone = m.allDone && finished
  const desk = layout === 'wide' || layout === 'xwide'
  const narrow = layout === 'phone'

  useEffect(() => { setWhyOpen(false) }, [move?.id])

  if (m.loading) return <NextSkeleton layout={layout} />

  const pick = (i: number) => {
    m.setCursor(i)
    setFinished(false)
    cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  const errorLine = m.growthError && (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3" data-testid="growth-read-error">
      <p className="min-w-0 flex-1 text-body text-amber-100">Sunday's reviews, clips and places could not be read, so only the site moves are here.</p>
      <Button variant="outline" size="default" className="tap-44" onClick={m.retry}>Try again</Button>
    </div>
  )

  const card = showDone ? (
    <AllDone m={m} onSeeWeek={() => onSection('week')} narrow={narrow} />
  ) : move ? (
    <MoveCard
      m={m} move={move} narrow={narrow} mobile={mobile}
      onWhy={() => setWhyOpen(o => !o)}
      onFinish={() => setFinished(true)}
      onSection={onLink}
      onSeeWeek={() => onSection('week')}
    />
  ) : (
    <EmptyWeek />
  )

  const inlineWhy = desk && whyOpen && move && !showDone && (
    <section className="surface rounded-3xl p-6" data-testid="growth-why-inline">
      <WhyContent m={m} move={move} mobile={false} />
      <Button variant="ghost" size="default" className="tap-44 mt-2" onClick={() => setWhyOpen(false)}>
        <ChevronUp size={16} aria-hidden /> Hide why
      </Button>
    </section>
  )

  const sheetWhy = !desk && move && (
    <Overlay open={whyOpen} onClose={() => setWhyOpen(false)} label="Why this move" mobile={mobile}>
      <WhyContent m={m} move={move} mobile={mobile} />
    </Overlay>
  )

  const short = shortWeekLine(m)
  const shortBox = short && !whyOpen && !showDone && (
    <p className="rounded-2xl border border-white/[0.08] px-4 py-3 text-body text-ink-muted" data-testid="growth-short-week">{short}</p>
  )

  if (layout === 'xwide') {
    return (
      <div className="grid grid-cols-[340px_minmax(0,1fr)_360px] items-start gap-6">
        <FindingColumn m={m} onOpen={onNumber} />
        <div ref={cardRef} className="flex min-w-0 flex-col gap-4">
          <Eyebrow>Do this now</Eyebrow>
          {errorLine}
          {card}
          {inlineWhy}
          {/* The widest desk has the room to show the queue as a queue: the
              next moves wait under the one in focus, each one press away. */}
          {!whyOpen && !showDone && <UpNext m={m} count={3} onPick={pick} onSeeWeek={() => onSection('week')} short={null} bare />}
          {shortBox}
        </div>
        <WeekRail m={m} onPick={pick} onSeeWeek={() => onSection('week')} />
      </div>
    )
  }

  if (layout === 'wide') {
    return (
      <div className="flex flex-col gap-6">
        <NumbersStrip m={m} layout="desk" onOpen={onNumber} />
        <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
          <div ref={cardRef} className="flex min-w-0 flex-col gap-4">
            {errorLine}
            {card}
            {inlineWhy}
            {shortBox}
          </div>
          <WeekRail m={m} onPick={pick} onSeeWeek={() => onSection('week')} />
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col ${narrow ? 'gap-4' : 'gap-5'}`}>
      {summary && <p className="text-body text-ink" data-testid="growth-summary">{summary}</p>}
      <NumbersStrip m={m} layout={narrow ? 'phone' : 'tablet'} onOpen={onNumber} />
      {errorLine}
      <div ref={cardRef} className="scroll-mt-4">{card}</div>
      {!showDone && <UpNext m={m} count={narrow ? 2 : 3} onPick={pick} onSeeWeek={() => onSection('week')} short={short} />}
      {sheetWhy}
    </div>
  )
}

function StateMark({ m, move, i }: { m: GrowthTabModel; move: NextMove; i: number }) {
  const o = m.outcomeOf(move.id)
  if (o?.kind === 'skipped') return <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-white/15 text-ink-faint"><SkipForward size={12} aria-label="Skipped" /></span>
  if (o) return <span className="btn-contrast flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"><Check size={12} aria-label="Done" /></span>
  return <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border font-mono text-micro tabular-nums ${i === m.cursor ? 'border-violet-400/60 text-ink' : 'border-white/15 text-ink-muted'}`}>{i + 1}</span>
}

function UpNext({ m, count, onPick, onSeeWeek, short, bare = false }: {
  m: GrowthTabModel; count: number; onPick: (i: number) => void; onSeeWeek: () => void; short: string | null
  /** Beside the week rail: no "see all" and no count, the rail already says both. */
  bare?: boolean
}) {
  const after: Array<{ mv: NextMove; i: number }> = []
  for (let k = 1; k < m.queue.length && after.length < count; k++) {
    const i = (m.cursor + k) % m.queue.length
    if (!m.outcomeOf(m.queue[i].id)) after.push({ mv: m.queue[i], i })
  }
  return (
    <section className="flex flex-col gap-2" data-testid="growth-up-next">
      <div className="flex items-center gap-3 px-1">
        <Eyebrow className="flex-1">Up next</Eyebrow>
        {!bare && <span className="font-mono text-label tabular-nums text-ink-muted">{m.openCount} left this week</span>}
      </div>
      {after.length === 0 ? (
        <p className="px-1 text-body text-ink-muted">{m.queue.length ? 'This is the last one.' : 'Nothing else this week.'}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {after.map(({ mv, i }) => {
            const K = KIND[moveKind(mv)]
            return (
              <li key={mv.id}>
                <button
                  type="button"
                  onClick={() => onPick(i)}
                  className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                  aria-label={`Do this one now: ${moveHeadline(mv)}`}
                >
                  <K.icon size={16} className="flex-shrink-0 text-ink-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body text-ink break-words">{moveHeadline(mv)}</span>
                    {bare && <span className="mt-0.5 block text-label text-ink-muted break-words">{moveFact(m, mv)}</span>}
                  </span>
                  {mv.minutes != null && <span className="flex-shrink-0 font-mono text-micro tabular-nums text-ink-muted">{minutesLabel(mv.minutes)}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {!bare && m.queue.length > 0 && (
        <Button variant="ghost" size="default" className="tap-44 self-start px-1" onClick={onSeeWeek}>
          See all {m.queue.length} moves <ArrowRight size={14} aria-hidden />
        </Button>
      )}
      {short && <p className="px-1 text-label text-ink-muted" data-testid="growth-short-week">{short}</p>}
    </section>
  )
}

function WeekRail({ m, onPick, onSeeWeek }: { m: GrowthTabModel; onPick: (i: number) => void; onSeeWeek: () => void }) {
  const settled = m.queue.length - m.openCount
  return (
    <aside className="surface flex flex-col gap-3 rounded-3xl p-5" data-testid="growth-week-rail">
      <div className="flex items-center gap-3">
        <Eyebrow className="flex-1">This week</Eyebrow>
        <span className="font-mono text-label tabular-nums text-ink-muted">{settled} of {m.queue.length} done</span>
      </div>
      {m.queue.length > 0 && <SegBar states={segStates(m)} label={`${settled} of ${m.queue.length} moves done`} />}
      <ol className="flex flex-col gap-1">
        {m.queue.map((mv, i) => {
          const on = i === m.cursor
          const o = m.outcomeOf(mv.id)
          return (
            <li key={mv.id}>
              <button
                type="button"
                onClick={() => onPick(i)}
                aria-current={on ? 'step' : undefined}
                className={`flex min-h-[44px] w-full items-start gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
                  on ? 'border-violet-400/40 bg-violet-500/[0.08]' : 'border-transparent hover:bg-white/[0.04]'
                }`}
              >
                <StateMark m={m} move={mv} i={i} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-body leading-snug break-words ${o ? 'text-ink-muted line-through decoration-white/20' : 'text-ink'}`}>{moveHeadline(mv)}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <ProductTag slug={mv.product} />
                    {mv.minutes != null && <span className="font-mono text-micro tabular-nums text-ink-muted">{minutesLabel(mv.minutes)}</span>}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <p className="text-label text-ink-muted">{ORDER_RULE}</p>
      <Button variant="ghost" size="default" className="tap-44 self-start px-1" onClick={onSeeWeek}>Open the week <ArrowRight size={14} aria-hidden /></Button>
    </aside>
  )
}

function AllDone({ m, onSeeWeek, narrow }: { m: GrowthTabModel; onSeeWeek: () => void; narrow: boolean }) {
  const vals = m.queue.map(mv => m.outcomeOf(mv.id)).filter(Boolean)
  const counts = [
    { label: 'On today\'s list', n: vals.filter(o => o?.kind === 'today').length },
    { label: 'Clips added', n: vals.filter(o => o?.kind === 'clip').length },
    { label: 'Answered', n: vals.filter(o => o?.kind === 'answered').length },
    { label: 'Done', n: vals.filter(o => o?.kind === 'done').length },
    { label: 'Skipped', n: vals.filter(o => o?.kind === 'skipped').length },
  ].filter(c => c.n > 0)
  const acted = m.queue.length - (counts.find(c => c.label === 'Skipped')?.n ?? 0)
  const next = relativeTime(new Date(nextReviewAt(m.now.getTime())).toISOString())
  return (
    <section className={`surface flex flex-col gap-5 rounded-3xl ${narrow ? 'p-5' : 'p-7'}`} data-testid="growth-all-done">
      <div className="flex items-center gap-4">
        <Ring value={acted} max={m.queue.length} size={narrow ? 56 : 72} stroke={narrow ? 5 : 6} label={`${acted} of ${m.queue.length} moves acted on`} />
        <div className="min-w-0">
          <Claim size={narrow ? 'title' : 'heading'} source={`The next moves come with Sunday's review${next ? `, ${next}` : ''}.`}>All done for this week.</Claim>
        </div>
      </div>
      <ul className={`grid gap-2 ${narrow ? 'grid-cols-2' : 'grid-cols-5'}`}>
        {counts.map(c => (
          <li key={c.label} className="flex flex-col gap-0.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
            <span className="font-display text-title font-semibold tabular-nums text-ink">{c.n}</span>
            <span className="text-label text-ink-muted">{c.label}</span>
          </li>
        ))}
      </ul>
      <Button variant="outline" size="touch" className={narrow ? 'w-full' : 'self-start'} onClick={onSeeWeek}>See the week <ArrowRight size={16} aria-hidden /></Button>
    </section>
  )
}

function EmptyWeek() {
  return (
    <section className="surface flex flex-col gap-2 rounded-3xl p-6" data-testid="growth-empty-week">
      <Claim size="title">Nothing is waiting on you this week.</Claim>
      <p className="text-body text-ink-muted">Moves come from the daily site check and Sunday's review. When either finds something, it shows up here.</p>
    </section>
  )
}

/** Rung 1: the exact geometry of what is arriving, no words. */
function NextSkeleton({ layout }: { layout: Layout }) {
  const tiles = layout === 'phone' ? 3 : 4
  const tile = layout === 'phone' ? 102 : 118
  const cardBox = (
    <div className={`surface flex flex-col rounded-3xl ${layout === 'phone' ? 'gap-4 p-4' : 'gap-5 p-6'}`} aria-hidden>
      <Skeleton h={6} r={3} />
      <div className="flex items-center gap-2.5"><Skeleton w={36} h={36} r={12} /><Skeleton w="40%" h={12} /></div>
      <div className="flex flex-col gap-2"><Skeleton w="85%" h={layout === 'phone' ? 20 : 28} /><Skeleton w="55%" h={layout === 'phone' ? 20 : 28} /></div>
      <Skeleton w="70%" h={14} />
      <Skeleton h={48} r={12} />
      <Skeleton h={48} r={12} />
    </div>
  )
  return (
    <div className="flex flex-col gap-5" data-testid="growth-loading" aria-busy="true">
      {layout !== 'xwide' && (
        <div className={`flex ${layout === 'phone' ? 'gap-2' : 'gap-3'}`}>
          {Array.from({ length: tiles }).map((_, i) => <Skeleton key={i} h={tile} r={16} className="flex-1" />)}
        </div>
      )}
      {layout === 'wide' || layout === 'xwide' ? (
        <div className={`grid items-start gap-6 ${layout === 'xwide' ? 'grid-cols-[340px_minmax(0,1fr)_360px]' : 'grid-cols-[minmax(0,1fr)_340px]'}`}>
          {layout === 'xwide' && <div className="flex flex-col gap-3">{[200, 220, 170].map((h, i) => <Skeleton key={i} h={h} r={16} />)}</div>}
          {cardBox}
          <Skeleton h={520} r={24} />
        </div>
      ) : cardBox}
    </div>
  )
}
