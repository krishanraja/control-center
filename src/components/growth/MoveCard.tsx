/**
 * Growth: THE card. One move, one primary action, one secondary, and the
 * verdict lands in the same place the thumb pressed. Nothing advances on its
 * own: "Next move" is a press, and Undo sits beside every verdict.
 *
 * Rendered through the house hero (DoThisNextHero, layout="card"). What each
 * action does comes from the read model (NextMove.primary / secondary):
 * 'answer' one tap to the site check, 'today' the first empty slot of today's
 * 3, 'clip' a clip for this week, 'suggest' three clip ideas, 'open' a link.
 */
import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowRight, ArrowUpRight, CalendarPlus, Clock, Film, HelpCircle, List, Plus, SkipForward, Sparkles,
} from '@/lib/icons'
import { DoThisNextHero } from '../shared/DoThisNextHero'
import { Eyebrow } from '../shared/Eyebrow'
import { DrawnCheck } from '../shared/DrawnCheck'
import { Pending } from '../shared/Pending'
import { FocusedEditor } from '../shared/FocusedEditor'
import { OptionChips } from '../goals/GoalPickers'
import { Button } from '../ui/button'
import { useElapsed } from '../../hooks/useAsyncAction'
import { useWork } from '../../lib/loadingVoice'
import { ventureLabel } from '../../lib/ventureOptions'
import { JOB_OPTIONS } from '../../content/jobs'
import { PRODUCTS, type ProductSlug } from '../../lib/growth'
import { reviewMoves, type MoveAction, type MoveChoice, type NextMove } from '../../lib/growthModel'
import { webProperty, type WebJob } from '../../lib/webProperties'
import { SegBar, type SegState } from './viz'
import { ANSWER_WORDS, KIND, Overlay, ProductTag, minutesLabel, moveKind } from './bits'
import { STAGE_WORD, type GrowthTabModel, type Outcome, type Refusal } from './useGrowthTab'

export type SectionLink = (href: string) => boolean

export function segStates(m: GrowthTabModel): SegState[] {
  return m.queue.map((mv, i) => {
    const o = m.outcomeOf(mv.id)
    if (o) return o.kind === 'skipped' ? 'skipped' : o.kind === 'answered' ? 'answered' : o.kind === 'clip' ? 'clip' : o.kind === 'today' ? 'today' : 'done'
    return i === m.cursor ? 'current' : 'open'
  })
}

/** The question a quick choice asks, in the registry's own words. */
export function moveHeadline(move: NextMove): string {
  if (moveKind(move) === 'choice' && move.property) {
    const canon = webProperty(move.property)?.canon
    if (canon?.status === 'ruling_owed') return canon.question
  }
  return move.title
}

/** One short line that carries a number. Never the evidence itself. */
export function moveFact(m: GrowthTabModel, move: NextMove): string {
  if (move.source === 'site') {
    const view = m.web.data?.properties.find(p => p.prefix === move.property)
    if (moveKind(move) === 'choice' && view) return visitsLine(view.totals)
    return firstSentence(move.why)
  }
  if (move.source === 'review' && move.product) {
    const p = m.signals.products.find(s => s.slug === move.product)
    const name = ventureLabel(move.product) ?? move.product
    if (p && p.aiAnswers.asked > 0) return `AI answers named ${name} ${p.aiAnswers.mentioned} ${p.aiAnswers.mentioned === 1 ? 'time' : 'times'} in ${p.aiAnswers.asked} this month.`
    return `From Sunday's review for ${name}.`
  }
  return move.why
}

export function visitsLine(t: { cur: { sessions: number }; prev: { sessions: number } } | null): string {
  if (!t) return 'Visits are not being counted yet.'
  const c = t.cur.sessions
  const p = t.prev.sessions
  const n = (x: number) => (x === 0 ? 'none' : x === 1 ? '1 visit' : `${x} visits`)
  if (c === 0 && p === 0) return 'No visits this week or the week before.'
  if (c === 0) return `No visits this week, ${n(p)} the week before.`
  return `${c === 1 ? '1 visit' : `${c} visits`} this week, ${n(p)} the week before.`
}

function firstSentence(s: string): string {
  const match = s.match(/^.*?[.!?](\s|$)/)
  return (match ? match[0] : s).trim()
}

