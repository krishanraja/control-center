import React, { useState } from 'react'
import { GoalLadder } from '../goals/GoalLadder'
import {
  MobileShell as MobileShellPrim,
  TabHeader,
  FeedCard,
  FeedRow,
} from './primitives'
import { DetailSheet } from './DetailSheet'
import { Logomark } from './Logomark'
import { useHaptics } from '../../hooks/useHaptics'
import { useHomeIntelligence, type ExternalSignal } from '../../hooks/useHomeIntelligence'
import { MrrTicker } from '../MrrTicker'
import { DailyBriefBanner } from '../DailyBriefBanner'
import { CriticalAlertBanner } from '../CriticalAlertBanner'
import { StreakPills } from '../StreakPills'
import { MomentumStrip } from '../MomentumStrip'
import { RoomPreviews } from '../RoomPreviews'
import { BetsStrip } from '../home/BetsStrip'
import { PulseGroup } from '../home/PulseGroup'
import { useRealtimeDecisionsWaiting } from '../../hooks/useRealtimeDecisionsWaiting'
import { splitDecisions } from '../../lib/decisionKinds'
import { AltitudeSpine, StaleHeaderCue } from '../home/AltitudeSpine'
import { BoardDaily } from '../home/BoardDaily'
import { GrowthScoreboard } from '../home/GrowthScoreboard'
import { isGrowthScoreboardEnabled } from '../../hooks/useGrowthMetrics'
import { ShipLedgerCard } from '../pilot/ShipLedgerCard'
import { DueTestsCard } from '../pilot/DueTestsCard'
import { HomeSkeleton } from '../shared/Skeleton'
import { useFirstLoad } from '../shared/useDeferredPending'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * Home on mobile: where Krish locks in on what matters. The canon (OS goals →
 * this week's objectives → today's 3) owns the screen; the ruling queue lives
 * on OS → Queue and Home carries only its count.
 */
export function MobileHome({ onNavigate }: {
  onNavigate?: NavigateFn
} = {}) {
  const h = useHaptics()
  const { intel, loading } = useHomeIntelligence()
  const [openSignal, setOpenSignal] = useState<ExternalSignal | null>(null)
  // The ruling queue lives on OS → Queue now; Home shows only the count.
  const { decisions: allDecisionRows } = useRealtimeDecisionsWaiting()
  const decisionCount = splitDecisions(allDecisionRows).decisions.length

  const signals = intel.external_signals

  // Home is the landing route, and it had no loading gate at all. It composes
  // about fifteen independently-loading children, six of which returned null
  // while they waited, so every cold load was a sequence of small shoves: a
  // banner appeared, the spine pushed it down, the ladder pushed it down again.
  //
  // One placeholder in the page's real proportions instead. Gated so a warm
  // cache paints straight through without a flash, and so the placeholder never
  // replaces content that is already on screen.
  const firstPaint = useFirstLoad(loading, Boolean(intel.generated_at))

  const signalsCard = signals.length > 0 && (
    <FeedCard title={`Signals · ${signals.length}`}>
      {signals.slice(0, 5).map((sig, i) => (
        <FeedRow
          key={i}
          dotColor="bg-amber-400"
          title={sig.signal}
          detail={sig.relevance}
          onClick={() => { h.select(); setOpenSignal(sig) }}
        />
      ))}
    </FeedCard>
  )

  const signalSheet = (
    <DetailSheet
      open={openSignal != null}
      onClose={() => setOpenSignal(null)}
      eyebrow={openSignal?.source || 'Marcus signal'}
      title={openSignal?.signal || ''}
      body={
        openSignal
          ? [
              openSignal.relevance ? `Why it matters: ${openSignal.relevance}` : null,
              openSignal.recommended_action ? `Recommended move: ${openSignal.recommended_action}` : null,
            ].filter(Boolean).join('\n\n')
          : undefined
      }
      agent="marcus"
      actions={
        openSignal
          ? [
              {
                label: 'Open Intelligence',
                variant: 'primary',
                onClick: () => { h.tap(); onNavigate?.('exec'); setOpenSignal(null) },
              },
            ]
          : []
      }
    />
  )

  // One gate above the return, so a cold load settles once instead of
  // inventing a first paint per child.
  if (firstPaint) {
    return (
      <MobileShellPrim header={<TabHeader leading={<Logomark size={36} />} />}>
        <HomeSkeleton narrow />
      </MobileShellPrim>
    )
  }

  return (
      <MobileShellPrim header={<TabHeader leading={<Logomark size={36} />} trailing={<StaleHeaderCue />} />}>
        <CriticalAlertBanner />
        {/* SHIP LEDGER: what left the machine. First, and always neutral. */}
        <ShipLedgerCard variant="mobile" />
        <DueTestsCard variant="mobile" />

        {/* SPINE — portfolio / week / today as the hero cards. "Set what's stale"
            now lives in the header (StaleHeaderCue) so the cards own the screen. */}
        <AltitudeSpine variant="mobile" onNavigate={onNavigate} showStaleCta={false} />

        {/* THE GOAL LADDER. The live mobile branch had no goal surface at all,
            so goals could only be entered on desktop. Same single editor, same
            four rungs, above the ambient fold. */}
        <GoalLadder variant="mobile" />

        {/* GROWTH SCOREBOARD — content subs / app subs / network at a glance. */}
        {isGrowthScoreboardEnabled() && <GrowthScoreboard variant="mobile" />}

        {/* THE DAY — track today's 3 and close; the picker lives in the ritual. */}
        <BoardDaily />

        {/* THE QUEUE moved to OS → Queue; Home carries only the count.
            (Interim line — absorbed into the vitals strip in the recompose.) */}
        {decisionCount > 0 && (
          <button
            type="button"
            onClick={() => { h.tap(); onNavigate?.('os', { sub: 'queue' }) }}
            className="self-start px-2 py-1 text-[12px] text-white/50 hover:text-white/85 transition-colors"
          >
            {decisionCount} waiting on you · clear the queue →
          </button>
        )}

        {/* THE AMBIENT ROOM: money / pipeline / momentum. Informs, never
            asks; collapsed below the action loop. */}
        <PulseGroup>
          <MrrTicker variant="mobile" />
          <RoomPreviews onNavigate={onNavigate} variant="mobile" />
          <BetsStrip />
          <MomentumStrip
            momentum={intel.momentum}
            generatedAt={intel.momentum_at ?? intel.generated_at}
            variant="mobile"
          />
          <StreakPills variant="mobile" />
          <DailyBriefBanner blocking={false} variant="mobile" retroOnly />
          {signalsCard}
        </PulseGroup>

        {signalSheet}
      </MobileShellPrim>
  )
}
