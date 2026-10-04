/**
 * One of today's calls. The same component renders a phone card
 * (layout="card") and the desk's reading pane (layout="reader"): one recipe,
 * two densities, so the phone and the desk can never disagree about what a
 * call says.
 *
 * Every call has exactly one primary action and one "Not now". When he acts,
 * the verdict replaces the call where it stood: nothing slides away and
 * nothing advances by itself. Where the data layer cannot do what a call asks
 * (marking a piece published), the card says so and offers what he can do.
 */
import React, { useEffect, useRef } from 'react'
import { AlertTriangle, ArrowRight, ArrowUpRight, Check, Clock, ShieldCheck, Undo2 } from '@/lib/icons'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { IconTile } from '../shared/IconTile'
import { Eyebrow } from '../shared/Eyebrow'
import { OptionChips } from '../goals/GoalPickers'
import { VideoBrandLockup } from '../video-studio/VideoBrandLockup'
import { VIDEO_GATE_LABEL, videoPreviewStateLabel, videoStudioListItemIsWellFormed } from '../../lib/videoStudio'
import { formatLabel } from '../../lib/formats'
import { judgeAsk, ladderVerdict, readyStanding } from '../../lib/ladder'
import { FACT_CHECK_CAP_USD, displayThesis, howSureOf, type TodaysCall } from '../../lib/contentModel'
import {
  argumentOf, clearsOutMonday, daysBetween, longDay, numberWord, predictionText, shortDay, sourceDomains, whenWords,
} from '../../lib/contentCallWords'
import type { ContentCalls, PickCandidate, Receipt } from '../../hooks/useContentCalls'
import { cn } from '@/lib/utils'

export type CallLayout = 'card' | 'reader'

export const KIND_LABEL: Record<TodaysCall['kind'], string> = {
  approve: 'Approve',
  board: 'On the work board',
  go_out: 'Put it out',
  allow_fact_check: 'Allow a fact check',
  set_how_sure: 'How sure are we',
  pick_for_series: 'Pick the next piece',
  studio_review: 'Studio review',
  prediction_ruling: 'Did it come true',
  keep_for_good: 'Keep for good',
  shift_proposal: 'A new pattern',
  shift_fading: 'A pattern gone quiet',
  investigation: 'Investigation',
  expiry_notice: "Monday's clear-out",
}

const HOW_SURE = [50, 60, 70, 80, 90].map(n => ({ value: String(n), label: `${n}%` }))

/** The piece a call is about, as its own title, or the call's sentence. */
export function callTitle(call: TodaysCall, s: ContentCalls): React.ReactNode {
  if (call.kind === 'pick_for_series' && call.series && call.date) {
    return <>What should <SeriesName slug={call.series} /> run on {longDay(call.date)}?</>
  }
  if (call.kind === 'studio_review') {
    const r = call.reviewId ? s.reviewById.get(call.reviewId) : undefined
    if (r && !videoStudioListItemIsWellFormed(r)) return 'Video review needs repair'
  }
  const idea = call.ideaId ? s.ideaById.get(call.ideaId) : undefined
  if (idea && ['approve', 'allow_fact_check', 'set_how_sure', 'go_out'].includes(call.kind)) {
    return (idea.idea || call.title).trim()
  }
  return call.title
}

/** When it has to be settled by, as a short line, and whether that is soon. */
export function dueOf(call: TodaysCall, s: ContentCalls): { label: string; soon: boolean } {
  if (call.cadence === 'weekly') return { label: 'This week', soon: false }
  if (call.kind === 'pick_for_series' && call.date) {
    const n = daysBetween(s.today, call.date)
    return { label: n <= 10 ? 'Pick this week, so it can be written in time' : 'Pick when you can', soon: n <= 7 }
  }
  const day = call.date ?? s.slotDayOf(call.ideaId) ?? null
  if (day) {
    const n = daysBetween(s.today, day)
    if (n < 0) return { label: `Was due ${longDay(day)}`, soon: true }
    if (call.kind === 'approve' && n > 1) {
      const by = new Date(`${day}T00:00:00Z`)
      by.setUTCDate(by.getUTCDate() - 1)
      return { label: `Approve by ${by.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}`, soon: n <= 2 }
    }
    return { label: `Goes out ${whenWords(day, s.today)}`, soon: n <= 1 }
  }
  if (call.kind === 'allow_fact_check') return { label: `Up to $${FACT_CHECK_CAP_USD}`, soon: false }
  if (call.kind === 'board') return { label: 'Waiting on you', soon: false }
  if (call.kind === 'studio_review') return { label: 'Waiting for your review', soon: false }
  return { label: 'Today', soon: false }
}