function verdictCopy(m: GrowthTabModel, o: Outcome, move: NextMove): { line: string; sub?: string } {
  switch (o.kind) {
    case 'today': return { line: `On today's list, slot ${o.slot}.`, sub: 'It is on Home with the rest of today.' }
    case 'clip': return { line: `Added to this week's clips, ${o.count} of 3.`, sub: o.title }
    case 'answered': {
      const label = move.property ? m.web.data?.properties.find(p => p.prefix === move.property)?.label : null
      return { line: `Saved: ${o.label}.`, sub: label ? `Your answer for ${label}. The site check uses it from now on.` : undefined }
    }
    case 'done': return { line: o.line }
    case 'skipped': return { line: 'Skipped for this week.', sub: 'It stays in the week list if you change your mind.' }
  }
}

export function MoveCard({ m, move, narrow, mobile, onWhy, onFinish, onSection, onSeeWeek }: {
  m: GrowthTabModel
  move: NextMove
  /** Phone column: stacked actions, title one size down. */
  narrow: boolean
  /** Touch device: sheets and FocusedEditor rather than inline fields. */
  mobile: boolean
  onWhy: () => void
  onFinish: () => void
  /** Follows an in-app Growth link (`#/growth?section=...`) without leaving the tab. */
  onSection: SectionLink
  onSeeWeek: () => void
}) {
  const outcome = m.outcomeOf(move.id)
  const index = m.queue.findIndex(x => x.id === move.id)
  const openLeft = m.queue.filter(x => !m.outcomeOf(x.id) && x.id !== move.id).length
  const [busy, setBusy] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const nextRef = useRef<HTMLDivElement>(null)

  // Reset per move; move keyboard focus onto "Next move" once a verdict lands.
  useEffect(() => { setRefusal(null); setBusy(null) }, [move.id])
  const settledKey = outcome ? `${move.id}:${outcome.kind}` : null
  useEffect(() => {
    if (settledKey) nextRef.current?.querySelector<HTMLButtonElement>('[data-testid="growth-move-next"]')?.focus({ preventScroll: true })
  }, [settledKey])

  const run = async (key: string, fn: () => Promise<Outcome | Refusal>) => {
    setBusy(key)
    setRefusal(null)
    try {
      const r = await fn()
      if (r.kind === 'full' || r.kind === 'failed') setRefusal(r)
    } finally {
      setBusy(null)
    }
  }

  const kind = moveKind(move)
  const K = KIND[kind]
  const minutes = minutesLabel(move.minutes)
  const settled = m.queue.length - openLeft - (outcome ? 0 : 1)

  return (
    <DoThisNextHero
      layout="card"
      testId="growth-move-card"
      narrow={narrow}
      descriptor={{ headline: moveHeadline(move), sub: moveFact(m, move), icon: <K.icon size={16} />, tone: 'violet' }}
      progress={<SegBar states={segStates(m)} label={`${settled} of ${m.queue.length} moves settled this week`} />}
      eyebrow={
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Eyebrow tone="accent">{K.label}</Eyebrow>
          <ProductTag slug={move.product} />
        </div>
      }
      meta={
        <span className="flex flex-col items-end gap-0.5 text-right">
          <span className="font-mono text-label tabular-nums text-ink-muted" data-testid="growth-move-position">{index + 1} of {m.queue.length}</span>
          {minutes && <span className="inline-flex items-center gap-1 text-micro text-ink-muted"><Clock size={12} aria-hidden />{minutes}</span>}
        </span>
      }
    >
      {outcome ? (
        <Verdict m={m} move={move} outcome={outcome} narrow={narrow} nextRef={nextRef} last={openLeft === 0} onFinish={onFinish} />
      ) : (
        <>
          <Actions m={m} move={move} narrow={narrow} mobile={mobile} busy={busy} run={run} onSection={onSection} onSeeWeek={onSeeWeek} />
          {refusal && <RefusalLine refusal={refusal} />}
          <div className={`flex items-center gap-2 border-t border-white/[0.08] pt-2 ${narrow ? '-mb-1' : ''}`}>
            <Button variant="ghost" size="default" className="tap-44 -ml-2 px-2 text-label" onClick={onWhy} data-testid="growth-move-why">
              <HelpCircle size={16} aria-hidden /> Why this move?
            </Button>
            {narrow ? <span className="h-4 w-px bg-white/10" aria-hidden /> : <span className="flex-1" />}
            <Button variant="ghost" size="default" className={`tap-44 px-2 text-label ${narrow ? '' : '-mr-2'}`} onClick={() => m.skip(move)} data-testid="growth-move-skip">
              {kind === 'choice' ? 'Not sure yet' : 'Skip this week'} <SkipForward size={14} aria-hidden />
            </Button>
          </div>
        </>
      )}
    </DoThisNextHero>
  )
}

