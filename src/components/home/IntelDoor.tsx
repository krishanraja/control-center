import React from 'react'
import { Radar } from '@/lib/icons'
import { HomeDoor } from './HomeDoor'
import { useHaptics } from '../../hooks/useHaptics'

/**
 * Home's door into the Business Intelligence console (OS → Intel): the
 * internal head space — money, APIs, funnel, bets, Marcus's read. One of the
 * three peers in the normalised doors panel (see HomeDoor); this is also the
 * detail path off the critical alert — the alert is a one-line nudge, the
 * console is where the "why" lives.
 *
 * One sanctioned exception to the no-number rule (Krish's explicit call,
 * 2026-08-25): a status dot — never a number — when a connection is broken
 * (rose) or money needs a look: low credits, an annual renewal closing in, or
 * spend ballooning (amber). The dot says "open me", the console says why.
 */
export function IntelDoor({ onOpen, alert = null, compact = false }: {
  onOpen: () => void
  alert?: 'amber' | 'rose' | null
  compact?: boolean
}) {
  const h = useHaptics()
  return (
    <HomeDoor
      icon={Radar}
      label="Intel"
      testId="intel-door"
      compact={compact}
      dot={alert}
      dotTestId="intel-door-dot"
      dotLabel={alert === 'rose' ? 'a connection is broken' : 'money needs a look'}
      onClick={() => { h.select(); onOpen() }}
    />
  )
}
