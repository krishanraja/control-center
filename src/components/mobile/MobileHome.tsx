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
import { DecisionsWaitingPanel } from '../DecisionsWaitingPanel'
import { StreakPills } from '../StreakPills'
import { MomentumStrip } from '../MomentumStrip'
import { RoomPreviews } from '../RoomPreviews'
import { ObjectivesPanel } from '../objectives/ObjectivesPanel'
import { DailyDriver } from '../focus/DailyDriver'

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
  const [openSignal, setOpenSignal] = useState<ExternalSignal | null>(null)

  const signals = intel.external_signals
  const topThree = intel.top_three

  return (
    <MobileShellPrim
      header={<TabHeader leading={<Logomark size={56} />} />}
    >
      <CriticalAlertBanner />

      {/* MONEY MACHINE — live pulse with sparkline. */}
      <MrrTicker variant="mobile" />

      {/* OBJECTIVE LAYER: Krish's multi-week unlocks. The week frames the day. */}
      <ObjectivesPanel variant="mobile" />

      {/* DAILY SPINE — one journey: frame, lock 3, track, close. */}
      <DailyDriver />

      {/* ROOM PREVIEWS — Content / Visibility / Leads, stacked. */}
      <RoomPreviews onNavigate={onNavigate} variant="mobile" />

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