function RefusalLine({ refusal }: { refusal: Refusal }) {
  return (
    <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-label text-amber-100 break-words" data-testid="growth-move-refusal">
      {refusal.kind === 'full' ? 'Today\'s 3 are already full. Tick one off on Home, then put this on.' : refusal.line}
    </p>
  )
}

function Verdict({ m, move, outcome, narrow, nextRef, last, onFinish }: {
  m: GrowthTabModel; move: NextMove; outcome: Outcome; narrow: boolean
  nextRef: React.RefObject<HTMLDivElement>; last: boolean; onFinish: () => void
}) {
  const copy = verdictCopy(m, outcome, move)
  const skipped = outcome.kind === 'skipped'
  const [undoing, setUndoing] = useState(false)
  // An answer is stored by the site check and closes its action there, so it
  // has no undo here. Everything else puts the world back as it was.
  const canUndo = outcome.kind !== 'answered' && outcome.kind !== 'done'
  return (
    <div ref={nextRef} className="flex flex-col gap-4" data-testid="growth-move-verdict">
      <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
        {skipped
          ? <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full border border-white/15 text-ink-muted"><SkipForward size={14} /></span>
          : <span className="flex-shrink-0"><DrawnCheck size={30} stroke="rgb(var(--accent))" /></span>}
        <div className="min-w-0 flex-1">
          <p className="text-ui font-semibold text-ink break-words">{copy.line}</p>
          {copy.sub && <p className="mt-0.5 text-label text-ink-muted break-words">{copy.sub}</p>}
        </div>
        {canUndo && (
          <Button
            variant="ghost" size="sm" className="tap-44 -mr-1 flex-shrink-0" loading={undoing}
            onClick={async () => { setUndoing(true); try { await m.undo(move) } finally { setUndoing(false) } }}
            data-testid="growth-move-undo"
          >
            Undo
          </Button>
        )}
      </div>
      <Button
        variant="primary"
        size="touch"
        className={narrow ? 'w-full' : 'self-start px-6'}
        onClick={last ? onFinish : m.next}
        data-testid="growth-move-next"
      >
        {last ? 'See how the week went' : 'Next move'} <ArrowRight size={16} aria-hidden />
      </Button>
    </div>
  )
}

/** One action button, from the read model's action kind. */
function ActionButton({ action, move, primary, narrow, busy, run, m, onSection }: {
  action: MoveAction; move: NextMove; primary: boolean; narrow: boolean; busy: string | null
  run: (key: string, fn: () => Promise<Outcome | Refusal>) => Promise<void>
  m: GrowthTabModel; onSection: SectionLink
}) {
  const variant = primary ? 'primary' : 'outline'
  const testId = primary ? 'growth-move-primary' : 'growth-move-secondary'
  const width = narrow ? 'w-full whitespace-normal' : 'whitespace-normal'
  if (action.kind === 'today') {
    return (
      <Button variant={variant} size="touch" className={width} loading={busy === 'today'} onClick={() => void run('today', () => m.putOnToday(move))} data-testid={testId}>
        <CalendarPlus size={16} aria-hidden /> {action.label}
      </Button>
    )
  }
  if (action.kind === 'clip') {
    return (
      <Button variant={variant} size="touch" className={width} loading={busy === 'clip'} onClick={() => void run('clip', () => m.makeClip(move, move.title, move.product))} data-testid={testId}>
        <Film size={16} aria-hidden /> {action.label}
      </Button>
    )
  }
  const link = move.link
  if (!link) return null
  const inApp = link.href.startsWith('#')
  return (
    <Button asChild variant={variant} size="touch" className={width}>
      <a
        href={link.href}
        target={inApp ? undefined : '_blank'}
        rel={inApp ? undefined : 'noreferrer'}
        onClick={e => { if (onSection(link.href)) e.preventDefault() }}
        data-testid={testId}
      >
        {action.label} {inApp ? <ArrowRight size={16} aria-hidden /> : <ArrowUpRight size={16} aria-hidden />}
      </a>
    </Button>
  )
}