export function SeriesName({ slug, className }: { slug: string; className?: string }) {
  return <span className={cn('font-display font-semibold text-ink', className)}>{formatLabel(slug)}</span>
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('whitespace-nowrap font-mono tabular-nums', className)}>{children}</span>
}

/** The due line. Amber when it is tomorrow or sooner; never red, nothing failed. */
export function DueLine({ label, soon, className }: { label: string; soon: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-label', soon ? 'text-accent-3' : 'text-ink-faint', className)}>
      <Clock size={12} aria-hidden />
      <span>{label}</span>
    </span>
  )
}

function Block({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <h4 className="leading-none"><Eyebrow>{label}</Eyebrow></h4>
      {children}
    </section>
  )
}

function OpenDraft({ ideaId, label = 'Read the whole draft' }: { ideaId: string; label?: string }) {
  return (
    <a href={`#/content?idea=${ideaId}`} className="inline-flex min-h-[44px] w-fit items-center gap-1.5 text-ui font-semibold text-ink-muted hover:text-ink">
      {label} <ArrowUpRight size={14} aria-hidden />
    </a>
  )
}

/**
 * Bring an element's top back into the tab's scroller when it sits above it.
 * Only ever called as the direct result of his own press: choosing a call on
 * the desk, or a verdict replacing a tall card he pressed at the bottom of.
 * Without it the verdict lands above the fold and the next card slides under
 * his thumb, which reads as the list moving on by itself.
 */
export function revealTop(el: Element | null) {
  if (!el) return
  const scroller = el.closest('[data-testid="content-room-scroll"]')
  if (!scroller) return
  const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  if (top < 0) scroller.scrollTop += top - 12
}

export function CallCard({ call, n, s, layout, onNext, cardRef }: {
  call: TodaysCall
  n: number
  s: ContentCalls
  layout: CallLayout
  /** Desk: select the next open call. Offered in the verdict, never automatic. */
  onNext?: () => void
  cardRef?: React.Ref<HTMLElement>
}) {
  const receipt = s.receipts[call.key]
  const reader = layout === 'reader'
  const self = useRef<HTMLElement | null>(null)
  const setRef = (el: HTMLElement | null) => {
    self.current = el
    if (typeof cardRef === 'function') cardRef(el)
    else if (cardRef) (cardRef as React.MutableRefObject<HTMLElement | null>).current = el
  }
  const seen = useRef(receipt)
  useEffect(() => {
    if (receipt && receipt !== seen.current) revealTop(self.current)
    seen.current = receipt
  }, [receipt])

  if (receipt) {
    return (
      <article
        ref={setRef}
        data-testid={`content-call-${n}`}
        data-call={call.key}
        data-state={receipt.kind}
        className={cn('surface rounded-2xl', reader ? 'p-7' : 'p-4')}
      >
        <ReceiptView call={call} n={n} receipt={receipt} reader={reader} s={s} onNext={onNext} />
      </article>
    )
  }

  const due = dueOf(call, s)
  return (
    <article
      ref={setRef}
      data-testid={`content-call-${n}`}
      data-call={call.key}
      data-state="open"
      aria-label={`Call ${n}: ${KIND_LABEL[call.kind]}`}
      className={cn('surface flex flex-col rounded-2xl', reader ? 'gap-7 p-7' : 'gap-4 p-4')}
    >
      <header className={cn('flex flex-col', reader ? 'gap-3' : 'gap-2.5')}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <IconTile glyph={n} size="sm" tone="neutral" />
          <Eyebrow>{KIND_LABEL[call.kind]}</Eyebrow>
          {reader && <DueLine label={due.label} soon={due.soon} className="ml-auto" />}
        </div>
        <h3 className={cn('font-display font-semibold tracking-tight text-ink', reader ? 'text-heading' : 'text-title')}>
          {callTitle(call, s)}
        </h3>
        <Subline call={call} s={s} />
        {!reader && <DueLine label={due.label} soon={due.soon} />}
      </header>

      <Body call={call} s={s} reader={reader} />
      <Actions call={call} s={s} reader={reader} />
    </article>
  )
}

