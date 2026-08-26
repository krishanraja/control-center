import React from 'react'
import { MobileShell, TabHeader, HeaderSubtitleSkeleton, MobileLoadingScreen } from '../mobile/primitives'
import { AskMarcus } from '../AskMarcus'
import { KpiBand } from './KpiBand'
import { MarcusReadCard } from './MarcusReadCard'
import { SpendConnectionsPanel } from './SpendConnectionsPanel'
import { FleetFunnelPanel } from './FleetFunnelPanel'
import { useHomeIntelligence } from '../../hooks/useHomeIntelligence'
import { humanAge } from '../../lib/ageHelpers'

/**
 * Business Intelligence — the INTERNAL head space, one console tree for both
 * shells: how the operator's own system is doing. Five deterministic numbers
 * up top (money out, money in, APIs, funnel, bets), each drilling into its
 * sheet; Marcus's read on the business; the spend and fleet detail; Ask
 * Marcus docked last as the conversation.
 *
 * External market intelligence deliberately does NOT render here — different
 * head space (Krish's call at the mock gate, 2026-08-25). What the outside
 * world is doing lives condensed off Home: the conditional SignalCards row
 * and the signals drawer behind it.
 *
 * This replaced the old fork where MobileIntel and DesktopExec were two
 * different products sharing 4 of ~12 blocks; shells now differ only in
 * wrapper grammar (MobileShell + TabHeader vs the canonical desktop h1
 * stack) — section order, hooks and sheet state exist exactly once.
 */
export function BusinessIntelTab({ narrow }: { narrow: boolean }) {
  const { intel, loading } = useHomeIntelligence()

  const headline = intel.summary?.headline || null
  const age = humanAge(intel.generated_at)
  const fallbackSub = 'The scoreboard, Marcus’s read, your money and your bets.'
  const subtitleText = headline
    || (intel.generated_at ? (age === 'just now' ? 'Updated just now' : `Updated ${age} ago`) : fallbackSub)

  if (narrow && loading && !intel.generated_at) {
    return <MobileLoadingScreen title="Business Intelligence" />
  }

  const body = (
    <>
      <KpiBand narrow={narrow} />
      <MarcusReadCard narrow={narrow} />
      <SpendConnectionsPanel narrow={narrow} />
      <FleetFunnelPanel narrow={narrow} />
      {/* The conversation, docked last — renders in every state, including
          empty: asking a pointed question is always available. */}
      <div className="shrink-0">
        <AskMarcus narrow={narrow} />
      </div>
    </>
  )

  if (narrow) {
    return (
      <MobileShell
        header={
          <TabHeader
            title="Business Intelligence"
            wrap
            subtitle={loading && !headline ? <HeaderSubtitleSkeleton w={176} /> : subtitleText}
          />
        }
      >
        {body}
      </MobileShell>
    )
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-5 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl xl:text-heading font-semibold text-white tracking-tight">Business Intelligence</h1>
        <p className="text-xs md:text-body text-white/50 mt-0.5">{subtitleText}</p>
      </div>
      {body}
    </div>
  )
}
