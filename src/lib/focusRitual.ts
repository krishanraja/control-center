import { useEffect, useState } from 'react'
import type { AltitudeId } from '../hooks/useAltitudes'

// Tiny module-level open-state bus for the Focus Ritual. The AltitudeSpine (deep
// inside the Home shells) calls openFocusRitual(); the FocusRitual (mounted once
// at App level so it z-stacks above both shells) subscribes via useFocusRitualOpen.
// Mirrors the singleton/listener pattern used by the shared data hooks (ADR-002)
// so we avoid threading open state through App and every shell.

interface OpenState {
  open: boolean
  // Which altitude to land on first. null = start at the first pending altitude.
  startAt: AltitudeId | null
}

let state: OpenState = { open: false, startAt: null }
const listeners = new Set<() => void>()
function notify() { for (const l of listeners) l() }

export function openFocusRitual(startAt: AltitudeId | null = null): void {
  state = { open: true, startAt }
  notify()
}

export function closeFocusRitual(): void {
  state = { open: false, startAt: null }
  notify()
}

export function useFocusRitualOpen(): OpenState {
  const [, setV] = useState(0)
  useEffect(() => {
    const l = () => setV(v => v + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return state
}
