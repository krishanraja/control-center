/**
 * Growth: the evidence, only when asked. "Why this move?" opens this in the
 * house sheet on a touch device and in place under the card on the desk.
 * Read first, rows second: each block opens on what the evidence means, and
 * the raw receipt (the numbers a review used) stays one more tap away.
 */
import React, { useState } from 'react'
import { CalendarPlus, ChevronDown, Film, PenLine } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { FocusedEditor } from '../shared/FocusedEditor'
import { Button } from '../ui/button'
import { relativeTime } from '../../lib/ageHelpers'
import { failureMessage } from '../../lib/apiFetch'
import { ventureLabel } from '../../lib/ventureOptions'
import { BATCH_MAX, BATCH_MIN, BOARD_STAGES, type CouncilReviewRow } from '../../lib/growth'
import {
  SHORT_SITE_MINUTES, degradedReview, isClearedReview, parseMeasuredLine, reviewHeadline, reviewMoves,
  type NextMove,
} from '../../lib/growthModel'
import { DONE_HINT, FLAG_LINE, HEALTH_CHIP, webProperty, type WebPropertyView } from '../../lib/webProperties'
import { ANSWER_WORDS, CHANNEL_WORDS, ProductTag, minutesLabel, moveKind, platformLabel } from './bits'
import { Columns, ScoreTicks, WeekPair } from './viz'
import { SiteCheck } from './SiteCheck'
import { moveHeadline, visitsLine } from './MoveCard'
import { STAGE_WORD, type GrowthTabModel, type Outcome } from './useGrowthTab'

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-white/[0.08] pt-4">
      <Eyebrow>{title}</Eyebrow>
      {children}
    </section>
  )
}

/** Why a move sits where it sits, in one plain line. */
export function orderReason(move: NextMove): string {
  switch (moveKind(move)) {
    case 'choice': return 'it takes two minutes, and the site check needs the answer.'
    case 'site': return (move.minutes ?? Infinity) <= SHORT_SITE_MINUTES
      ? 'it is quick, and it comes from the daily site check.'
      : 'it comes from the daily site check.'
    case 'review': return 'it is from Sunday\'s review. The first move of every product comes before any second move.'
    case 'account': return 'it opens up places your buyers already go.'
    case 'clip': return `the week's aim is ${BATCH_MIN} to ${BATCH_MAX} short clips.`
    case 'spend': return 'it is small money, but it is money for nothing.'
    default: return 'it is next in the week.'
  }
}

/** The order rule, said once wherever the whole queue is shown. */
export const ORDER_RULE = 'Quick choices first, then short site steps, then Sunday\'s review, then longer site steps, accounts to make, clips, and money checks last.'

export function SiteVisits({ m, view }: { m: GrowthTabModel; view: WebPropertyView }) {
  const cur = view.totals?.cur.sessions ?? 0
  const prev = view.totals?.prev.sessions ?? 0
  const days = (view.series ?? []).map(d => d.sessions ?? 0)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-ink">{view.totals ? visitsLine(view.totals) : view.health_line}</p>
      {view.totals && (
        <>
          <div className="max-w-[320px]"><WeekPair cur={cur} prev={prev} max={Math.max(cur, prev, 3)} /></div>
          <div className="flex flex-col gap-1">
            <Columns values={days} w={224} h={32} tone="neutral" label={`Visits a day for 28 days on ${view.label}`} />
            <p className="text-micro text-ink-muted">Visits a day, last 28 days</p>
          </div>
        </>
      )}
      <p className="flex flex-wrap items-center gap-2 text-label text-ink-muted">
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-micro font-semibold text-ink-muted">{view.health ? HEALTH_CHIP[view.health] : 'Not read yet'}</span>
        {view.flags.map(f => <span key={f}>{FLAG_LINE[f]}</span>)}
      </p>
      <SiteCheck m={m} compact />
    </div>
  )
}

/** This week's clips, counted by step. */
export function ClipStages({ m }: { m: GrowthTabModel }) {
  return (
    <ol className="grid grid-cols-5 gap-1.5" data-testid="growth-clip-stages">
      {BOARD_STAGES.map(s => (
        <li key={s} className="flex min-w-0 flex-col items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-1 py-2 text-center">
          <span className="font-display text-title font-semibold tabular-nums text-ink">{m.batch.filter(c => c.stage === s).length}</span>
          <span className="text-micro text-ink-muted break-words">{STAGE_WORD[s]}</span>
        </li>
      ))}
    </ol>
  )
}