function Subline({ call, s }: { call: TodaysCall; s: ContentCalls }) {
  const day = call.date ?? s.slotDayOf(call.ideaId)
  if (call.kind === 'pick_for_series') return null
  if (call.ideaId && call.series && ['approve', 'allow_fact_check', 'set_how_sure', 'go_out'].includes(call.kind)) {
    return (
      <p className="text-ui text-ink-muted">
        A <SeriesName slug={call.series} /> piece{day ? <>, out on <Mono className="text-label text-ink-muted">{longDay(day)}</Mono></> : null}.
      </p>
    )
  }
  return null
}

// ── Bodies ───────────────────────────────────────────────────────────────

function Body({ call, s, reader }: { call: TodaysCall; s: ContentCalls; reader: boolean }) {
  const idea = call.ideaId ? s.ideaById.get(call.ideaId) : undefined
  const lede = cn('text-ink', reader ? 'max-w-[64ch] text-lede leading-relaxed' : 'text-ui leading-relaxed')
  const why = <p className="text-ui text-ink-muted">{call.why}</p>

  switch (call.kind) {
    case 'approve':
    case 'set_how_sure': {
      const thesis = idea ? displayThesis(idea) : null
      const prediction = predictionText(idea?.body)
      return (
        <div className={cn('flex flex-col', reader ? 'gap-7' : 'gap-5')}>
          {why}
          {thesis && (
            <Block label="The argument">
              <p className={lede}>{thesis}</p>
              {call.ideaId && <OpenDraft ideaId={call.ideaId} />}
            </Block>
          )}
          {!thesis && call.ideaId && <OpenDraft ideaId={call.ideaId} />}
          {prediction && (
            <Block label="Our prediction">
              <p className={cn('text-ink', reader ? 'max-w-[64ch] text-lede' : 'text-ui')}>{prediction}</p>
            </Block>
          )}
          {call.kind === 'approve' && (
            <p className="flex gap-2.5 text-ui text-ink-muted">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <span>{call.checkedBy === 'engine'
                ? 'The engine checked the facts on these exact words, and they passed.'
                : 'The stored fact check passed. The engine checks the words again when you approve.'}</span>
            </p>
          )}
        </div>
      )
    }
    case 'allow_fact_check':
    case 'go_out': {
      const thesis = idea ? displayThesis(idea) : null
      return (
        <div className={cn('flex flex-col', reader ? 'gap-6' : 'gap-4')}>
          {why}
          {thesis && <Block label="The argument"><p className={lede}>{thesis}</p></Block>}
          {call.ideaId && <OpenDraft ideaId={call.ideaId} label="Open the draft" />}
        </div>
      )
    }
    case 'pick_for_series':
      return <PickBody call={call} s={s} reader={reader} />
    case 'studio_review':
      return <StudioBody call={call} s={s} />
    case 'board':
      return (
        <div className="flex flex-col gap-3">
          {why}
          {idea && <OpenDraft ideaId={idea.id} label="Open the piece" />}
        </div>
      )
    case 'expiry_notice': {
      const going = s.ideas.filter(i => !i.buried_at && !i.library_at && ladderVerdict(i)?.band === 'ready' && clearsOutMonday(i, s.today))
      return (
        <div className="flex flex-col gap-3">
          {why}
          {going.length > 0 && (
            <Block label={`Judged ready, and going (${going.length})`}>
              <ul className="flex flex-col divide-y divide-white/[0.06]">
                {going.slice(0, 8).map(i => (
                  <li key={i.id} className="py-2">
                    <a href={`#/content?idea=${i.id}`} className="block min-h-[44px] py-1 text-ui text-ink hover:text-accent">{(i.idea || '').trim()}</a>
                  </li>
                ))}
              </ul>
              {going.length > 8 && <p className="text-label text-ink-faint">And {going.length - 8} more. Browse all pieces to see them.</p>}
            </Block>
          )}
        </div>
      )
    }
    default:
      return <WeeklyBody call={call} s={s} />
  }
}

