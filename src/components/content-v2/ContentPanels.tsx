/**
 * Everything around the calls: where the engine is up to, its health in one
 * line, the desk's numbered list, the progress marks and each series' next
 * piece. All counts come from src/lib/contentModel.ts (pipeline, weekSlots).
 */
import React from 'react'
import { Check, ChevronRight, Clock } from '@/lib/icons'
import { IconTile } from '../shared/IconTile'
import { Eyebrow } from '../shared/Eyebrow'
import type { Pipeline, TodaysCall, WeekSlot } from '../../lib/contentModel'
import type { ContentEngineAttention } from '../../lib/contentEngineSchedule'
import { numberWord, shortDay } from '../../lib/contentCallWords'
import type { ContentCalls, Receipt } from '../../hooks/useContentCalls'
import { DueLine, KIND_LABEL, Mono, SeriesName, callTitle, dueOf } from './CallCard'
import { cn } from '@/lib/utils'

// ── Where the engine is up to ────────────────────────────────────────────

interface StripStage {
  id: string
  label: string
  count: number
  note: string
  /** 'yours' marks a stage that holds a call for him. */
  tone: 'quiet' | 'yours'
}

export function engineStages(pipe: Pipeline, foundThisWeek: number, scheduled: number): StripStage[] {
  const b = pipe.byStage
  return [
    { id: 'found', label: 'Found', count: foundThisWeek, note: b.found ? `New this week. ${b.found} still waiting to be judged.` : 'New ideas this week.', tone: 'quiet' },
    { id: 'judged', label: 'Judged ready', count: b.judged_ready, note: `${b.needs_work} being improved by the engine, ${b.weak} too weak.`, tone: 'quiet' },
    { id: 'writing', label: 'Being written', count: b.writing, note: b.writing ? 'First drafts in progress.' : 'Nothing being drafted.', tone: 'quiet' },
    { id: 'checking', label: 'Fact check', count: b.fact_check, note: b.fact_check ? 'Drafts whose facts have not passed yet.' : 'Nothing waiting on a check.', tone: b.fact_check ? 'yours' : 'quiet' },
    { id: 'yours', label: 'Your call', count: b.your_call, note: b.your_call ? 'Facts passed, waiting for you.' : 'Nothing waiting for you.', tone: b.your_call ? 'yours' : 'quiet' },
    { id: 'out', label: 'Going out', count: b.ready_to_go, note: `${scheduled} scheduled, ${b.out} published so far.`, tone: 'quiet' },
  ]
}

