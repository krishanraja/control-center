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
import { useDailyFocus, isFocusEnabled } from '../../hooks/useDailyFocus'
import { useHomeIntelligence, type ExternalSignal } from '../../hooks/useHomeIntelligence'
import { MrrTicker } from '../MrrTicker'
import { DailyBriefBanner } from '../DailyBriefBanner'
import { CriticalAlertBanner } from '../CriticalAlertBanner'
import { DecisionsWaitingPanel } from '../DecisionsWaitingPanel'
import { StreakPills } from '../StreakPills'
import { TopThreeCards } from '../TopThreeCards'
import { FocusCalibrator } from '../focus/FocusCalibrator'
import { FocusBar } from '../focus/FocusBar'
import { CarryOverPrompt } from '../focus/CarryOverPrompt'
import { MomentumStrip } from '../MomentumStrip'
import { RoomPreviews } from '../RoomPreviews'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * Mission Control on mobile. Same surfaces as desktop, single column, with
 * haptics on every primary action and a bottom-sheet detail pattern for
 * external signals (kept because Marcus's external scan is useful but lives
 * below the fold once Top Three is ranked).
 */
export function MobileHome({ onNavigate }: { onNavigate?: NavigateFn } = {}) {
  const h = useHaptics()
  const { intel } = useHomeIntelligence()
  const { today: dailyFocusToday } = useDailyFocus()
  const [openSignal, setOpenSignal] = useState<ExternalSignal | null>(null)

  const signals = intel.external_signals
  const topThree = intel.top_three

  // While Krish is in the FocusCalibrator (no daily_focus row yet), TopThreeCards
  // would render Marcus's same picks a second time — confusing because the
  // calibrator above is the actionable copy. Hide it until lock; FocusCalibrator
  // owns the Marcus-picks surface until then.
  const showTopThree = !isFocusEnabled() || !!dailyFocusToday

  return (
    <MobileShellPrim
      header={<TabHeader leading={<Logomark size={56} />} />}
    >
      <CriticalAlertBanner />

      {/* MONEY MACHINE — live pulse with sparkline. */}
      <MrrTicker variant="mobile" />

      {/* DAILY FOCUS (feature flag gated). */}
      <CarryOverPrompt />
      <FocusBar />
      <FocusCalibrator />

      {/* TOP THREE — Marcus's three plays for today. Hidden while the
          calibrator is open so Marcus's picks appear once, where they're
          actionable. Re-appears as informational context after lock. */}
      {showTopThree && (
        <TopThreeCards
          cards={topThree}
          onNavigate={onNavigate}
          variant="mobile"
          generatedAt={intel.top_three_at ?? intel.generated_at}
        />
      )}

      {/* ROOM PREVIEWS — Content / Visibility / Leads, stacked. */}
      <RoomPreviews onNavigate={onNavigate} variant="mobile" />

      {/* MOMENTUM — 7-day mini-bars. */}
      <MomentumStrip
        momentum={intel.momentum}
        generatedAt={intel.momentum_at ?? intel.generated_at}
        variant="mobile"
      />

      {/* DECISIONS WAITING — compact, kind-routed. */}

      {/* DAILY BRIEF — non-blocking. Retro is a collapsible card. */}
      <DailyBriefBanner blocking={false} variant="mobile" />

      <StreakPills variant="mobile" />

      {/* External signals — secondary surface, only render when present. */}
      {signals.length > 0 && (
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
      )}

      {/* Empty-state floor: only show if absolutely nothing has populated. */}
      {topThree.length === 0 && signals.length === 0 && !intel.daily_brief && (
        <EmptyState label="Quiet morning. Marcus will populate Top Three after the next brief run." />
      )}

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
    </MobileShellPrim>
  )
}
