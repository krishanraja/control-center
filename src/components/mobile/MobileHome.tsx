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
import { MindmakeIdentity } from '../shared/MindmakeIdentity'
import { useAltitudes } from '../../hooks/useAltitudes'
import { useGoalCanon } from '../../hooks/useGoalCanon'
import { useSpend, spendAlert } from '../../hooks/useSpend'
import { HomeSkeleton } from '../shared/Skeleton'
import { useFirstLoad } from '../shared/useDeferredPending'
import { useDailyMove } from '../../hooks/useDailyMove'
import { useFitFolds } from '../../hooks/useFitRows'
import { HOME_FOLDS, foldsAt, type HomePin } from '../../lib/homeFolds'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * Home on mobile: the canon on one fixed screen, no scroll, guaranteed.
 *
 * Deliberately NOT the scrolling MobileShell: the frame is
 * 100dvh ÷ the zoom factor, overflow hidden, with BottomNav + pilot-dock
 * clearance reserved at the bottom (divided by --z because the nav renders
 * outside the zoom wrapper at native size). When the canon is taller than the
 * screen it FOLDS, measured before paint (useFitFolds, src/lib/homeFolds.ts):
 * Krish, 2026-10-03, "no scroll guaranteed everywhere".
 */
export function MobileHome({ onNavigate }: {
  onNavigate?: NavigateFn
} = {}) {
  const alt = useAltitudes()
  const { canon, loading } = useGoalCanon()
  const { spend } = useSpend()
  const intelAlert = spendAlert(spend)
  const firstPaint = useFirstLoad(loading, Boolean(canon))
  // Today's move, read once here because Home decides what it folds.
  const daily = useDailyMove()
  const [pinned, setPinned] = useState<HomePin>(null)
  const fit = useFitFolds(HOME_FOLDS.length, pinned)
  const folds = foldsAt(fit.level, pinned)
  // While a move is proposed the move IS the ask: one primary action on the
  // screen, as on Growth. "Pick your 3" steps aside (the Add on Today sets the
  // rest) and the week's ask moves onto the This week line.
  const ctaAside = Boolean(daily.current)

  // Bottom padding clears the nav only; the band the + button floats in
  // (56px tall, at safe+92 native) now belongs to the doors row below, so
  // the canon gains the row the old full-width door used to spend.
  const frame = 'h-[calc(100dvh/var(--z,1))] overflow-hidden flex flex-col px-5 pt-3 pb-[calc((env(safe-area-inset-bottom,0px)+88px)/var(--z,1))]'

  if (firstPaint) {
    return (
      <div className={frame}>
        <div className="shrink-0 mb-4"><MindmakeIdentity size={36} testId="mobile-home-identity" /></div>
        <HomeSkeleton narrow />
      </div>
    )
  }

  const cta = alt.cta
  // Measured 2026-10-05 at 360x640: the full-width week ask beside a long
  // move cost 61px and folded the move on its own, which only something he
  // opens may do.
  const weekAsk = ctaAside && cta?.target === 'weekly' ? cta.label : null

  return (
    <div className={frame}>
      {/* Compact header: identity, the vitals line, and the alarm if one is
          live, all in one band. */}
      <div className="shrink-0 flex items-start gap-3 mb-2">
        <div className="pt-[2px]"><MindmakeIdentity size={36} testId="mobile-home-identity" /></div>
        <div className="flex-1 min-w-0"><VitalsLine onNavigate={onNavigate} compact /></div>
        <CriticalAlertMark className="mt-[2px]" />
      </div>

      {/* The alarm is no longer a block here. It is the mark in the band above
          and the drawer behind it, which costs Home nothing and loses nothing:
          the full sentence is one tap away instead of 180px of a 640px screen.
          The instruments (a due test, drafted approaches) moved inside the
          stage below on 2026-10-03, so a due test folds like the rest instead
          of taking 220px the stage can never win back. */}

      {/* The canon stack keeps the doors off its back, and never scrolls.

          It used to scroll when it overran (2026-09-23): on a 360x640 phone
          three OS goals written the long way pushed "Pick your 3 for today"
          below the screen, and a short scroll beat clipping it away unseen.
          Krish's ruling of 2026-10-03 replaces both: the stack folds. The
          least important thing gives way first, each fold keeps what it
          folded one tap away, and the climb happens before the browser paints,
          so nothing is ever seen overflowing. `data-fit` says "overrun" only
          when every fold is spent and it still does not fit, which the
          no-scroll gates fail on at every supported size; even then it
          scrolls rather than hide anything. */}
      <div
        ref={fit.boxRef}
        data-testid="home-stage"
        data-fit={fit.overrun ? 'overrun' : 'fit'}
        data-fold-level={fit.level}
        className={`flex-1 min-h-0 pt-1 ${fit.overrun ? 'overflow-y-auto' : 'overflow-hidden'}`}
      >
        <div ref={fit.contentRef} className="flex flex-col gap-2">
          <DueTestsCard variant="mobile" fold={folds.tests} open={pinned === 'tests'} onPin={o => setPinned(o ? 'tests' : null)} />
          <PilotStrip onNavigate={onNavigate} />
          <GoalLadder variant="mobile" fold={{ os: folds.os, week: folds.week }} pinned={pinned} onPin={setPinned} weekAsk={weekAsk} />
          {cta && cta.target === 'weekly' && !weekAsk && <CanonCta cta={cta} />}
          <TodayList
            compact
            daily={daily}
            folds={{ why: folds.why, slots: folds.slots, actions: folds.actions, card: folds.card }}
            onShowMove={() => setPinned('card')}
          />
          {cta && cta.target !== 'weekly' && !ctaAside && <CanonCta cta={cta} />}
        </div>
      </div>

      {/* The doors panel: Focus, Market signals and Intel as three equal peers
          sharing the band the + button floats in (right padding reserves the
          FAB's native footprint, divided by the zoom). Compact — the word
          alone — is what lets three fit the narrow band. Solid, never
          translucent (see HomeDoor). Doors, not vitals: no counts, ever;
          Intel's status dot is the one sanctioned exception. */}
      <div className="mt-auto flex shrink-0 items-center gap-2 pt-2 pr-[68px]">
        <FocusDoor onNavigate={onNavigate} compact />
        <SignalsDoor compact />
        <IntelDoor onOpen={() => onNavigate?.('os', { sub: 'intel' })} alert={intelAlert} compact />
      </div>
    </div>
  )
}