export function WhyContent({ m, move, mobile }: { m: GrowthTabModel; move: NextMove; mobile: boolean }) {
  const kind = moveKind(move)
  const view = move.property ? m.web.data?.properties.find(p => p.prefix === move.property) ?? null : null
  const action = m.siteAction(move)
  const canon = move.property ? webProperty(move.property)?.canon : null
  const review = move.reviewId ? m.g.reviews.find(r => r.id === move.reviewId) ?? null : null
  return (
    <div className="flex flex-col gap-4 pb-2" data-testid="growth-why">
      <div className="flex flex-col gap-1.5">
        <Eyebrow tone="accent">Why this move</Eyebrow>
        <p className="font-display text-lede font-semibold leading-snug text-ink break-words">{moveHeadline(move)}</p>
        <p className="text-label text-ink-muted">It is here now because {orderReason(move)}</p>
      </div>

      {kind === 'choice' && (
        <>
          {canon?.status === 'ruling_owed' && (
            <Block title="Why it is asking">
              <p className="text-body text-ink break-words">{canon.conflict}</p>
            </Block>
          )}
          <Block title="What each answer means">
            <ul className="flex flex-col gap-2">
              {(move.choices ?? []).map(c => {
                const w = ANSWER_WORDS[c.value] ?? { label: c.label, hint: c.hint ?? '' }
                return <li key={c.value} className="text-body text-ink break-words"><span className="font-semibold">{w.label}.</span> <span className="text-ink-muted">{w.hint}</span></li>
              })}
            </ul>
          </Block>
        </>
      )}

      {kind === 'site' && (
        <>
          <Block title="Why"><p className="text-body text-ink break-words">{move.why}</p></Block>
          {action && (
            <Block title="The first step">
              <p className="text-body text-ink break-words">{action.first_step}</p>
              <p className="text-label text-ink-muted">About {minutesLabel(action.minutes)}. {DONE_HINT[action.detector.kind]}</p>
            </Block>
          )}
        </>
      )}

      {(kind === 'choice' || kind === 'site') && view && (
        <Block title={`Visits to ${view.label}`}><SiteVisits m={m} view={view} /></Block>
      )}

      {kind === 'review' && review && <ReviewDetail m={m} row={review} highlight={move.title} mobile={mobile} />}

      {kind === 'account' && <AccountWhy m={m} move={move} />}

      {kind === 'clip' && (
        <>
          <Block title="Why clips">
            <p className="text-body text-ink">{move.why} The aim is {BATCH_MIN} to {BATCH_MAX} short clips a week. The quickest start is one of this week's moves, said to camera in a minute.</p>
          </Block>
          <Block title="Where clips are this week"><ClipStages m={m} /></Block>
        </>
      )}

      {kind === 'spend' && (
        <Block title="What it is">
          <p className="text-body text-ink break-words">{move.why}</p>
          <p className="text-label text-ink-muted">Every other spend limit is $0. Spend is kept in Intel, not here.</p>
        </Block>
      )}
    </div>
  )
}

function AccountWhy({ m, move }: { m: GrowthTabModel; move: NextMove }) {
  const platform = move.id.split(':')[2] ?? ''
  const channel = platform === 'substack' ? 'substack' : 'social_organic'
  const opens = m.g.touchpoints
    .filter(t => t.product_slug === move.product && t.channel === channel && t.coverage_status !== 'retired' && t.coverage_status !== 'covered')
    .sort((a, b) => (b.cost_efficiency_score ?? 0) - (a.cost_efficiency_score ?? 0))
  const others = m.g.accounts.filter(a => a.status === 'planned' && !(a.product_slug === move.product && a.platform.toLowerCase() === platform))
  return (
    <>
      <Block title={opens.length === 1 ? 'The place it opens up' : 'The places it opens up'}>
        {opens.length === 0 ? <p className="text-body text-ink-muted">No place on the list is waiting on it yet.</p> : (
          <ul className="flex flex-col gap-3">
            {opens.map(t => (
              <li key={t.id} className="flex flex-col gap-1">
                <p className="text-body font-semibold text-ink break-words">{t.watering_hole}</p>
                <p className="text-label text-ink-muted break-words">{t.icp_trigger}</p>
                {t.cost_efficiency_score != null && (
                  <p className="flex flex-wrap items-center gap-2 text-micro text-ink-muted">
                    <ScoreTicks score={t.cost_efficiency_score} label={`Rated ${t.cost_efficiency_score} of 10`} />
                    Rated {t.cost_efficiency_score} of 10, {CHANNEL_WORDS[t.channel]}
                  </p>
                )}
                {t.assumption_flag && <p className="text-label text-accent-3 break-words">Waiting on: {t.assumption_flag}</p>}
              </li>
            ))}
          </ul>
        )}
      </Block>
      {others.length > 0 && (
        <Block title="Other accounts not made yet">
          <ul className="flex flex-wrap gap-1.5">
            {others.map(a => (
              <li key={a.id} className="rounded-full border border-dashed border-white/20 px-2.5 py-1 text-label text-ink-muted">
                {ventureLabel(a.product_slug) ?? a.product_slug} {platformLabel(a.platform)}
              </li>
            ))}
          </ul>
        </Block>
      )}
    </>
  )
}

