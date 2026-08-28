import React from 'react'
import { Compass } from '@/lib/icons'
import { HomeDoor } from './HomeDoor'
import { useHaptics } from '../../hooks/useHaptics'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

/**
 * Home's door into Focus & Purpose (docs/FOCUS-PURPOSE.md).
 *
 * Now one of the three peers in the normalised doors panel at the bottom of
 * Home (see HomeDoor). It used to be a full-width row with a description line
 * of its own, which is exactly the odd-one-out shape the panel replaced.
 *
 * The hub's rule carries over: nothing about the operator is ever counted back
 * at him from ambient chrome. No ask streak, no "3 this week", no state dot.
 */
export function FocusDoor({ onNavigate, compact = false }: {
  onNavigate?: NavigateFn
  compact?: boolean
}) {
  const h = useHaptics()
  return (
    <HomeDoor
      icon={Compass}
      label="Focus"
      testId="vitals-focus"
      compact={compact}
      onClick={() => { h.select(); onNavigate?.('focus') }}
    />
  )
}