export function EngineFlow({ stages, variant }: { stages: StripStage[]; variant: 'strip' | 'list' }) {
  if (variant === 'strip') {
    return (
      <ol aria-label="Where the engine is up to" data-testid="content-engine-flow" className="surface grid grid-cols-6 rounded-2xl">
        {stages.map((st, k) => (
          <li key={st.id} data-stage={st.id} className={cn('relative flex min-w-0 flex-col gap-1 px-5 py-4', k > 0 && 'border-l border-white/[0.06]')}>
            {k > 0 && (
              <span aria-hidden className="absolute -left-[9px] top-1/2 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full border border-white/[0.08] bg-base text-ink-faint">
                <ChevronRight size={12} />
              </span>
            )}
            <span className="text-label text-ink-muted">{st.label}</span>
            <Mono className={cn('text-title font-semibold', st.tone === 'yours' ? 'text-accent' : 'text-ink')}>{st.count}</Mono>
            <span className="text-label text-ink-faint">{st.note}</span>
          </li>
        ))}
      </ol>
    )
  }
  return (
    <ol aria-label="Where the engine is up to" data-testid="content-engine-flow" className="flex flex-col">
      {stages.map((st, k) => (
        <li key={st.id} data-stage={st.id} className="relative grid grid-cols-[3rem_1fr] gap-x-3 pb-4 last:pb-0">
          {k < stages.length - 1 && <span aria-hidden className="absolute bottom-1 left-[1.45rem] top-8 w-px bg-white/[0.08]" />}
          <Mono className={cn('flex h-8 items-center justify-center rounded-full border text-label font-semibold', st.tone === 'yours' ? 'border-violet-400/40 text-accent' : 'border-white/[0.10] text-ink')}>
            {st.count}
          </Mono>
          <span className="min-w-0 pt-1">
            <span className="block text-ui font-semibold text-ink">{st.label}</span>
            <span className="block text-ui text-ink-muted">{st.note}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

// ── The engine, in one line ──────────────────────────────────────────────

export function EngineLine({ failing, onOpen, className }: {
  failing: ContentEngineAttention[]
  onOpen: () => void
  className?: string
}) {
  if (!failing.length) {
    return (
      <p data-testid="content-engine-line" className={cn('flex items-start gap-2.5 text-ui text-ink-muted', className)}>
        <span aria-hidden className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-accent" />
        <span>The engine is running normally.</span>
      </p>
    )
  }
  const n = failing.length
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="content-engine-line"
      className={cn('tap-44 group flex w-full items-start gap-2.5 text-left text-ui text-ink-muted hover:text-ink', className)}
    >
      <span aria-hidden className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-accent-3" />
      <span className="min-w-0">
        {n === 1 ? 'One engine job is failing.' : `${numberWord(n)} engine jobs are failing.`}{' '}
        <span className="font-semibold text-ink underline decoration-white/25 underline-offset-4 group-hover:decoration-white/60">See which</span>
      </span>
    </button>
  )
}

// ── Each series' next piece ──────────────────────────────────────────────

const STAGE_WORDS: Record<string, string> = {
  writing: 'Being written',
  fact_check: 'Written, facts not passed yet',
  your_call: 'Waiting for your approval',
  ready_to_go: 'Approved',
  out: 'Out',
}

export function SeriesNext({ slots, callNumber, onCall, columns = false }: {
  slots: WeekSlot[]
  /** The number a call carries in today's list, so a slot can point at it. */
  callNumber: (series: string, date: string) => number | null
  onCall: (series: string, date: string) => void
  columns?: boolean
}) {
  if (!slots.length) return null
  return (
    <section aria-labelledby="series-next-h" data-testid="content-week" className="flex flex-col gap-3">
      <h2 id="series-next-h" className="leading-none"><Eyebrow>Each series' next piece</Eyebrow></h2>
      <ul className={cn(columns ? 'grid grid-cols-3 items-start gap-3' : 'flex flex-col gap-3')}>
        {slots.map(slot => {
          const n = callNumber(slot.series, slot.date)
          const status = slot.picked
            ? (slot.picked.stage && STAGE_WORDS[slot.picked.stage]) || 'In the works'
            : slot.candidates.length ? 'Needs a pick' : 'Nothing ready to pick yet'
          const inner = (
            <>
              <span className="flex items-baseline justify-between gap-3">
                <SeriesName slug={slot.series} className="text-ui" />
                <Mono className="text-label text-ink-muted">{shortDay(slot.date)}</Mono>
              </span>
              {slot.picked && <span className="mt-1.5 block text-ui text-ink">{slot.picked.title}</span>}
              <span className={cn('mt-1 block text-label', slot.picked ? 'text-ink-faint' : 'font-semibold text-accent-3')}>
                {status}.{n != null && <span className="font-semibold text-ink-muted"> See call {n}.</span>}
                {slot.queued > 0 && <span> {slot.queued} more lined up after it.</span>}
              </span>
            </>
          )
          return (
            <li key={slot.series} className="surface rounded-2xl" data-testid={`content-week-${slot.series}`}>
              {n != null ? (
                <button
                  type="button"
                  onClick={() => onCall(slot.series, slot.date)}
                  className="block min-h-[44px] w-full rounded-2xl px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                >
                  {inner}
                </button>
              ) : (
                <div className="px-4 py-3.5">{inner}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ── The desk's list of calls ─────────────────────────────────────────────

export function CallRow({ call, n, receipt, selected, onSelect, s }: {
  call: TodaysCall; n: number; receipt?: Receipt; selected: boolean; onSelect: () => void; s: ContentCalls
}) {
  const due = dueOf(call, s)
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        data-testid={`content-call-row-${n}`}
        className={cn(
          'relative flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50',
          selected ? 'surface border-violet-400/40' : 'border-transparent hover:border-white/[0.08] hover:bg-white/[0.02]',
        )}
      >
        {selected && <span aria-hidden className="absolute -left-px bottom-3 top-3 w-[3px] rounded-full bg-accent" />}
        <IconTile
          glyph={receipt ? undefined : n}
          icon={receipt ? (receipt.kind === 'done' ? Check : Clock) : undefined}
          size="sm"
          tone={receipt?.kind === 'done' ? 'accent' : 'neutral'}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-label text-ink-faint">{KIND_LABEL[call.kind]}</span>
          <span className={cn('mt-0.5 block text-ui', receipt ? 'text-ink-faint' : 'font-medium text-ink')}>{callTitle(call, s)}</span>
          <span className="mt-1 block">
            {receipt
              ? <span className="text-label text-ink-muted">{receipt.line}</span>
              : <DueLine label={due.label} soon={due.soon} />}
          </span>
        </span>
      </button>
    </li>
  )
}

// ── Progress ─────────────────────────────────────────────────────────────

export function Progress({ total, settled, lead }: { total: number; settled: number; lead?: React.ReactNode }) {
  if (!total) return null
  return (
    <div className="flex items-center gap-3" data-testid="content-progress">
      {lead}
      <div className="flex flex-1 gap-1" aria-hidden>
        {Array.from({ length: total }, (_, k) => (
          <span key={k} className={cn('h-1 flex-1 rounded-full', k < settled ? 'bg-accent' : 'bg-white/[0.10]')} />
        ))}
      </div>
      <Mono className="text-label text-ink-muted">{settled} of {total} settled</Mono>
    </div>
  )
}

/** The one payoff line above the list. */
export function claimLine(open: number, decided: number, firstDay: string | null, today: string, whenWords: (d: string, t: string) => string): string {
  if (open === 0) return decided ? `All clear. You made ${numberWord(decided).toLowerCase()} call${decided === 1 ? '' : 's'} today.` : 'All clear.'
  const head = `${numberWord(open)} call${open === 1 ? '' : 's'} ${decided ? 'left' : 'today'}.`
  if (firstDay && firstDay >= today) {
    const words = whenWords(firstDay, today)
    if (words === 'today' || words === 'tomorrow') return `${head} The first one goes out ${words}.`
  }
  return head
}