function WeeklyBody({ call, s }: { call: TodaysCall; s: ContentCalls }) {
  const d = call.decisionId ? s.decisionById.get(call.decisionId) : undefined
  const p = (d?.payload || {}) as Record<string, any>
  const facts =
    call.kind === 'shift_proposal' && (p.stories != null || p.sources != null)
      ? `${p.stories ?? 'Several'} stories over ${p.day_span ?? 'several'} days, from ${p.sources ?? 'several'} sources.`
    : call.kind === 'investigation' && p.citable_evidence != null
      ? `${p.citable_evidence} pieces of evidence you can cite, from ${p.distinct_domains ?? 0} sites.`
    : null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-ui text-ink-muted">{call.why}</p>
      {typeof p.summary === 'string' && p.summary.trim() && <p className="text-ui text-ink">{p.summary.trim()}</p>}
      {facts && <p className="text-ui text-ink-muted">{facts}</p>}
      {call.kind === 'investigation' && <p className="text-label text-ink-faint">The evidence itself is not readable from this tab yet.</p>}
    </div>
  )
}

function StudioBody({ call, s }: { call: TodaysCall; s: ContentCalls }) {
  const r = call.reviewId ? s.reviewById.get(call.reviewId) : undefined
  if (!r) return <p className="text-ui text-ink-muted">{call.why}</p>
  const malformed = !videoStudioListItemIsWellFormed(r)
  const sync = !malformed && r.status !== 'pending'
  return (
    <div className="flex flex-col gap-3">
      {!malformed && <VideoBrandLockup series={r.series} placement="card" />}
      <p className="text-label font-semibold text-ink-muted">
        {malformed ? 'Review needs repair' : sync ? 'Local sync attention' : VIDEO_GATE_LABEL[r.gate]}
      </p>
      <p className="text-ui leading-relaxed text-ink">
        {malformed
          ? 'This review is incomplete. Open it to see what must be repaired before any decision.'
          : sync
            ? `Your ${r.status === 'approved' ? 'accepted candidate' : 'keep-current decision'} is saved, but its local production-ledger sync needs attention. Open it to see the exact command state.`
            : r.route_state === 'requires_editorial_route'
              ? 'The engine stopped before inventing an answer. This needs your editorial judgement.'
              : r.safe_summary}
      </p>
      <p className="text-label text-ink-faint">
        {malformed
          ? 'Decision blocked'
          : sync
            ? 'Decided. The studio computer has not confirmed it yet.'
            : `${videoPreviewStateLabel(r.preview_state)}. Open it to compare, direct a change, or decide.`}
      </p>
    </div>
  )
}

// ── Pick the next piece: the top three, read side by side ────────────────

function scoreLine(c: PickCandidate): string {
  const v = ladderVerdict(c.idea)
  const standing = c.verdicts.length ? readyStanding(c.verdicts) : null
  const marks = c.verdicts.filter(j => !j.adversarial && !j.deterministic && typeof j.score === 'number').length
  return `Scored ${v?.score ?? 'no score'} of 10.${standing && marks ? ` ${standing.praised} of ${marks} judges gave it 8 or more.` : ''}`
}

function strongestOf(c: PickCandidate): string | null {
  const top = c.verdicts
    .filter(j => !j.adversarial && !j.deterministic && typeof j.score === 'number' && j.verdict)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.judge.localeCompare(b.judge))[0]
  return top?.verdict ?? null
}

