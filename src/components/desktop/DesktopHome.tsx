import React, { useState } from 'react'
import { GoalLadder } from '../goals/GoalLadder'
import { TodayList } from '../home/TodayList'
import { VitalsLine } from '../home/VitalsLine'
import { CanonCta } from '../home/CanonCta'
import { FocusDoor } from '../home/FocusDoor'
import { IntelDoor } from '../home/IntelDoor'
import { SignalsDoor } from '../home/SignalsDoor'
import { CriticalAlertMark } from '../CriticalAlert'
import { DueTestsCard } from '../pilot/DueTestsCard'
import { PilotStrip } from '../home/PilotStrip'
import { useAltitudes } from '../../hooks/useAltitudes'
import { useGoalCanon } from '../../hooks/useGoalCanon'
import { useSpend, spendAlert } from '../../hooks/useSpend'
import { HomeSkeleton } from '../shared/Skeleton'
import { useFirstLoad } from '../shared/useDeferredPending'
import { useContainerWidth } from '../../hooks/useContainerWidth'
import { useDailyMove } from '../../hooks/useDailyMove'
import { useFitFolds } from '../../hooks/useFitRows'
import { HOME_FOLDS, foldsAt, type HomePin } from '../../lib/homeFolds'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * Home: where Krish locks in on what matters. One screen, no scroll.
 *
 * The whole page is the canon — OS goals → this week's objectives → today's 3
 * — plus one quiet vitals line (MRR · ships · waiting) and exactly ONE
 * contextual CTA under the highest stale layer. The ruling queue lives on
 * OS → Queue; venture health lives on Growth; the ambient pulse retired.
 * The page must fit, so short viewports compress spacing, and when spacing is
 * not enough the canon column FOLDS, measured before paint (useFitFolds,
 * src/lib/homeFolds.ts). It never scrolls and never clips: Krish, 2026-10-03,
 * "no scroll guaranteed everywhere". A 1280x720 laptop with the reasons open
 * under today's move ran 86px past the frame before this.
 */
