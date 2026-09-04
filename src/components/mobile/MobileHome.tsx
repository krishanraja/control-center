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
import { MindmakeIdentity } from '../shared/MindmakeIdentity'
import { useAltitudes } from '../../hooks/useAltitudes'
import { useGoalCanon } from '../../hooks/useGoalCanon'
import { useSpend, spendAlert } from '../../hooks/useSpend'
import { HomeSkeleton } from '../shared/Skeleton'
import { useFirstLoad } from '../shared/useDeferredPending'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * Home on mobile: the canon on one fixed screen, no scroll.
 *
 * Deliberately NOT the scrolling MobileShell: the frame is
 * 100dvh ÷ the zoom factor, overflow hidden, with BottomNav + pilot-dock
 * clearance reserved at the bottom (divided by --z because the nav renders
 * outside the zoom wrapper at native size). The layers compress via tight
 * gaps and single-line rows rather than scrolling.
 */
export function MobileHome({ onNavigate }: {
  onNavigate?: NavigateFn
} = {}) {
  const alt = useAltitudes()
  const { canon, loading } = useGoalCanon()
  const { spend } = useSpend()
  const intelAlert = spendAlert(spend)
  const firstPaint = useFirstLoad(loading, Boolean(canon))

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

  return (
    <div className={frame}>
      {/* Compact header: identity + the vitals line share one band. */}
      <div className="shrink-0 flex items-start gap-3 mb-2">
        <div className="pt-[2px]"><MindmakeIdentity size={36} testId="mobile-home-identity" /></div>
        <div className="flex-1 min-w-0"><VitalsLine onNavigate={onNavigate} compact /></div>
      </div>

      <div className="shrink-0 flex flex-col gap-2.5">
        <CriticalAlertBanner />
        <DueTestsCard variant="mobile" />
      </div>

      {/* overflow-hidden so an over-tall day (a firing critical alert on a
          short phone) clips inside this stack instead of painting over the
          Focus door below it. On an ordinary day the canon fits: the no-scroll
          spec pins scrollHeight == clientHeight here at every viewport. */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2 pt-1">
        <GoalLadder variant="mobile" />
        {cta && cta.target === 'weekly' && <CanonCta cta={cta} />}
        <TodayList compact />
        {cta && cta.target !== 'weekly' && <CanonCta cta={cta} />}
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