function PickBody({ call, s, reader }: { call: TodaysCall; s: ContentCalls; reader: boolean }) {
  const list = s.candidatesFor(call)
  const chosenId = s.chosen[call.key] ?? list[0]?.idea.id
  const series = call.series!
  const clearing = list.filter(c => clearsOutMonday(c.idea, s.today)).length
  const columns = reader && list.length > 1
  return (
    <div className={cn('flex flex-col', reader ? 'gap-6' : 'gap-4')}>
      <p className="text-ui text-ink-muted">
        {call.why} Choose one, then press the button to have it written.
      </p>
      {clearing > 0 && (
        <p className="text-ui text-accent-3">
          {clearing === 1 ? 'One of these clears out' : `${numberWord(clearing)} of these clear out`} on Monday if nobody picks {clearing === 1 ? 'it' : 'them'}.
        </p>
      )}
      <div
        role="radiogroup"
        aria-label={`The best ${list.length}`}
        data-testid="pick-candidates"
        className={cn(columns ? `grid gap-3 ${list.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}` : 'flex flex-col gap-3')}
      >
        {list.map((c, k) => {
          const on = c.idea.id === chosenId
          const arg = argumentOf(c.idea)
          const strongest = strongestOf(c)
          const weakest = ladderVerdict(c.idea)?.weakest ?? null
          const domains = sourceDomains(c.idea)
          return (
            <article
              key={c.idea.id}
              data-testid={`pick-candidate-${k + 1}`}
              data-selected={on ? 'true' : 'false'}
              className={cn(
                'flex min-w-0 flex-col gap-3 rounded-xl border p-4 transition-colors',
                on ? 'border-violet-400/50 bg-violet-500/[0.08]' : 'border-white/[0.08] bg-white/[0.02]',
              )}
            >
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => s.choose(call.key, c.idea.id)}
                className="tap-44 flex items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
              >
                <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', on ? 'aurora-btn border-transparent' : 'border-white/25')}>
                  {on && <Check size={12} />}
                </span>
                <span className={cn('min-w-0 flex-1 text-ui leading-snug text-ink', on && 'font-semibold')}>{(c.idea.idea || '').trim()}</span>
              </button>
              {clearsOutMonday(c.idea, s.today) && <Badge variant="warning" className="w-fit">Clears out Monday</Badge>}
              {arg
                ? <p className="text-ui leading-relaxed text-ink-muted">{arg}</p>
                : <p className="text-label text-ink-faint">Its summary was cut off where it came from, so it is not shown. Open it to read the whole piece.</p>}
              <div className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-3">
                <p className="text-label font-semibold text-ink-faint">Why the judges rated it</p>
                <p className="text-label text-ink-muted">{scoreLine(c)}</p>
                {strongest && <p className="text-label text-ink">Strongest: {strongest}</p>}
                <p className="text-label text-ink-muted">Weak spot: {judgeAsk(weakest)}</p>
              </div>
              {domains.length > 0 && (
                <p className="text-label text-ink-faint">
                  Sources: <span className="font-mono">{domains.join(', ')}</span>
                </p>
              )}
              <a href={`#/content?idea=${c.idea.id}`} className="mt-auto inline-flex min-h-[44px] w-fit items-center gap-1.5 text-label font-semibold text-ink-muted hover:text-ink">
                Read it all <ArrowUpRight size={12} aria-hidden />
              </a>
            </article>
          )
        })}
      </div>
      {!list.length && <p className="text-ui text-ink-muted">No <SeriesName slug={series} /> piece is ready to pick yet.</p>}
    </div>
  )
}

// ── Actions ──────────────────────────────────────────────────────────────

function primaryOf(call: TodaysCall, s: ContentCalls): { label: string; disabled: boolean; hint?: string } {
  const idea = call.ideaId ? s.ideaById.get(call.ideaId) : undefined
  switch (call.primary.action) {
    case 'approve': {
      const sure = howSureOf(idea?.body)
      const pct = s.howSure[call.key] ?? (sure.state === 'set' ? sure.percent : null)
      const lock = call.boardItemId ? ' and lock' : ''
      return { label: pct != null ? `Approve at ${pct}%${lock}` : `Approve${lock}`, disabled: false }
    }
    case 'set_how_sure': {
      const pct = s.howSure[call.key]
      return pct != null ? { label: `Set it at ${pct}%`, disabled: false } : { label: 'Set how sure', disabled: true, hint: 'Pick a number first.' }
    }
    case 'allow_fact_check':
      return { label: `Allow the paid check, up to $${FACT_CHECK_CAP_USD}`, disabled: false }
    case 'schedule':
      return { label: call.date ? `Schedule for ${shortDay(call.date)}` : 'Pick its day', disabled: !call.date }
    case 'mark_published':
      return { label: 'Open the draft', disabled: !call.ideaId, hint: 'This tab cannot mark a piece published yet. Open the draft to do it there.' }
    case 'pick_for_series':
      return { label: call.date ? `Write this one for ${longDay(call.date)}` : 'Write this one', disabled: s.candidatesFor(call).length === 0 }
    case 'open_studio_review': {
      const r = call.reviewId ? s.reviewById.get(call.reviewId) : undefined
      const malformed = r ? !videoStudioListItemIsWellFormed(r) : false
      return malformed ? { label: 'Review blocked', disabled: true } : { label: call.primary.label, disabled: !call.reviewId }
    }
    case 'board_reply':
      return { label: 'Answer it on the work board', disabled: false }
    case 'open_investigation':
      return { label: 'Mark it read', disabled: false }
    case 'open_expiring':
      return { label: 'Got it', disabled: false }
    default:
      return { label: call.primary.label, disabled: false }
  }
}