export function DesktopHome({ onNavigate }: {
  onNavigate?: NavigateFn
} = {}) {
  // The rail is a different TREE, not a different style, so it is chosen in JS.
  // Rendering both and hiding one with `min-[1400px]:hidden` put two copies of
  // every doorway in the DOM — same testids, same accessible names, six buttons
  // where the page has three.
  // Measured on the CANVAS, not the window. `(min-width: 1400px)` asked how
  // wide the browser is; this tab never gets the browser — the sidebar takes
  // 240px and the gutter 48, so a 1440px window hands Home 1200. The old query
  // therefore turned the rail on at a canvas of ~1112 and ignored the sidebar
  // being collapsed, which gives the page 240px more and used to change
  // nothing. The threshold is now the sum of what the layout actually needs:
  // the 880px reading measure, the 32px gap, and the 320px rail. Below that
  // the rail does not fit beside the column without shrinking the measure,
  // and the measure is the point — so below it, one centred column.
  const [canvasRef, canvasWidth] = useContainerWidth<HTMLDivElement>()
  const wide = canvasWidth >= 880 + 32 + 320
  const alt = useAltitudes()
  const { canon, loading } = useGoalCanon()
  const { spend } = useSpend()
  const intelAlert = spendAlert(spend)

  // One placeholder in the page's real proportions, so a cold load settles
  // once instead of assembling itself in public.
  const firstPaint = useFirstLoad(loading, Boolean(canon))
  // Today's move, read once here because Home decides what it folds.
  const daily = useDailyMove()
  const [pinned, setPinned] = useState<HomePin>(null)
  const fit = useFitFolds(HOME_FOLDS.length, pinned)
  // The wide rail has one fold of its own: the due test.
  const railFit = useFitFolds(1, pinned)
  const folds = foldsAt(fit.level, pinned)
  // "Pick your 3" steps aside only while a move is proposed and the column
  // has run out: the move is then the ask, and the Add on Today sets the rest.
  const ctaAside = folds.cta && Boolean(daily.current)
  if (firstPaint) return <HomeSkeleton />

  const cta = alt.cta

  // The instruments: what the machine did and what is owed. Peripheral to the
  // canon, which is why they sit in the rail on a wide desk and above it
  // otherwise. Rendered once, placed twice, so the two layouts cannot drift.
  const instruments = (foldTests: boolean) => (
    <>
      <DueTestsCard variant="desktop" fold={foldTests} open={pinned === 'tests'} onPin={o => setPinned(o ? 'tests' : null)} />
      <PilotStrip onNavigate={onNavigate} />
    </>
  )

  // The doorways: Focus, Market signals, Intel as three equal peers — solid,
  // never translucent (see HomeDoor), a word and never a number (a status dot
  // is the one sanctioned exception). A row along the bottom under 1400px; a
  // stack at the foot of the rail above it, where a row would have been three
  // pills marooned under 800px of nothing.
  const doors = (
    <>
      <FocusDoor onNavigate={onNavigate} />
      <SignalsDoor />
      <IntelDoor onOpen={() => onNavigate?.('os', { sub: 'intel' })} alert={intelAlert} />
    </>
  )

  return (
    // Two shapes, one page.
    //
    // Under 1400px this is the column it has always been, capped at 880px.
    // Above it the canon keeps that measure and the instruments move into a
    // 320px rail beside it, because the column alone left 800px of dead width
    // at 1920 and ended at 83% of the height with the doorways stranded on
    // `mt-auto` half a screen below the content they belong to. Measured
    // 2026-09-17 across twelve desktop surfaces: ten were a single column and
    // most used less than half the viewport.
    //
    // The measure does NOT grow to fill the width. A goal ladder and a list of
    // three is a reading column, and 1300px of it would be worse, not better.
    // The width buys a second thing to look at, not a wider first thing.
    // The measured box is the OUTER one, which always fills the canvas. The
    // inner box is the one being capped at 880 or 1320, so measuring it made
    // the decision its own input: it started narrow, capped itself at 880,
    // measured 880, stayed narrow. A width decision may never be taken from
    // the element the decision resizes.
    <div ref={canvasRef} className="h-full min-h-0 w-full">
    <div className={`h-full min-h-0 flex flex-col gap-6 [@media(max-height:820px)]:gap-3.5 mx-auto w-full ${wide ? 'max-w-[1320px]' : 'max-w-[880px]'}`}>
      {/* The alarm rides the vitals band as a mark, the same one the phone
          shows, rather than a full-width block above it. One alarm, one
          treatment, both device classes. */}
      <div className="shrink-0 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1"><VitalsLine onNavigate={onNavigate} /></div>
          <CriticalAlertMark />
        </div>
      </div>

      {/* The direction is exclusive, and it has to be: `flex-col` in the base
          with `flex-row` appended conditionally does NOT make a row. Tailwind
          emits `.flex-row` before `.flex-col` in its stylesheet, so at equal
          specificity the column always won no matter what order the classes
          were written in — and this wide branch has never once rendered as two
          columns since it shipped.

          Measured 2026-09-23 at a 1440px window, where the query said wide:
          the 320px rail laid out BELOW the goal column at y=658 instead of
          beside it at x=1150, which is exactly the "doorways stranded half a
          screen below the content they belong to" this branch was written to
          fix. */}
      {/* The row always takes the height left over, so the canon column is a
          bounded box that can be measured, in both shapes. */}
      <div className={`min-h-0 flex-1 flex [@media(max-height:820px)]:gap-3.5 ${wide ? 'flex-row gap-8' : 'flex-col gap-6'}`}>
        <div
          ref={fit.boxRef}
          data-testid="home-stage"
          data-fit={fit.overrun ? 'overrun' : 'fit'}
          data-fold-level={fit.level}
          className={`min-h-0 flex-1 ${fit.overrun ? 'overflow-y-auto' : 'overflow-hidden'} ${wide ? 'min-w-0 max-w-[880px]' : ''}`}
        >
          <div ref={fit.contentRef} className="flex flex-col gap-6 [@media(max-height:820px)]:gap-3.5 pt-1">
            {/* In the column the instruments sit inside the stage, so a due
                test folds like everything else instead of taking height the
                canon can never win back. On a wide desk they are in the rail. */}
            {/* Direct children, never a wrapper: a strip with nothing to say
                renders nothing, and an empty wrapper would still take a gap. */}
            {!wide && instruments(folds.tests)}
            <GoalLadder variant="desktop" fold={{ os: folds.os, week: folds.week }} pinned={pinned} onPin={setPinned} />
            {cta && cta.target === 'weekly' && <CanonCta cta={cta} />}
            <TodayList
              daily={daily}
              folds={{ survived: folds.survived, why: folds.why, slots: folds.slots, actions: folds.actions, card: folds.card }}
              onShowMove={() => setPinned('card')}
            />
            {cta && cta.target !== 'weekly' && !ctaAside && <CanonCta cta={cta} />}
          </div>
        </div>

        {/* No `mt-auto` in the rail. In the bottom row it was what kept the
            doorways pinned to the foot of the page; in a rail it reproduced the
            exact problem the rail was meant to fix, parking them 700px below
            the content they sit beside. In a column they read top-down as a
            short list of places to go, which is what they are. */}
        {/* The rail is measured too: a due test with the doors under it on a
            short wide window folds rather than clip. */}
        {wide && (
          <aside
            ref={railFit.boxRef}
            data-testid="home-rail"
            data-fit={railFit.overrun ? 'overrun' : 'fit'}
            className={`flex w-[320px] shrink-0 min-h-0 ${railFit.overrun ? 'overflow-y-auto' : 'overflow-hidden'}`}
          >
            <div ref={railFit.contentRef} className="flex w-full flex-col gap-3 pt-1">
              {instruments(railFit.level >= 1)}
              <div className="flex flex-col gap-2">{doors}</div>
            </div>
          </aside>
        )}
      </div>

      {/* The ⌘I capture and tab-chat pills float in the reserved gutter BELOW
          this row (--capture-gutter), not over it, so the panel can span the
          full width. */}
      {!wide && <div className="shrink-0 flex items-center gap-3">{doors}</div>}
    </div>
    </div>
  )
}
