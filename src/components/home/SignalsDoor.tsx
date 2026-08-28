import React, { useMemo, useState } from 'react'
import { Activity } from '@/lib/icons'
import { HomeDoor } from './HomeDoor'
import { rankSignals } from '../intel/SignalSheet'
import { SignalsDrawer } from './SignalsDrawer'
import { useHomeIntelligence } from '../../hooks/useHomeIntelligence'
import { useHaptics } from '../../hooks/useHaptics'

/**
 * The door into the external head space — and nothing but a door. Market
 * intelligence never renders on Home itself (Krish's call: internal and
 * external must not share a surface), so this is doorway language only: a
 * word, a tile, and it opens the signals drawer where the whole condensed
 * feed lives.
 *
 * A permanent peer in the normalised doors panel (see HomeDoor), beside Intel.
 * It used to appear only when Marcus's digest was fresh and hot, but a panel
 * that gains and loses a button is the opposite of normalised — so the door is
 * always here, and a quiet feed shows its own honest empty state inside the
 * drawer. A hot signal earns the one sanctioned mark: an amber status dot,
 * never a count.
 */
export function SignalsDoor({ compact = false }: { compact?: boolean } = {}) {
  const h = useHaptics()
  const { intel } = useHomeIntelligence()
  const [open, setOpen] = useState(false)

  const ranked = useMemo(() => rankSignals(intel.external_signals), [intel.external_signals])
  const hot = ranked.some(s => s.urgency === 'critical' || s.urgency === 'high')

  return (
    <>
      <HomeDoor
        icon={Activity}
        label={compact ? 'Signals' : 'Market signals'}
        testId="signals-door"
        compact={compact}
        ariaHasPopup="dialog"
        dot={hot ? 'amber' : null}
        dotTestId="signals-door-dot"
        dotLabel="a hot market signal is waiting"
        onClick={() => { h.select(); setOpen(true) }}
      />
      <SignalsDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}
