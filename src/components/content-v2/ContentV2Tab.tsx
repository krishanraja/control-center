import React, { useCallback, useRef, useState } from 'react'
import { AlertTriangle, Sparkles } from '@/lib/icons'
import { AppFrame } from '../shared/AppFrame'
import { SurfaceHeader } from '../shared/SurfaceHeader'
import { Claim } from '../shared/Claim'
import { Eyebrow } from '../shared/Eyebrow'
import { IconTile } from '../shared/IconTile'
import { AllClear } from '../shared/AllClear'
import { Skeleton } from '../shared/Skeleton'
import { SlideOver } from '../shared/SlideOver'
import { BottomSheet } from '../mobile/BottomSheet'
import { BOTTOM_NAV_PAD } from '../mobile/MobileShell'
import { Button } from '../ui/button'
import { StartFromResearch } from '../content/StartFromResearch'
import { EngineAttention } from './EngineAttention'
import { CallCard, Mono, revealTop } from './CallCard'
import { CallRow, EngineFlow, EngineLine, Progress, SeriesNext, claimLine, engineStages } from './ContentPanels'
import { BrowsePieces } from './BrowsePieces'
import { useContentCalls, type ContentCalls } from '../../hooks/useContentCalls'
import { useContainerWidth } from '../../hooks/useContainerWidth'
import { ventureLabel } from '../../lib/ventureOptions'
import { longDay, shortDay, whenWords } from '../../lib/contentCallWords'
import { cn } from '@/lib/utils'

/**
 * The Content tab: today's calls.
 *
 * The engine finds, judges, writes and checks pieces on its own. What it
 * cannot do without Krish is a short list of decisions: approve a finished
 * piece, allow a paid fact check, set how sure we are, pick the next piece
 * for a series, review a Studio video, and a few weekly rulings. This tab is
 * that list, numbered, one in focus, each with one primary action and
 * "Not now". The engine gets one strip saying where it is up to and one line
 * saying whether it is healthy, never a pile.
 *
 * It replaced seven room pills (To decide, three series, Not lifted, Library)
 * on 2026-10-04. The rooms organised the tab by where a piece lives, which
 * meant visiting four places to answer "what needs me?". Browsing every piece
 * is still one press away ("Browse all pieces"), with the Library inside it.
 *
 * One bounded body, one scroller (`content-room-scroll`), inside AppFrame.
 * The shape is picked from the width the tab is actually handed, measured on
 * the tab root, which no layout choice here resizes:
 *   stack   under 1000px: phone, tablet, a narrow desk window. The call in
 *           focus as the one card, the rest as numbered rows beneath it.
 *   split   1000 to 1479: the desk at 1440. The list beside a reading pane.
 *   triple  1480 and up:  the desk at 1920. List, reading pane, and a rail.
 */
type Shape = 'stack' | 'split' | 'triple'

