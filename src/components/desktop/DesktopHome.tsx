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
import { useSpend, spendAlert } from '../../hooks/useSpend'
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
  const { spend } = useSpend()
  const intelAlert = spendAlert(spend)

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
        <VitalsLine onNavigate={onNavigate} />
        <DueTestsCard variant="desktop" />
      </div>

      <div className="shrink-0 flex flex-col gap-6 [@media(max-height:820px)]:gap-3.5 pt-1">
        <GoalLadder variant="desktop" />
        {cta && cta.target === 'weekly' && <CanonCta cta={cta} />}
        <TodayList />
        {cta && cta.target !== 'weekly' && <CanonCta cta={cta} />}
      </div>

      {/* The doors row: Intel's pill sits beside Focus's quiet row. Never a
          number on either (Intel's status dot is the one sanctioned
          exception). Intel takes the left slot because the bottom-right
          corner is owned by the fixed ⌘I capture pill, which floats over —
          and would swallow clicks meant for — a small target placed there. */}
      <div className="shrink-0 mt-auto flex items-center gap-3">
        <IntelDoor onOpen={() => setIntelOpen(true)} alert={intelAlert} />
        <div className="min-w-0 flex-1"><FocusDoor onNavigate={onNavigate} /></div>
      </div>

      <IntelDrawer open={intelOpen} onClose={() => setIntelOpen(false)} onNavigate={onNavigate} />
    </div>
  )
}