function Actions({ call, s, reader }: { call: TodaysCall; s: ContentCalls; reader: boolean }) {
  const p = primaryOf(call, s)
  const busy = s.busy === call.key
  const idea = call.ideaId ? s.ideaById.get(call.ideaId) : undefined
  const asksHowSure = call.kind === 'approve' || call.kind === 'set_how_sure'
  const sure = howSureOf(idea?.body)
  const current = sure.state === 'set' ? sure.percent : null
  const value = s.howSure[call.key] ?? current
  return (
    <div
      data-testid="call-actions"
      className={cn(
        reader
          ? 'sticky bottom-0 z-10 -mx-7 -mb-7 flex flex-wrap items-center gap-3 rounded-b-2xl border-t border-white/[0.07] bg-[rgb(var(--card-bg))] px-7 py-5'
          : 'flex flex-col gap-1',
      )}
    >
      {asksHowSure && (
        <div className={cn('flex flex-col gap-2', reader ? 'basis-full pb-1' : 'mb-2')} data-testid="how-sure">
          <p className="text-ui text-ink-muted">
            How sure are you that it comes true?{' '}
            <span className="text-ink">{call.kind === 'approve' ? 'Change it here if you need to.' : 'Pick a number.'}</span> Only you set it.
          </p>
          <OptionChips
            options={HOW_SURE}
            value={value != null ? String(value) : ''}
            onChange={v => s.chooseHowSure(call.key, Number(v))}
            size="touch"
            even
          />
        </div>
      )}
      {busy && call.kind === 'allow_fact_check' && (
        <p className={cn('text-ui text-ink-muted', reader ? 'basis-full' : 'mb-1')} role="status">Checking every claim. It usually takes a minute or two.</p>
      )}
      {p.hint && <p className={cn('text-ui text-ink-muted', reader ? 'basis-full' : 'mb-1')}>{p.hint}</p>}
      <Button
        variant="primary"
        size="touch"
        loading={busy}
        disabled={p.disabled}
        onClick={() => { void s.act(call) }}
        className={reader ? 'px-6' : 'w-full'}
        data-testid="call-primary"
      >
        {p.label}
      </Button>
      <Button
        variant="ghost"
        size="touch"
        onClick={() => s.later(call)}
        disabled={busy}
        className={reader ? '' : 'w-full'}
        data-testid="call-later"
      >
        Not now
      </Button>
    </div>
  )
}

// ── The verdict, where the call stood ────────────────────────────────────

function ReceiptView({ call, n, receipt, reader, s, onNext }: {
  call: TodaysCall; n: number; receipt: Receipt; reader: boolean; s: ContentCalls; onNext?: () => void
}) {
  const icon = receipt.kind === 'done' ? Check : receipt.kind === 'refused' ? AlertTriangle : Clock
  const canUndo = Boolean(receipt.undo) || receipt.kind === 'refused'
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <IconTile icon={icon} size={reader ? 'md' : 'sm'} tone={receipt.kind === 'done' ? 'accent' : 'neutral'} />
        <div className="min-w-0 flex-1">
          <p className="text-label text-ink-faint"><span className="sr-only">Call {n}, </span>{callTitle(call, s)}</p>
          <p className={cn('mt-0.5 font-semibold text-ink', reader ? 'text-title' : 'text-ui')} data-testid="call-verdict">{receipt.line}</p>
          {receipt.next && <p className="mt-1 text-ui text-ink-muted">{receipt.next}</p>}
        </div>
      </div>
      {(canUndo || onNext) && (
        <div className={cn('flex flex-wrap items-center gap-2', reader ? 'pl-12' : 'pl-10')}>
          {onNext && (
            <Button variant="secondary" onClick={onNext} iconRight={<ArrowRight size={14} aria-hidden />} data-testid="call-next">
              Next call
            </Button>
          )}
          {canUndo && (
            <Button
              variant="ghost"
              loading={s.busy === call.key}
              onClick={() => { void s.undo(call.key) }}
              iconLeft={receipt.kind === 'refused' ? undefined : <Undo2 size={14} aria-hidden />}
              data-testid="call-undo"
            >
              {receipt.kind === 'refused' ? 'Back to the call' : 'Undo'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
