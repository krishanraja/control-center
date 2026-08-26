import React, { useState } from 'react'
import { SlideOver } from '../shared/SlideOver'
import { SignalsSection } from '../intel/SignalsSection'
import { SignalSheet } from '../intel/SignalSheet'
import type { ExternalSignal } from '../../hooks/useHomeIntelligence'

/**
 * The external head space, whole: every ranked signal from Marcus's digest
 * and Zara's market feed, condensed into one side drawer off Home.
 *
 * Market intelligence deliberately does NOT live on a tab. The Business
 * Intelligence console is the internal read (money, APIs, funnel, bets,
 * Marcus's read on the business); what the outside world is doing is a
 * different head space, so it stays behind the Home signal cards — glance
 * the hot ones there, open this room when you want the full board. Acting
 * stays one tap: a signal opens the same sheet everywhere (task or bet).
 */
export function SignalsDrawer({ open, onClose }: {
  open: boolean
  onClose: () => void
}) {
  const [openSignal, setOpenSignal] = useState<ExternalSignal | null>(null)

  return (
    <SlideOver open={open} onClose={onClose} ariaLabel="Market signals" label="Market signals">
      <div className="flex flex-col gap-5">
        <SignalsSection onOpen={setOpenSignal} />
      </div>
      <SignalSheet signal={openSignal} onClose={() => setOpenSignal(null)} />
    </SlideOver>
  )
}