const FINDING_WORDS: Record<string, string> = {
  geo: 'AI answers', traffic: 'Visits', signups: 'Sign-ups', revenue: 'Money', pipeline: 'Clients',
  structural_blocker: 'What is in the way', blocker: 'What is in the way', spend: 'Spend', attribution_quality: 'How well it is measured',
}

/**
 * One product's weekly review, whole: the sentence, every move with its two
 * actions, what to stop, the evidence, and his note. Used under "Why" for a
 * review move and from the Week view.
 */
export function ReviewDetail({ m, row, highlight, mobile }: { m: GrowthTabModel; row: CouncilReviewRow; highlight?: string; mobile: boolean }) {
  const degraded = degradedReview(row)
  const headline = reviewHeadline(row)
  const moves = reviewMoves(row)
  const stop = (Array.isArray(row.kill_list) ? row.kill_list : []).map(s => String(s).trim()).filter(Boolean)
  const f = row.findings && typeof row.findings === 'object' && !Array.isArray(row.findings) ? row.findings as Record<string, unknown> : {}
  const evidence = Object.entries(f)
    .filter(([k, v]) => !['headline', 'degraded', 'measured'].includes(k) && !k.startsWith('unknown_') && typeof v === 'string' && v.trim())
    .map(([k, v]) => ({ key: k, value: (v as string).trim() }))
  const receipt = parseMeasuredLine(typeof f.measured === 'string' ? f.measured : typeof f.headline === 'string' ? f.headline : '')
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [noteLine, setNoteLine] = useState<string | null>(null)
  const cleared = isClearedReview(row)
  const note = cleared ? '' : row.krish_decision ?? ''

  const saveNote = async (text: string) => {
    try {
      await m.g.recordDecision(row.id, text)
      setNoteLine('Saved.')
      return true
    } catch (e) {
      setNoteLine(failureMessage(e, 'Could not save the note.'))
      return false
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="growth-review-detail">
      <div className="flex flex-wrap items-center gap-2">
        <ProductTag slug={row.product_slug} />
        <span className="text-label text-ink-muted">Written {relativeTime(row.created_at) ?? 'on Sunday'}</span>
      </div>
      {degraded ? (
        <p className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-body text-amber-100">
          Numbers only this week. The writing step was down, so there are no moves. The numbers are below.
        </p>
      ) : headline ? (
        <p className="font-display text-lede font-semibold leading-snug text-ink break-words">{headline}</p>
      ) : null}

      {moves.length > 0 && (
        <Block title={moves.length === 1 ? '1 move' : `${moves.length} moves`}>
          <ol className="flex flex-col gap-3">
            {moves.map((mv, i) => <ReviewMove key={`${i}:${mv}`} m={m} row={row} move={mv} i={i} inWeek={mv === highlight} />)}
          </ol>
        </Block>
      )}

      {stop.length > 0 && (
        <Block title="Stop">
          <ul className="flex flex-col gap-1.5">
            {stop.map(s => <li key={s} className="text-body text-ink break-words">{s}</li>)}
          </ul>
        </Block>
      )}

      {(evidence.length > 0 || receipt.length > 0) && (
        <section className="flex flex-col gap-2 border-t border-white/[0.08] pt-3">
          {evidence.length > 0 && (
            <>
              <button type="button" onClick={() => setEvidenceOpen(o => !o)} aria-expanded={evidenceOpen} className="tap-44 inline-flex min-h-[44px] items-center gap-1.5 self-start text-label font-semibold text-ink-muted hover:text-ink" data-testid="growth-review-evidence">
                <ChevronDown size={14} className={`transition-transform ${evidenceOpen ? 'rotate-180' : ''}`} aria-hidden />
                {evidenceOpen ? 'Hide what it found' : `What it found (${evidence.length})`}
              </button>
              {evidenceOpen && (
                <dl className="flex flex-col gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                  {evidence.map(e => (
                    <div key={e.key}>
                      <dt className="text-micro font-semibold text-ink-muted">{FINDING_WORDS[e.key] ?? e.key.replace(/_/g, ' ')}</dt>
                      <dd className="text-body text-ink break-words">{e.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          )}
          {receipt.length > 0 && (
            <>
              <button type="button" onClick={() => setReceiptOpen(o => !o)} aria-expanded={receiptOpen} className="tap-44 inline-flex min-h-[44px] items-center gap-1.5 self-start text-label font-semibold text-ink-muted hover:text-ink">
                <ChevronDown size={14} className={`transition-transform ${receiptOpen ? 'rotate-180' : ''}`} aria-hidden />
                {receiptOpen ? 'Hide the numbers' : 'The numbers it used'}
              </button>
              {receiptOpen && (
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                  {receipt.map(p => (
                    <React.Fragment key={p.key + p.label}>
                      <dt className="text-label text-ink-muted break-words">{p.label}</dt>
                      <dd className="text-right font-mono text-label tabular-nums text-ink">{p.value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              )}
            </>
          )}
        </section>
      )}

      <Block title="Your note on this review">
        {cleared && <p className="text-body text-ink-muted">Cleared as an older week. Nothing was judged.</p>}
        {note ? <p className="text-body text-ink break-words">{note}</p> : null}
        <p className="text-label text-ink-muted">Kept with the review. It does not change anything else.</p>
        {noteLine && <p role="status" className="text-label text-ink-muted break-words">{noteLine}</p>}
        {mobile ? (
          <>
            <Button variant="outline" size="default" className="tap-44 self-start" onClick={() => setNoteOpen(true)}>
              <PenLine size={16} aria-hidden /> {note ? 'Change the note' : 'Add a note'}
            </Button>
            <FocusedEditor open={noteOpen} onClose={() => setNoteOpen(false)} label="Your note" value={note} placeholder="What you think of this review" onSave={saveNote} />
          </>
        ) : (
          <form className="flex flex-col gap-2" onSubmit={e => { e.preventDefault(); if (draft.trim()) void saveNote(draft.trim()).then(ok => { if (ok) setDraft('') }) }}>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} placeholder="What you think of this review" aria-label="Your note on this review" className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
            <Button type="submit" variant="outline" size="default" className="tap-44 self-start" disabled={!draft.trim()}>Save the note</Button>
          </form>
        )}
      </Block>
    </div>
  )
}

function ReviewMove({ m, row, move, i, inWeek }: { m: GrowthTabModel; row: CouncilReviewRow; move: string; i: number; inWeek: boolean }) {
  const week = row.week_start.slice(0, 10)
  const id = `review:${week}:${row.product_slug}:${i + 1}`
  const pseudo: NextMove = m.queue.find(x => x.id === id) ?? {
    id, source: 'review', product: row.product_slug, title: move, why: '', minutes: null,
    primary: { kind: 'today', label: 'Put on today' }, secondary: { kind: 'clip', label: 'Make it a clip' },
    reviewId: row.id, weekStart: week,
  }
  const outcome = m.outcomeOf(id)
  const [busy, setBusy] = useState<string | null>(null)
  const [line, setLine] = useState<string | null>(null)
  const act = async (key: string, fn: () => Promise<Outcome | { kind: 'full' } | { kind: 'failed'; line: string }>) => {
    setBusy(key)
    setLine(null)
    try {
      const r = await fn()
      if (r.kind === 'full') setLine('Today\'s 3 are already full. Tick one off on Home first.')
      else if (r.kind === 'failed') setLine(r.line)
    } finally {
      setBusy(null)
    }
  }
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
      <p className="text-body text-ink break-words">
        <span className="mr-1.5 font-mono tabular-nums text-ink-muted">{i + 1}.</span>{move}
      </p>
      {inWeek && !outcome && <p className="text-micro font-semibold text-accent">This one is in your week.</p>}
      {outcome ? (
        <p role="status" className="text-label font-semibold text-accent">
          {outcome.kind === 'today' ? `On today's list, slot ${outcome.slot}.` : outcome.kind === 'clip' ? `Added to this week's clips, ${outcome.count} of 3.` : outcome.kind === 'skipped' ? 'Skipped for this week.' : 'Done.'}
          <button type="button" className="tap-44 ml-2 text-ink-muted underline underline-offset-2" onClick={() => void m.undo(pseudo)}>Undo</button>
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" className="tap-44" loading={busy === 'today'} onClick={() => void act('today', () => m.putOnToday(pseudo))}>
            <CalendarPlus size={14} aria-hidden /> Put on today
          </Button>
          <Button variant="secondary" size="sm" className="tap-44" loading={busy === 'clip'} onClick={() => void act('clip', () => m.makeClip(pseudo, move, row.product_slug))}>
            <Film size={14} aria-hidden /> Make it a clip
          </Button>
        </div>
      )}
      {line && !outcome && <p role="status" className="text-label text-accent-3 break-words">{line}</p>}
    </li>
  )
}
