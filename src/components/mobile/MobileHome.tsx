import React, { useState } from 'react'
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
import { ObjectivesPanel } from '../objectives/ObjectivesPanel'
import { DailyDriver } from '../focus/DailyDriver'
import { GlanceHeader } from '../home/GlanceHeader'
import { DecisionsInbox } from '../home/DecisionsInbox'
import { BetsStrip } from '../home/BetsStrip'
import { CalibrationCard } from '../home/CalibrationCard'
import { PulseGroup } from '../home/PulseGroup'
import { AltitudeSpine, StaleHeaderCue } from '../home/AltitudeSpine'
import { BoardDaily } from '../home/BoardDaily'
import { isHomeV2Enabled, isFocusRitualEnabled } from '../../lib/homeV2'
import { ShipLedgerCard } from '../pilot/ShipLedgerCard'

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
export function MobileHome({ onNavigate }: { onNavigate?: NavigateFn } = {}) {
  const h = useHaptics()
  const { intel } = useHomeIntelligence()
  const [openSignal, setOpenSignal] = useState<ExternalSignal | null>(null)

  const signals = intel.external_signals
  const topThree = intel.top_three
  const v2 = isHomeV2Enabled()

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

  // ── Focus Ritual: the unified spine + read-only board. Deciding lives in the
  // ritual (mounted at App level); the board only tracks, surfaces what's waiting,
  // and keeps the passive pulse below.
  if (ritualOn) {
    return (
      <MobileShellPrim header={<TabHeader leading={<Logomark size={56} />} trailing={<StaleHeaderCue />} />}>
        <CriticalAlertBanner />
        {/* SHIP LEDGER: what left the machine. First, and always neutral. */}
        <ShipLedgerCard variant="mobile" />

        {/* SPINE — portfolio / week / today as the hero cards. "Set what's stale"
            now lives in the header (StaleHeaderCue) so the cards own the screen. */}
        <AltitudeSpine variant="mobile" onNavigate={onNavigate} showStaleCta={false} />

        {/* THE DAY — track today's 3 and close; the picker lives in the ritual. */}
        <BoardDaily />

        {/* ACTION INBOX — what's waiting on you, acted on in one tap. */}
        <DecisionsInbox onNavigate={onNavigate} />

        {/* THE AMBIENT ROOM: money / pipeline / momentum. Informs, never
            asks; collapsed below the action loop. */}
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

  if (v2) {
    return (
      <MobileShellPrim header={<TabHeader leading={<Logomark size={56} />} />}>
        <CriticalAlertBanner />
        {/* SHIP LEDGER: what left the machine. First, and always neutral. */}
        <ShipLedgerCard variant="mobile" />

        {/* GLANCE — the five-second answer: money / today / waiting. */}
        <GlanceHeader variant="mobile" onNavigate={onNavigate} />

        {/* DAILY SPINE — frame, lock 3, track, close. */}
        <div id="daily-driver" className="scroll-mt-4">
          <DailyDriver />
        </div>

        {/* ACTION INBOX: your decisions, acted on in one tap. */}
        <DecisionsInbox onNavigate={onNavigate} />

        {/* THE AMBIENT ROOM: the week + money / pipeline / momentum. Informs,
            never asks; collapsed below the action loop. */}
        <PulseGroup>
          <ObjectivesPanel variant="mobile" collapsible />
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
      header={<TabHeader leading={<Logomark size={56} />} />}
    >
      <CriticalAlertBanner />
      {/* SHIP LEDGER: what left the machine. First, and always neutral. */}
      <ShipLedgerCard variant="mobile" />

      {/* MONEY MACHINE — live pulse with sparkline. */}
      <MrrTicker variant="mobile" />

      {/* OBJECTIVE LAYER: Krish's multi-week unlocks. The week frames the day. */}
      <ObjectivesPanel variant="mobile" />

      {/* DAILY SPINE — one journey: frame, lock 3, track, close. */}
      <DailyDriver />

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
