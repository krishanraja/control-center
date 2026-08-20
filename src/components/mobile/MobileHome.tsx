import React from 'react'
import { GoalLadder } from '../goals/GoalLadder'
import { TodayList } from '../home/TodayList'
import { VitalsLine } from '../home/VitalsLine'
import { CanonCta } from '../home/CanonCta'
import { CriticalAlertBanner } from '../CriticalAlertBanner'
import { DueTestsCard } from '../pilot/DueTestsCard'
import { Logomark } from './Logomark'
import { useAltitudes } from '../../hooks/useAltitudes'
import { useGoalCanon } from '../../hooks/useGoalCanon'
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
  const firstPaint = useFirstLoad(loading, Boolean(canon))

  const frame = 'h-[calc(100dvh/var(--z,1))] overflow-hidden flex flex-col px-5 pt-3 pb-[calc((env(safe-area-inset-bottom,0px)+148px)/var(--z,1))]'

  if (firstPaint) {
    return (
      <div className={frame}>
        <div className="shrink-0 mb-4"><Logomark size={30} /></div>
        <HomeSkeleton narrow />
      </div>
    )
  }

  const cta = alt.cta

  return (
    <div className={frame}>
      {/* Compact header: identity + the vitals line share one band. */}
      <div className="shrink-0 flex items-start gap-3 mb-2">
        <div className="pt-[2px]"><Logomark size={26} /></div>
        <div className="flex-1 min-w-0"><VitalsLine onNavigate={onNavigate} compact /></div>
      </div>

      <div className="shrink-0 flex flex-col gap-2.5">
        <CriticalAlertBanner />
        <DueTestsCard variant="mobile" />
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-3 pt-1.5">
        <GoalLadder variant="mobile" />
        {cta && cta.target === 'weekly' && <CanonCta cta={cta} />}
        <TodayList compact />
        {cta && cta.target !== 'weekly' && <CanonCta cta={cta} />}
      </div>
    </div>
  )
}
