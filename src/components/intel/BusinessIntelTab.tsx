import React, { useState } from 'react'
import { MobileShell, TabHeader, HeaderSubtitleSkeleton, MobileLoadingScreen } from '../mobile/primitives'
import { AskMarcus } from '../AskMarcus'
import { KpiBand } from './KpiBand'
import { NextSignalHero } from './NextSignalHero'
import { MarcusReadCard } from './MarcusReadCard'
import { SignalsSection } from './SignalsSection'
import { SpendConnectionsPanel } from './SpendConnectionsPanel'
import { FleetFunnelPanel } from './FleetFunnelPanel'
import { SignalSheet } from './SignalSheet'
import { useHomeIntelligence, type ExternalSignal } from '../../hooks/useHomeIntelligence'
import { useHaptics } from '../../hooks/useHaptics'
import { humanAge } from '../../lib/ageHelpers'

/**
 * Business Intelligence — ONE console tree for both shells.
 *
 * The tab used to be two different products: MobileIntel and DesktopExec
 * shared 4 of ~12 blocks, ran two "do this next" algorithms over two
 * different tables, and desktop rendered the same Marcus content twice.
 * This is the replacement: a stat-first console — five deterministic numbers
 * up top, each drilling into its sheet; the hero, Marcus's read, and the
 * signal feed as supporting sections; Ask Marcus docked last as the
 * conversation. Shells differ only in wrapper grammar (MobileShell +
 * TabHeader vs the canonical desktop h1 stack) — section order, hooks and
 * sheet state exist exactly once.
 */
export function BusinessIntelTab({ narrow }: { narrow: boolean }) {
  const h = useHaptics()
  const { intel, loading } = useHomeIntelligence()
  const [openSignal, setOpenSignal] = useState<ExternalSignal | null>(null)

  const openSig = (s: ExternalSignal) => { h.select(); setOpenSignal(s) }

  const headline = intel.summary?.headline || null
  const age = humanAge(intel.generated_at)
  const fallbackSub = 'The scoreboard, Marcus’s read, market signals and your bets.'
  const subtitleText = headline
    || (intel.generated_at ? (age === 'just now' ? 'Updated just now' : `Updated ${age} ago`) : fallbackSub)

  if (narrow && loading && !intel.generated_at) {
    return <MobileLoadingScreen title="Business Intelligence" />
  }

  const body = (
    <>
      <KpiBand narrow={narrow} />
      <div className="shrink-0">
        <NextSignalHero signals={intel.external_signals} onOpen={openSig} narrow={narrow} />
      </div>
      <MarcusReadCard />
      <SignalsSection onOpen={openSig} />
      <SpendConnectionsPanel />
      <FleetFunnelPanel />
      {/* The conversation, docked last — renders in every state, including
          empty: asking a pointed question is always available. */}
      <div className="shrink-0">
        <AskMarcus />
      </div>
      <SignalSheet signal={openSignal} onClose={() => setOpenSignal(null)} />
    </>
  )

  if (narrow) {
    return (
      <MobileShell
        header={
          <TabHeader
            title="Business Intelligence"
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
