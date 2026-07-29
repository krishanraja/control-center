import React, { createContext, useContext, useEffect, useMemo } from 'react'
import type { PilotCheckin, PilotMode } from '../types/pilot'
import {
  capacityFor, profileFor, isCapacityEnabled,
  DEFAULT_CAPACITY, type Capacity, type CapacityProfile,
} from '../lib/pilotCapacity'
import { setMoodSource } from '../components/shared/AmbientField'
import { applyCapacity } from '../lib/theme'

/**
 * Today's operator reading, made available to the dashboard.
 *
 * PilotGate already fetches this and, before the capacity layer, discarded it:
 * it returned children with no state attached, so no dashboard component could
 * know how the day was starting. This provider is the wire between the two.
 *
 * Fails soft, following AgentsContext: an unmounted provider, a missing
 * check-in, or a disabled flag all resolve to `steady`, which is exactly
 * today's dashboard. A broken pilot service must never degrade the app.
 */

export interface PilotStateValue {
  mode: PilotMode | null
  energy: number | null
  anxiety: number | null
  intent: string | null
  capacity: Capacity
  profile: CapacityProfile
  /** False when the flag is off, so consumers can short-circuit to today's behaviour. */
  active: boolean
}

const FALLBACK: PilotStateValue = {
  mode: null,
  energy: null,
  anxiety: null,
  intent: null,
  capacity: DEFAULT_CAPACITY,
  profile: profileFor(DEFAULT_CAPACITY),
  active: false,
}

const PilotStateContext = createContext<PilotStateValue | null>(null)

export function PilotStateProvider({
  morning,
  children,
}: {
  morning: PilotCheckin | null
  children: React.ReactNode
}) {
  const value = useMemo<PilotStateValue>(() => {
    if (!isCapacityEnabled() || !morning) return FALLBACK
    const capacity = capacityFor(morning.energy, morning.anxiety)
    return {
      mode: morning.mode,
      energy: morning.energy,
      anxiety: morning.anxiety,
      intent: morning.intent,
      capacity,
      profile: profileFor(capacity),
      active: true,
    }
  }, [morning])

  // Visual temperature is one attribute on the document root, consumed by a
  // single block in index.css. No component learns about capacity to be styled
  // by it, which is what keeps this from spreading across the codebase.
  useEffect(() => {
    applyCapacity(value.active ? value.capacity : null)
    return () => applyCapacity(null)
  }, [value.active, value.capacity])

  // The ambient tint rides the existing mood priority registry. Low priority, so
  // a critical alert (priority 10) still wins: a fire outranks a mood.
  useEffect(() => {
    if (!value.active) return
    setMoodSource('pilot-capacity', value.capacity === 'low' ? 'calm' : null, 1)
    return () => setMoodSource('pilot-capacity', null)
  }, [value.active, value.capacity])

  return <PilotStateContext.Provider value={value}>{children}</PilotStateContext.Provider>
}

/** Never throws. An absent provider means today's behaviour, unchanged. */
export function usePilotStateContext(): PilotStateValue {
  return useContext(PilotStateContext) ?? FALLBACK
}

/** Convenience for the common case: just the profile. */
export function useCapacity(): CapacityProfile {
  return usePilotStateContext().profile
}