function Actions({ m, move, narrow, mobile, busy, run, onSection, onSeeWeek }: {
  m: GrowthTabModel; move: NextMove; narrow: boolean; mobile: boolean; busy: string | null
  run: (key: string, fn: () => Promise<Outcome | Refusal>) => Promise<void>
  onSection: SectionLink; onSeeWeek: () => void
}) {
  const row = narrow ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-2.5'

  if (move.choices?.length) return <ChoiceActions m={m} move={move} narrow={narrow} busy={busy} run={run} />
  if (move.primary.kind === 'suggest') return <ClipActions m={m} move={move} narrow={narrow} mobile={mobile} run={run} />

  // A clip already picked: move it on a step, right here.
  const card = m.cardOf(move)
  if (card) {
    return (
      <div className={row}>
        {card.stage !== 'posted' && (
          <Button variant="primary" size="touch" className={narrow ? 'w-full whitespace-normal' : 'whitespace-normal'} loading={busy === 'advance'} onClick={() => void run('advance', () => m.advanceClip(move))} data-testid="growth-move-primary">
            <Film size={16} aria-hidden /> Move it on: {STAGE_WORD[NEXT_STAGE[card.stage]]}
          </Button>
        )}
        <Button variant="outline" size="touch" className={narrow ? 'w-full' : ''} onClick={onSeeWeek} data-testid="growth-move-secondary">
          See this week's clips <ArrowRight size={16} aria-hidden />
        </Button>
      </div>
    )
  }

  return (
    <div className={row}>
      <ActionButton action={move.primary} move={move} primary narrow={narrow} busy={busy} run={run} m={m} onSection={onSection} />
      {move.secondary && <ActionButton action={move.secondary} move={move} primary={false} narrow={narrow} busy={busy} run={run} m={m} onSection={onSection} />}
    </div>
  )
}

const NEXT_STAGE = { brief: 'script', script: 'producing', producing: 'produced', produced: 'posted', posted: 'posted', dropped: 'brief' } as const

