/**
 * Growth: This week. The whole queue in order, Sunday's reviews, this week's
 * clips, and the past weeks as history that asks for nothing (with one tap to
 * clear the older weeks still waiting on a ruling).
 * Deep links: ?section=week (and the old ?section=council, ?section=work).
 */
import { useState } from 'react'
import { ArrowRight, Check, ChevronDown, History, SkipForward } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { Button } from '../ui/button'
import { DrawnCheck } from '../shared/DrawnCheck'
import { OptionChips } from '../goals/GoalPickers'
import { failureMessage } from '../../lib/apiFetch'
import { ventureLabel } from '../../lib/ventureOptions'
import { BATCH_MIN, BOARD_STAGES, shortDate, type CouncilReviewRow, type Stage } from '../../lib/growth'
import { degradedReview, reviewHeadline, reviewMoves } from '../../lib/growthModel'
import { KIND, Overlay, ProductTag, minutesLabel, moveKind } from './bits'
import { SegBar } from './viz'
import { moveHeadline, segStates } from './MoveCard'
import { ClipStages, ORDER_RULE, ReviewDetail } from './Why'
import { STAGE_WORD, type GrowthTabModel } from './useGrowthTab'

export function WeekView({ m, mobile, wide, onDo }: { m: GrowthTabModel; mobile: boolean; wide: boolean; onDo: (i: number) => void }) {
  const [reading, setReading] = useState<CouncilReviewRow | null>(null)
  const settled = m.queue.length - m.openCount
  const timed = m.queue.reduce((n, mv) => n + (mv.minutes ?? 0), 0)
  const clipIndex = m.queue.findIndex(mv => mv.source === 'clip')

  const moves = (
    <section className="surface flex flex-col gap-3 rounded-3xl p-5" data-testid="growth-week-moves">
      <div className="flex items-center gap-3">
        <Eyebrow className="flex-1">This week's moves</Eyebrow>
        <span className="font-mono text-label tabular-nums text-ink-muted">{settled} of {m.queue.length} done</span>
      </div>
      {m.queue.length > 0 && <SegBar states={segStates(m)} label={`${settled} of ${m.queue.length} moves done`} />}
      <p className="text-label text-ink-muted">{ORDER_RULE}{timed > 0 ? ` The moves with a time add up to ${minutesLabel(timed)}.` : ''}</p>
      {m.queue.length === 0 ? (
        <p className="text-body text-ink-muted">Nothing is waiting on you this week.</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {m.queue.map((mv, i) => {
            const o = m.outcomeOf(mv.id)
            const K = KIND[moveKind(mv)]
            return (
              <li key={mv.id}>
                <button
                  type="button"
                  onClick={() => onDo(i)}
                  aria-label={`Open move ${i + 1}: ${moveHeadline(mv)}`}
                  className="flex min-h-[52px] w-full items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                  data-testid="growth-week-move"
                >
                  {o?.kind === 'skipped'
                    ? <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-white/15 text-ink-faint"><SkipForward size={12} aria-hidden /></span>
                    : o
                      ? <span className="btn-contrast mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"><Check size={12} aria-hidden /></span>
                      : <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-white/15 font-mono text-micro tabular-nums text-ink-muted">{i + 1}</span>}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-body leading-snug break-words ${o ? 'text-ink-muted' : 'text-ink'}`}>{moveHeadline(mv)}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-ink-muted">
                      <K.icon size={12} aria-hidden /> {K.label}
                      <ProductTag slug={mv.product} />
                      {mv.minutes != null && <span className="font-mono tabular-nums">{minutesLabel(mv.minutes)}</span>}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )

  const rows = m.split.thisWeek
  const reviews = (
    <section className="surface flex flex-col gap-3 rounded-3xl p-5" data-testid="growth-week-reviews">
      <div className="flex flex-wrap items-center gap-3">
        <Eyebrow className="flex-1">Sunday's reviews</Eyebrow>
        {m.split.latest && <span className="text-label text-ink-muted">Week of {shortDate(m.split.latest)}</span>}
      </div>
      {m.growthError ? (
        <p className="text-body text-ink-muted">The reviews could not be read just now.</p>
      ) : rows.length === 0 ? (
        <p className="text-body text-ink-muted">No review has been written yet. One is written for each product every Sunday evening.</p>
      ) : (
        <>
          {rows.every(r => degradedReview(r)) && (
            <p className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-body text-amber-100">
              This week's reviews had numbers only, because the writing step was down. The numbers are still inside each one.
            </p>
          )}
          <ul className="flex flex-col gap-1.5">
            {rows.map(r => {
              const n = reviewMoves(r).length
              const headline = reviewHeadline(r)
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setReading(r)}
                    className="flex min-h-[52px] w-full items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                    aria-label={`Read the review for ${ventureLabel(r.product_slug) ?? r.product_slug}`}
                    data-testid="growth-week-review"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <ProductTag slug={r.product_slug} />
                        <span className="text-micro text-ink-muted">{degradedReview(r) ? 'Numbers only' : n === 1 ? '1 move' : `${n} moves`}</span>
                      </span>
                      {headline && <span className="mt-1 block text-body text-ink break-words">{headline}</span>}
                    </span>
                    <ArrowRight size={16} className="mt-1 flex-shrink-0 text-ink-faint" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )

  const clipsBlock = (
    <section className="surface flex flex-col gap-3 rounded-3xl p-5" data-testid="growth-week-clips">
      <div className="flex items-center gap-3">
        <Eyebrow className="flex-1">Clips this week</Eyebrow>
        <span className="font-mono text-label tabular-nums text-ink-muted">{m.batch.length} of {BATCH_MIN}</span>
      </div>
      <ClipStages m={m} />
      {m.batch.length === 0 ? (
        <p className="text-label text-ink-muted">No clip is picked yet. The aim is 3 to 5 a week.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {m.batch.map(c => <ClipRow key={c.id} m={m} id={c.id} />)}
        </ul>
      )}
      {clipIndex >= 0 && !m.outcomeOf(m.queue[clipIndex].id) && (
        <Button variant="outline" size="default" className="tap-44 self-start" onClick={() => onDo(clipIndex)}>
          {m.batch.length === 0 ? 'Start this week\'s first clip' : 'Open the next clip move'} <ArrowRight size={14} aria-hidden />
        </Button>
      )}
    </section>
  )

  const past = <PastWeeks m={m} />

  return (
    <div className={wide ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-6' : 'flex flex-col gap-4'}>
      {wide ? (
        <>
          {moves}
          <div className="flex flex-col gap-4">{reviews}{clipsBlock}{past}</div>
        </>
      ) : (
        <>{moves}{reviews}{clipsBlock}{past}</>
      )}
      <Overlay open={reading != null} onClose={() => setReading(null)} label="Weekly review" mobile={mobile}>
        {reading && <ReviewDetail m={m} row={m.g.reviews.find(r => r.id === reading.id) ?? reading} mobile={mobile} />}
      </Overlay>
    </div>
  )
}

/** One of this week's clips, with the step it is at as chips. A tap moves it. */
function ClipRow({ m, id }: { m: GrowthTabModel; id: string }) {
  const card = m.g.cards.find(c => c.id === id)
  const [line, setLine] = useState<string | null>(null)
  if (!card) return null
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3" data-testid="growth-clip-row">
      <div className="flex flex-wrap items-center gap-2">
        <ProductTag slug={card.product_slug} />
      </div>
      <p className="text-body text-ink break-words">{card.title}</p>
      <OptionChips
        value={card.stage}
        onChange={v => {
          setLine(null)
          m.g.patchCard(card.id, { stage: v as Stage }).catch(e => setLine(failureMessage(e, 'Could not move the clip.')))
        }}
        options={BOARD_STAGES.map(s => ({ value: s, label: STAGE_WORD[s] }))}
      />
      {line && <p role="status" className="text-label text-accent-3 break-words">{line}</p>}
    </li>
  )
}

function PastWeeks({ m }: { m: GrowthTabModel }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cleared, setCleared] = useState<number | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const older = m.split.older
  if (older.length === 0) return null
  const weeks = [...new Set(older.map(r => r.week_start.slice(0, 10)))]
  const waiting = m.unruledOld.length

  const clear = async () => {
    setBusy(true)
    setFailed(null)
    try {
      setCleared(await m.g.clearOldReviews())
    } catch (e) {
      setFailed(failureMessage(e, 'Could not clear the older weeks.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="surface flex flex-col gap-3 rounded-3xl p-5" data-testid="growth-week-past">
      <div className="flex items-center gap-3">
        <History size={16} className="text-ink-muted" aria-hidden />
        <Eyebrow className="flex-1">Past weeks</Eyebrow>
        <span className="font-mono text-label tabular-nums text-ink-muted">{weeks.length === 1 ? '1 week' : `${weeks.length} weeks`}</span>
      </div>
      <p className="text-body text-ink">
        {older.length === 1 ? '1 older review.' : `${older.length} older reviews.`} {waiting > 0 ? `${waiting} of them have no note from you. Only this week's reviews ask for anything, so you can clear the rest.` : 'They need nothing from you.'}
      </p>
      {cleared != null ? (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3" data-testid="growth-cleared">
          <DrawnCheck size={26} stroke="rgb(var(--accent))" />
          <p className="text-body text-ink">Cleared. {cleared === 1 ? '1 older review is' : `${cleared} older reviews are`} history now and will not ask again.</p>
        </div>
      ) : waiting > 0 ? (
        <Button variant="outline" size="default" className="tap-44 self-start" loading={busy} onClick={() => void clear()} data-testid="growth-clear-old">
          Clear older weeks
        </Button>
      ) : null}
      {failed && <p role="status" className="text-label text-accent-3 break-words">{failed}</p>}
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="tap-44 inline-flex min-h-[44px] items-center gap-1.5 self-start text-label font-semibold text-ink-muted hover:text-ink">
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        {open ? 'Hide past weeks' : 'Show past weeks'}
      </button>
      {open && (
        <ul className="flex flex-col gap-1.5">
          {weeks.map(w => {
            const rows = older.filter(r => r.week_start.slice(0, 10) === w)
            const numbersOnly = rows.every(r => degradedReview(r))
            return (
              <li key={w} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/[0.06] px-3 py-2">
                <span className="text-body text-ink">Week of {shortDate(w)}</span>
                <span className="text-micro text-ink-muted">{rows.length === 1 ? '1 review' : `${rows.length} reviews`}{numbersOnly ? ', numbers only' : ''}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
