import React, { useState } from 'react'
import { GoalLadder } from '../goals/GoalLadder'
import {
  MobileShell as MobileShellPrim,
  TabHeader,
  FeedCard,
  FeedRow,
  EmptyState,
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
import { DailyDriver } from '../focus/DailyDriver'
import { GlanceHeader } from '../home/GlanceHeader'
import { DecisionsInbox } from '../os/queue/DecisionsInbox'
import { BetsStrip } from '../home/BetsStrip'
import { CalibrationCard } from '../os/queue/CalibrationCard'
import { PulseGroup } from '../home/PulseGroup'
import { useRealtimeDecisionsWaiting } from '../../hooks/useRealtimeDecisionsWaiting'
import { splitDecisions } from '../../lib/decisionKinds'
import { AltitudeSpine, StaleHeaderCue } from '../home/AltitudeSpine'
import { BoardDaily } from '../home/BoardDaily'
import { GrowthScoreboard } from '../home/GrowthScoreboard'
import { isGrowthScoreboardEnabled } from '../../hooks/useGrowthMetrics'
import { isSimplifiedIA } from '../../lib/iaV3'
import { isHomeV2Enabled, isFocusRitualEnabled } from '../../lib/homeV2'
import { ShipLedgerCard } from '../pilot/ShipLedgerCard'
import { DueTestsCard } from '../pilot/DueTestsCard'
import { HomeSkeleton } from '../shared/Skeleton'
import { useFirstLoad } from '../shared/useDeferredPending'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * Mission Control on mobile. Same surfaces as desktop, single column, with
 * haptics on every primary action and a bottom-sheet detail pattern for
 * external signals.
 *
 * HomeV2 (VITE_HOME_V2_ENABLED) reorders Home around the daily action loop:
 * a glance header (money / today / decisions) → the daily spine → the action
 * inbox (typed decisions with one-tap actions, queue chips for the pools) →
 * the ambient fold (the week + everything glanceable-but-passive, collapsed).
 * The legacy stack is kept as the fallback until the flag is dogfooded.
 */
export function MobileHome({ onNavigate, deepTask = null, deepDecision = null }: {
  onNavigate?: NavigateFn
  /** Legacy #/today deep links, forwarded by the simplified-IA alias layer. */
  deepTask?: string | null
  deepDecision?: string | null
} = {}) {
  const h = useHaptics()
  const { intel, loading } = useHomeIntelligence()
  const [openSignal, setOpenSignal] = useState<ExternalSignal | null>(null)
  // The ruling queue lives on OS → Queue now; Home shows only the count.
  const { decisions: allDecisionRows } = useRealtimeDecisionsWaiting()
  const decisionCount = splitDecisions(allDecisionRows).decisions.length

  const signals = intel.external_signals
  const topThree = intel.top_three
  const v2 = isHomeV2Enabled()

  // Home is the landing route, and it had no loading gate at all. It composes
  // about fifteen independently-loading children, six of which returned null
  // while they waited, so every cold load was a sequence of small shoves: a
  // banner appeared, the spine pushed it down, the ladder pushed it down again.
  //
  // One placeholder in the page's real proportions instead. Gated so a warm
  // cache paints straight through without a flash, and so the placeholder never
  // replaces content that is already on screen.
  const firstPaint = useFirstLoad(loading, Boolean(intel.generated_at))

  const ritualOn = isFocusRitualEnabled()

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

  // One gate above every branch, so the ritual, v2 and legacy stacks all settle
  // the same way rather than each inventing a first paint.
  if (firstPaint) {
    return (
      <MobileShellPrim header={<TabHeader leading={<Logomark size={36} />} />}>
        <HomeSkeleton narrow />
      </MobileShellPrim>
    )
  }

  // ── Focus Ritual: the unified spine + read-only board. Deciding lives in the
  // ritual (mounted at App level); the board only tracks, surfaces what's waiting,
  // and keeps the passive pulse below.
  if (ritualOn) {
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

  if (v2) {
    return (
      <MobileShellPrim header={<TabHeader leading={<Logomark size={36} />} />}>
        <CriticalAlertBanner />
        {/* SHIP LEDGER: what left the machine. First, and always neutral. */}
        <ShipLedgerCard variant="mobile" />
        <DueTestsCard variant="mobile" />

        {/* GLANCE — the five-second answer: money / today / waiting. */}
        <GlanceHeader variant="mobile" onNavigate={onNavigate} />

        {/* GROWTH SCOREBOARD — content subs / app subs / network at a glance. */}
        {isGrowthScoreboardEnabled() && <GrowthScoreboard variant="mobile" />}

        {/* DAILY SPINE — frame, lock 3, track, close. */}
        <div id="daily-driver" className="scroll-mt-4">
          <DailyDriver />
        </div>

        {/* ACTION INBOX: your decisions, acted on in one tap. */}
        <DecisionsInbox onNavigate={onNavigate} deepTask={deepTask} deepDecision={deepDecision} />

        {/* THE GOAL LADDER: asks for input, so it sits above the fold. */}
        <GoalLadder variant="mobile" />

        {/* THE AMBIENT ROOM: money / pipeline / momentum. Informs,
            never asks; collapsed below the action loop. */}
        <PulseGroup>
          <MrrTicker variant="mobile" />
          <RoomPreviews onNavigate={onNavigate} variant="mobile" />
          <CalibrationCard />
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

  // ── Legacy Home (fallback while HomeV2 is gated off) ──────────────────────
  return (
    <MobileShellPrim
      header={<TabHeader leading={<Logomark size={36} />} />}
    >
      <CriticalAlertBanner />
      {/* SHIP LEDGER: what left the machine. First, and always neutral. */}
      <ShipLedgerCard variant="mobile" />
      <DueTestsCard variant="mobile" />

      {/* MONEY MACHINE — live pulse with sparkline. */}
      <MrrTicker variant="mobile" />

      {/* THE GOAL LADDER: one place to enter a goal at any altitude. Replaced
          ObjectivesPanel + WeeklyGoals, which were two editors over one table. */}
      <GoalLadder variant="mobile" />

      {/* DAILY SPINE — one journey: frame, lock 3, track, close. */}
      <DailyDriver />

      {/* ACTION INBOX — under the simplified IA the ruling queue must exist on
          every home path (Today is gone), regardless of the home flags. */}
      {isSimplifiedIA() && <DecisionsInbox onNavigate={onNavigate} deepTask={deepTask} deepDecision={deepDecision} />}

      {/* ROOM PREVIEWS — Content / Visibility / Leads, stacked. */}
      <RoomPreviews onNavigate={onNavigate} variant="mobile" />

      {/* GRADER — one-time calibration prompt; hides once all domains are fitted. */}
      <CalibrationCard />

      {/* BETS — compact strip replacing the standalone Bets tab. */}
      <BetsStrip />

      {/* MOMENTUM — 7-day mini-bars. */}
      <MomentumStrip
        momentum={intel.momentum}
        generatedAt={intel.momentum_at ?? intel.generated_at}
        variant="mobile"
      />

      <StreakPills variant="mobile" />

      {/* WEEKLY RETRO — retro-only; the brief now lives in the daily spine. */}
      <DailyBriefBanner blocking={false} variant="mobile" retroOnly />

      {/* External signals — secondary surface, only render when present. */}
      {signalsCard}

      {/* Empty-state floor: only show if absolutely nothing has populated. */}
      {topThree.length === 0 && signals.length === 0 && !intel.daily_brief && (
        <EmptyState label="Quiet morning. Marcus will populate Top Three after the next brief run." />
      )}

      {signalSheet}
    </MobileShellPrim>
  )
}