/** A site's open ruling: one tap saves it. An answer that must name a job asks for it next. */
function ChoiceActions({ m, move, narrow, busy, run }: {
  m: GrowthTabModel; move: NextMove; narrow: boolean; busy: string | null
  run: (key: string, fn: () => Promise<Outcome | Refusal>) => Promise<void>
}) {
  const [needsJob, setNeedsJob] = useState<MoveChoice | null>(null)
  const choices = move.choices ?? []
  const words = (c: MoveChoice) => ANSWER_WORDS[c.value] ?? { label: c.label, hint: c.hint ?? '' }
  if (needsJob) {
    return (
      <div className="flex flex-col gap-2" data-testid="growth-move-primary">
        <p className="text-body text-ink">{words(needsJob).label}. What is it for?</p>
        <OptionChips
          size="touch"
          stack
          options={JOB_OPTIONS.map(j => ({ value: j.value, label: j.label }))}
          value=""
          disabled={busy != null}
          onChange={v => void run(`answer:${needsJob.value}`, () => m.answer(move, needsJob, words(needsJob).label, v as WebJob))}
        />
        <Button variant="ghost" size="default" className="tap-44 self-start" onClick={() => setNeedsJob(null)}>Back to the answers</Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2" data-testid="growth-move-primary">
      <OptionChips
        size="touch"
        stack
        options={choices.map(c => ({ value: c.value, label: words(c).label, hint: narrow ? undefined : words(c).hint || undefined }))}
        value=""
        disabled={busy != null}
        onChange={v => {
          const c = choices.find(x => x.value === v)
          if (!c) return
          if (c.needsJob) { setNeedsJob(c); return }
          void run(`answer:${v}`, () => m.answer(move, c, words(c).label))
        }}
      />
      <p className="text-micro text-ink-muted">One tap saves it.</p>
    </div>
  )
}

/** Clips: suggest three titles (a model call, narrated), or pick one of this week's moves, or write one. */
function ClipActions({ m, move, narrow, mobile, run }: {
  m: GrowthTabModel; move: NextMove; narrow: boolean; mobile: boolean
  run: (key: string, fn: () => Promise<Outcome | Refusal>) => Promise<void>
}) {
  const fromMoves = m.split.thisWeek.flatMap(r => reviewMoves(r).map(mv => ({ product: r.product_slug, move: mv })))
  const firstProduct = (fromMoves[0]?.product ?? 'mindmake') as ProductSlug
  const [product, setProduct] = useState<ProductSlug>(PRODUCTS.includes(firstProduct) ? firstProduct : 'mindmake')
  const [ideas, setIdeas] = useState<string[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  const [picking, setPicking] = useState(false)
  const [writing, setWriting] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const elapsed = useElapsed(thinking)
  const work = useWork('growth.clipIdeas')

  const suggest = async () => {
    setThinking(true)
    setNote(null)
    try {
      const r = await m.suggestIdeas(product)
      setIdeas(r.ideas.length ? r.ideas : null)
      setNote(r.note)
    } finally {
      setThinking(false)
    }
  }
  const add = async (title: string, slug: string | null) => {
    setAdding(title)
    try { await run('clip', () => m.makeClip(move, title, slug ?? product)) } finally { setAdding(null) }
  }

  if (thinking) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-3" data-testid="growth-clip-thinking">
        <Pending label={work.label} elapsedMs={elapsed} expectedMs={work.expectedMs} />
        {work.sub && <p className="mt-1 pl-6 text-micro text-ink-muted">{work.sub}</p>}
      </div>
    )
  }

  if (ideas) {
    return (
      <div className="flex flex-col gap-2" data-testid="growth-clip-ideas">
        <p className="text-micro text-ink-muted">Three ideas for {ventureLabel(product) ?? product}. Add the one you would film.</p>
        {ideas.map(t => (
          <div key={t} className="flex items-center gap-3 rounded-2xl border border-white/[0.1] bg-white/[0.03] py-2 pl-3 pr-2">
            <p className="min-w-0 flex-1 text-ui text-ink break-words">{t}</p>
            <Button variant="secondary" size="default" className="tap-44 flex-shrink-0" loading={adding === t} onClick={() => void add(t, product)}>
              <Plus size={16} aria-hidden /> Add
            </Button>
          </div>
        ))}
        <Button variant="ghost" size="default" className="tap-44 self-start" onClick={() => setIdeas(null)}>Back</Button>
      </div>
    )
  }

  const hasMoves = fromMoves.length > 0
  return (
    <>
      <OptionChips
        label="For which product"
        value={product}
        onChange={v => setProduct(v as ProductSlug)}
        options={PRODUCTS.map(p => ({ value: p, label: ventureLabel(p) ?? p }))}
      />
      <div className={narrow ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-2.5'}>
        <Button variant="primary" size="touch" className={narrow ? 'w-full' : ''} onClick={() => void suggest()} data-testid="growth-move-primary">
          <Sparkles size={16} aria-hidden /> Suggest 3 ideas
        </Button>
        <Button
          variant="outline" size="touch" className={narrow ? 'w-full whitespace-normal' : 'whitespace-normal'}
          onClick={() => (hasMoves ? setPicking(true) : setWriting(true))}
          data-testid="growth-move-secondary"
        >
          {hasMoves ? <><List size={16} aria-hidden /> Pick one of this week's moves</> : <><Plus size={16} aria-hidden /> Write my own</>}
        </Button>
      </div>
      {note && <p role="status" className="text-label text-ink-muted break-words">{note}</p>}
      <Overlay open={picking} onClose={() => setPicking(false)} label="Turn a move into a clip" mobile={mobile}>
        <div className="flex flex-col gap-3 pt-1">
          <Eyebrow>This week's moves</Eyebrow>
          <p className="text-label text-ink-muted">Each one comes from Sunday's review. The one you pick becomes this week's next clip.</p>
          <ul className="flex flex-col gap-2">
            {fromMoves.map(x => (
              <li key={`${x.product}:${x.move}`} className="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                <div className="min-w-0 flex-1">
                  <ProductTag slug={x.product} />
                  <p className="mt-1 text-body text-ink break-words">{x.move}</p>
                </div>
                <Button variant="secondary" size="default" className="tap-44 flex-shrink-0" onClick={() => { setPicking(false); void add(x.move, x.product) }}>
                  <Film size={16} aria-hidden /> Use
                </Button>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="default" className="tap-44 self-start" onClick={() => { setPicking(false); setWriting(true) }}>Write my own instead</Button>
        </div>
      </Overlay>
      <FocusedEditor
        open={writing && mobile}
        onClose={() => setWriting(false)}
        label="A clip for this week"
        value=""
        placeholder="What the clip says, in one line"
        saveLabel="Add the clip"
        onSave={async t => { setWriting(false); await add(t, product); return true }}
      />
      {writing && !mobile && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3"
          onSubmit={e => { e.preventDefault(); const t = new FormData(e.currentTarget).get('t'); if (typeof t === 'string' && t.trim()) { setWriting(false); void add(t.trim(), product) } }}
        >
          <label className="flex min-w-[240px] flex-1 flex-col gap-1">
            <span className="text-micro text-ink-muted">What the clip says, in one line</span>
            <input name="t" autoFocus className="min-h-[44px] rounded-xl border border-white/10 bg-white/[0.03] px-3 text-ui text-ink focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
          </label>
          <Button type="submit" variant="contrast" size="touch">Add the clip</Button>
        </form>
      )}
    </>
  )
}
