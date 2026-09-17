import React from 'react'
import { GoalLadder } from '../goals/GoalLadder'
import { TodayList } from '../home/TodayList'
import { VitalsLine } from '../home/VitalsLine'
import { CanonCta } from '../home/CanonCta'
import { FocusDoor } from '../home/FocusDoor'
import { IntelDoor } from '../home/IntelDoor'
import { SignalsDoor } from '../home/SignalsDoor'
import { CriticalAlertBanner } from '../CriticalAlertBanner'
import { DueTestsCard } from '../pilot/DueTestsCard'
import { PilotStrip } from '../home/PilotStrip'
import { useAltitudes } from '../../hooks/useAltitudes'
import { useGoalCanon } from '../../hooks/useGoalCanon'
import { useSpend, spendAlert } from '../../hooks/useSpend'
import { HomeSkeleton } from '../shared/Skeleton'
import { useFirstLoad } from '../shared/useDeferredPending'
import { useMediaQuery } from '../shared/motion'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * Home: where Krish locks in on what matters. One screen, no scroll.
 *
 * The whole page is the canon — OS goals → this week's objectives → today's 3
 * — plus one quiet vitals line (MRR · ships · waiting) and exactly ONE
 * contextual CTA under the highest stale layer. The ruling queue lives on
 * OS → Queue; venture health lives on Growth; the ambient pulse retired.
 * Everything here is `shrink-0` inside an overflow-hidden frame: the page
 * must fit, so short viewports compress spacing instead of scrolling.
 */
export function DesktopHome({ onNavigate }: {
  onNavigate?: NavigateFn
} = {}) {
  // The rail is a different TREE, not a different style, so it is chosen in JS.
  // Rendering both and hiding one with `min-[1400px]:hidden` put two copies of
  // every doorway in the DOM — same testids, same accessible names, six buttons
  // where the page has three.
  const wide = useMediaQuery('(min-width: 1400px)')
  const alt = useAltitudes()
  const { canon, loading } = useGoalCanon()
  const { spend } = useSpend()
  const intelAlert = spendAlert(spend)

  // One placeholder in the page's real proportions, so a cold load settles
  // once instead of assembling itself in public.
  const firstPaint = useFirstLoad(loading, Boolean(canon))
  if (firstPaint) return <HomeSkeleton />

  const cta = alt.cta

  // The instruments: what the machine did and what is owed. Peripheral to the
  // canon, which is why they sit in the rail on a wide desk and above it
  // otherwise. Rendered once, placed twice, so the two layouts cannot drift.
  const instruments = (
    <>
      <DueTestsCard variant="desktop" />
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
    <div className={`h-full min-h-0 flex flex-col gap-6 [@media(max-height:820px)]:gap-3.5 mx-auto w-full ${wide ? 'max-w-[1320px]' : 'max-w-[880px]'}`}>
      <div className="shrink-0 flex flex-col gap-3">
        <CriticalAlertBanner />
        <VitalsLine onNavigate={onNavigate} />
        {!wide && instruments}
      </div>

      <div className={`min-h-0 flex flex-col gap-6 [@media(max-height:820px)]:gap-3.5 ${wide ? 'flex-row gap-8 flex-1' : ''}`}>
        <div className={`shrink-0 flex flex-col gap-6 [@media(max-height:820px)]:gap-3.5 pt-1 ${wide ? 'min-w-0 flex-1 max-w-[880px]' : ''}`}>
          <GoalLadder variant="desktop" />
          {cta && cta.target === 'weekly' && <CanonCta cta={cta} />}
          <TodayList />
          {cta && cta.target !== 'weekly' && <CanonCta cta={cta} />}
        </div>

        {/* No `mt-auto` in the rail. In the bottom row it was what kept the
            doorways pinned to the foot of the page; in a rail it reproduced the
            exact problem the rail was meant to fix, parking them 700px below
            the content they sit beside. In a column they read top-down as a
            short list of places to go, which is what they are. */}
        {wide && (
          <aside className="flex w-[320px] shrink-0 flex-col gap-3 pt-1">
            {instruments}
            <div className="flex flex-col gap-2">{doors}</div>
          </aside>
        )}
      </div>

      {/* The ⌘I capture and tab-chat pills float in the reserved gutter BELOW
          this row (--capture-gutter), not over it, so the panel can span the
          full width. */}
      {!wide && <div className="shrink-0 mt-auto flex items-center gap-3">{doors}</div>}
    </div>
  )
}
