import React, { useState } from 'react'
import { GoalLadder } from '../goals/GoalLadder'
import { TodayList } from '../home/TodayList'
import { VitalsLine } from '../home/VitalsLine'
import { CanonCta } from '../home/CanonCta'
import { FocusDoor } from '../home/FocusDoor'
import { IntelDoor } from '../home/IntelDoor'
import { IntelDrawer } from '../home/IntelDrawer'
import { CriticalAlertBanner } from '../CriticalAlertBanner'
import { DueTestsCard } from '../pilot/DueTestsCard'
import { useAltitudes } from '../../hooks/useAltitudes'
import { useGoalCanon } from '../../hooks/useGoalCanon'
import { HomeSkeleton } from '../shared/Skeleton'
import { useFirstLoad } from '../shared/useDeferredPending'

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
  const alt = useAltitudes()
  const { canon, loading } = useGoalCanon()

  const [intelOpen, setIntelOpen] = useState(false)

  // One placeholder in the page's real proportions, so a cold load settles
  // once instead of assembling itself in public.
  const firstPaint = useFirstLoad(loading, Boolean(canon))
  if (firstPaint) return <HomeSkeleton />

  const cta = alt.cta

  return (
    <div className="h-full min-h-0 flex flex-col gap-6 [@media(max-height:820px)]:gap-3.5 max-w-[880px] mx-auto w-full">
      <div className="shrink-0 flex flex-col gap-3">
        <CriticalAlertBanner />
        {/* Intel sits beside the vitals: information belongs with information,
            and the bottom-right corner is owned by the fixed ⌘I capture pill,
            which would float over (and swallow clicks meant for) anything
            placed down there. */}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1"><VitalsLine onNavigate={onNavigate} /></div>
          <IntelDoor onOpen={() => setIntelOpen(true)} />
        </div>
        <DueTestsCard variant="desktop" />
      </div>

      <div className="shrink-0 flex flex-col gap-6 [@media(max-height:820px)]:gap-3.5 pt-1">
        <GoalLadder variant="desktop" />
        {cta && cta.target === 'weekly' && <CanonCta cta={cta} />}
        <TodayList />
        {cta && cta.target !== 'weekly' && <CanonCta cta={cta} />}
      </div>

      {/* The door into Focus: a quiet row at the bottom. Never a number. */}
      <div className="shrink-0 mt-auto">
        <FocusDoor onNavigate={onNavigate} />
      </div>

      <IntelDrawer open={intelOpen} onClose={() => setIntelOpen(false)} onNavigate={onNavigate} />
    </div>
  )
}