export function ContentV2Tab({ variant }: { variant: 'desktop' | 'mobile' }) {
  const mobile = variant === 'mobile'
  const s = useContentCalls()
  const [boxRef, width] = useContainerWidth()
  const shape: Shape = mobile || width < 1000 ? 'stack' : width < 1480 ? 'split' : 'triple'
  const [sheet, setSheet] = useState<null | 'engine' | 'browse'>(null)
  const [starting, setStarting] = useState(false)

  const cardRefs = useRef(new Map<string, HTMLElement>())
  const numberOf = useCallback((key: string) => {
    const k = s.calls.findIndex(c => c.key === key)
    return k < 0 ? null : k + 1
  }, [s.calls])
  const keyForSlot = useCallback((series: string, date: string): string | null => {
    const slot = s.slots.find(x => x.series === series && x.date === date)
    if (slot?.picked) return s.calls.find(c => c.ideaId === slot.picked!.id)?.key ?? null
    return s.calls.find(c => c.kind === 'pick_for_series' && c.series === series && c.date === date)?.key ?? null
  }, [s.slots, s.calls])
  const readerRef = useRef<HTMLDivElement>(null)
  /** Desk: hold this call in the reading pane, and bring the pane's top into
   *  view if he chose it from further down the list. */
  const focusCall = useCallback((key: string) => {
    s.hold(key)
    requestAnimationFrame(() => revealTop(readerRef.current))
  }, [s])
  const goTo = useCallback((key: string) => {
    if (shape === 'stack') {
      // The phone holds one card: bring this call into it, then its top into view.
      s.hold(key)
      requestAnimationFrame(() => cardRefs.current.get('__focus')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
    } else focusCall(key)
  }, [shape, focusCall, s])
  const nextAfter = useCallback((key: string) => {
    const k = s.calls.findIndex(c => c.key === key)
    const next = [...s.calls.slice(k + 1), ...s.calls.slice(0, k)].find(c => !s.receipts[c.key])
    return next?.key ?? null
  }, [s.calls, s.receipts])

  const today = s.today
  const browse = (
    <Button variant="outline" size="sm" className="tap-44" onClick={() => setSheet('browse')} data-testid="content-browse-open">
      Browse all pieces
    </Button>
  )
  const header = mobile ? undefined : (
    <SurfaceHeader
      eyebrow={ventureLabel('publication') ?? 'Media'}
      title="Content"
      meta={<Mono className="text-label text-ink-muted">{longDay(today)}</Mono>}
      actions={(
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          {s.ready && <div className="max-w-[24rem]"><EngineLine failing={s.failing} onOpen={() => setSheet('engine')} /></div>}
          {browse}
          <Button
            variant="ghost"
            size="sm"
            className="tap-44"
            onClick={() => setStarting(true)}
            iconLeft={<Sparkles size={12} />}
            data-testid="content-start-research"
          >
            Start from research
          </Button>
        </div>
      )}
    />
  )

  const frame = (children: React.ReactNode, busy = false) => (
    <div ref={boxRef} className="flex h-full min-h-0 flex-col" data-testid="content-tab" data-layout={shape} aria-busy={busy || undefined}>
      <AppFrame header={header} bodyTestId="content-room-scroll" capturePills={!mobile} bodyClassName={cn(header && 'pt-5', mobile && BOTTOM_NAV_PAD)}>
        {mobile && <h1 className="sr-only">Content</h1>}
        {children}
      </AppFrame>
      <Sheets s={s} mobile={mobile} sheet={sheet} close={() => setSheet(null)} />
      {!mobile && <StartFromResearch open={starting} onClose={() => setStarting(false)} />}
    </div>
  )

  if (s.error) {
    return frame(
      <div className={cn('flex flex-col gap-6', shape === 'stack' && 'mx-auto w-full max-w-[680px]')}>
        <div className={cn('surface flex flex-col gap-4 rounded-2xl', mobile ? 'p-5' : 'max-w-[720px] p-7')} role="alert" data-testid="content-error">
          <IconTile icon={AlertTriangle} size="md" tone="neutral" />
          <h2 className="text-title font-display font-semibold text-ink">Today's calls did not load.</h2>
          <p className="text-ui text-ink-muted">The content engine's pieces did not arrive, so this tab cannot say what needs you yet. Nothing was changed, and nothing was sent.</p>
          <Button variant="secondary" size="touch" onClick={s.retry} className={mobile ? 'w-full' : 'w-fit px-6'}>Try again</Button>
        </div>
      </div>,
    )
  }

  if (!s.ready || !s.pipe) return frame(<Loading shape={shape} />, true)

  const total = s.calls.length
  const zero = total === 0
  const firstOpen = s.calls.find(c => !s.receipts[c.key])
  const firstDay = firstOpen ? (firstOpen.date ?? s.slotDayOf(firstOpen.ideaId)) : null
  const claim = claimLine(s.open, s.decided, firstOpen && ['approve', 'go_out'].includes(firstOpen.kind) ? firstDay : null, today, whenWords)
  const scheduled = s.ideas.filter(i => i.state === 'approved' && i.scheduled_for && !i.published_at).length
  const stages = engineStages(s.pipe, s.foundThisWeek, scheduled)
  const engineLine = <EngineLine failing={s.failing} onOpen={() => setSheet('engine')} />
  const gaps = <Gaps s={s} />
  const week = (columns: boolean) => (
    <SeriesNext
      slots={s.slots}
      columns={columns}
      callNumber={(series, date) => { const k = keyForSlot(series, date); return k ? numberOf(k) : null }}
      onCall={(series, date) => { const k = keyForSlot(series, date); if (k) goTo(k) }}
    />
  )

  // ── Stack: the phone, the tablet, a narrow window ──
  if (shape === 'stack') {
    return frame(
      <div className={cn('mx-auto flex w-full max-w-[680px] flex-col pb-4', mobile ? 'gap-6' : 'gap-7')}>
        {zero ? (
          <div className="flex flex-col items-center gap-3" data-testid="content-all-clear">
            <AllClear title="All clear." sub="Nothing needs you today. The engine judges new ideas every morning at 05:00 UTC and brings back anything that needs a decision." />
            <div className="w-full max-w-[26rem]">{engineLine}</div>
            {mobile && browse}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <Claim size="title">{claim}</Claim>
              <Progress total={total} settled={s.settled} lead={mobile ? <Mono className="text-label text-ink-muted">{shortDay(today)}</Mono> : undefined} />
              {mobile && engineLine}
              {mobile && <div>{browse}</div>}
            </div>
            {/* One call at a time, as on Growth (Krish, 2026-10-05). The call
                in focus is the one card, with its one primary action and Not
                now; every other call is a numbered row that brings its card
                up. It used to stack all ten as full cards, which on a phone
                was 7,080px of scroll with ten primary buttons in it and the
                engine's numbers at the very bottom. Next, in the verdict, is a
                press: nothing moves on its own. */}
            <div data-testid="content-calls" className="flex flex-col gap-5" aria-label="Today's calls">
              {s.focus && (
                <div className="scroll-mt-4" ref={el => { if (el) cardRefs.current.set('__focus', el) }}>
                  <CallCard
                    key={s.focus.key}
                    call={s.focus}
                    n={numberOf(s.focus.key) ?? 1}
                    s={s}
                    layout="card"
                    onNext={nextAfter(s.focus.key) ? () => { const k = nextAfter(s.focus!.key); if (k) goTo(k) } : undefined}
                  />
                </div>
              )}
              {total > 1 && (
                <section aria-labelledby="other-calls-h" className="flex flex-col gap-2">
                  <h2 id="other-calls-h" className="px-1 leading-none"><Eyebrow>Your other calls</Eyebrow></h2>
                  <ol className="flex flex-col gap-1">
                    {s.calls.map((c, k) => c.key === s.focus?.key ? null : (
                      <CallRow key={c.key} call={c} n={k + 1} receipt={s.receipts[c.key]} selected={false} onSelect={() => goTo(c.key)} s={s} />
                    ))}
                  </ol>
                </section>
              )}
            </div>
          </>
        )}
        {gaps}
        {week(!mobile && width >= 640)}
        <section aria-labelledby="flow-h" className="flex flex-col gap-3">
          <h2 id="flow-h" className="leading-none"><Eyebrow>Where the engine is up to</Eyebrow></h2>
          <div className="surface rounded-2xl p-4"><EngineFlow stages={stages} variant="list" /></div>
        </section>
      </div>,
    )
  }

  // ── Split and triple: the desk ──
  const triple = shape === 'triple'
  const focus = s.focus
  return frame(
    <div className="flex flex-col gap-5 pb-2">
      <EngineFlow stages={stages} variant="strip" />
      {zero ? (
        <div className={cn('grid items-start gap-8', triple ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_340px]' : 'grid-cols-2')}>
          <div className="surface flex flex-col items-center gap-2 rounded-2xl pb-8" data-testid="content-all-clear">
            <AllClear title="All clear." />
            <p className="max-w-[26rem] px-6 text-center text-ui text-ink-muted">
              Nothing needs you today. The engine judges new ideas every morning at 05:00 UTC and brings back anything that needs a decision.
            </p>
            <div className="px-6">{gaps}</div>
          </div>
          <div className={triple ? 'col-span-2' : undefined}>{week(triple)}</div>
        </div>
      ) : (
        <div className={cn('grid items-start gap-8', triple ? 'grid-cols-[360px_minmax(0,1fr)_320px]' : 'grid-cols-[340px_minmax(0,1fr)]')}>
          <aside data-testid="content-calls-list" className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 px-1">
              <Claim size="title">{claim}</Claim>
              <Progress total={total} settled={s.settled} />
            </div>
            <ol
              data-testid="content-calls"
              className="flex flex-col gap-1"
              aria-label="Today's calls. Up and down arrows move between them."
              onKeyDown={e => {
                if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                const k = s.calls.findIndex(c => c.key === focus?.key)
                const next = s.calls[Math.min(s.calls.length - 1, Math.max(0, k + (e.key === 'ArrowDown' ? 1 : -1)))]
                if (!next) return
                e.preventDefault()
                s.hold(next.key)
                const list = e.currentTarget
                requestAnimationFrame(() => (list.querySelectorAll('button')[s.calls.indexOf(next)] as HTMLButtonElement | undefined)?.focus())
              }}
            >
              {s.calls.map((c, k) => (
                <CallRow key={c.key} call={c} n={k + 1} receipt={s.receipts[c.key]} selected={c.key === focus?.key} onSelect={() => focusCall(c.key)} s={s} />
              ))}
            </ol>
            {gaps}
          </aside>

          <div ref={readerRef} data-testid="content-reader" className="flex min-w-0 flex-col gap-8">
            {focus && (
              <CallCard
                key={focus.key}
                call={focus}
                n={numberOf(focus.key) ?? 1}
                s={s}
                layout="reader"
                onNext={nextAfter(focus.key) ? () => { const k = nextAfter(focus.key); if (k) focusCall(k) } : undefined}
              />
            )}
            {!triple && week(true)}
          </div>

          {triple && <aside data-testid="content-rail" className="flex flex-col gap-8">{week(false)}</aside>}
        </div>
      )}
    </div>,
  )
}

/** What the list cannot see today, named so a gap reads as a gap. */
function Gaps({ s }: { s: ContentCalls }) {
  if (!s.unsupported.length) return null
  return (
    <section aria-labelledby="gaps-h" data-testid="content-gaps" className="flex flex-col gap-2 px-1">
      <h2 id="gaps-h" className="leading-none"><Eyebrow>Not in this list</Eyebrow></h2>
      <ul className="flex flex-col gap-1.5">
        {s.unsupported.map(u => (
          <li key={u.kind} className="text-label text-ink-faint">
            {u.kind === 'studio_review'
              ? <><span className="font-semibold text-ink-muted">Video reviews could not be checked</span>. Your other calls are still right. Refresh before assuming no video is waiting.</>
              : u.why}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Sheets({ s, mobile, sheet, close }: { s: ContentCalls; mobile: boolean; sheet: null | 'engine' | 'browse'; close: () => void }) {
  const engineBody = s.pipe ? (
    <div className="flex flex-col gap-5">
      <p className="text-ui text-ink-muted">
        The engine finds, judges, writes and checks pieces on its own. It judges every morning at 05:00 UTC and keeps improving the {s.pipe.byStage.needs_work} pieces that need work without asking you.
      </p>
      {s.failing.length > 0 && (
        <div className="flex flex-col gap-2">
          <Eyebrow>What is failing</Eyebrow>
          <EngineAttention runs={s.runs} onRan={s.refreshRuns} />
        </div>
      )}
      <div className="flex flex-col gap-3">
        <Eyebrow>Where it is up to</Eyebrow>
        <EngineFlow stages={engineStages(s.pipe, s.foundThisWeek, s.ideas.filter(i => i.state === 'approved' && i.scheduled_for && !i.published_at).length)} variant="list" />
      </div>
    </div>
  ) : null

  return (
    <>
      <BrowsePieces open={sheet === 'browse'} onClose={close} mobile={mobile} s={s} />
      {mobile ? (
        <BottomSheet open={sheet === 'engine'} onClose={close} ariaLabel="The engine" fullHeight={false}>
          <div className="max-h-[80dvh] overflow-y-auto px-5 pb-8">
            <div className="mb-4"><Eyebrow>The engine</Eyebrow></div>
            {engineBody}
          </div>
        </BottomSheet>
      ) : (
        <SlideOver open={sheet === 'engine'} onClose={close} ariaLabel="The engine" label="The engine">
          {engineBody}
        </SlideOver>
      )}
    </>
  )
}

// ── Loading: the shape of what is arriving ───────────────────────────────

function Loading({ shape }: { shape: Shape }) {
  if (shape === 'stack') {
    return (
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6" data-testid="content-loading">
        <div className="flex flex-col gap-3">
          <Skeleton h={24} w="92%" />
          <Skeleton h={24} w="58%" />
          <Skeleton h={14} />
        </div>
        {[300, 220].map((h, k) => (
          <div key={k} className="surface flex flex-col gap-4 rounded-2xl p-4">
            <div className="flex items-center gap-3"><Skeleton h={28} w={28} r={14} /><Skeleton h={11} w={110} /></div>
            <Skeleton h={22} w="85%" />
            <Skeleton h={h - 150} />
            <Skeleton h={48} r={12} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-5" data-testid="content-loading">
      <Skeleton h={94} r={16} />
      <div className={cn('grid items-start gap-8', shape === 'triple' ? 'grid-cols-[360px_minmax(0,1fr)_320px]' : 'grid-cols-[340px_minmax(0,1fr)]')}>
        <div className="flex flex-col gap-3">
          <Skeleton h={26} w="88%" />
          <Skeleton h={4} />
          {Array.from({ length: 5 }, (_, k) => <Skeleton key={k} h={72} r={12} />)}
        </div>
        <div className="surface flex flex-col gap-5 rounded-2xl p-7">
          <Skeleton h={12} w={160} />
          <Skeleton h={30} w="70%" />
          <Skeleton h={120} />
          <Skeleton h={48} w={220} r={12} />
        </div>
        {shape === 'triple' && <div className="flex flex-col gap-3">{[0, 1, 2].map(k => <Skeleton key={k} h={120} r={16} />)}</div>}
      </div>
    </div>
  )
}
