import { useEffect, useState } from 'react'
import { getZone } from './civilDate'

/**
 * Which city the attend lane is filtered to.
 *
 * The twin of src/lib/civilDate.ts and deliberately NOT the same contract on one
 * point, which is the whole reason this is a separate file rather than a field on
 * that one.
 *
 * civilDate lets the DEVICE win, because a phone that has flown to Lisbon
 * already knows it is in Lisbon, and asking the operator to remember to tell the
 * app is asking him to do the one thing travel guarantees he will forget.
 *
 * A city is not a timezone. Opening a laptop in an airport lounge should not
 * silently re-point the event list at that airport, and a fortnight in London
 * with a New York base is a judgement no device can make. A wrong city here does
 * not degrade gracefully either: it filters the lane to a city he is not in, and
 * every event he could actually reach reads as "away".
 *
 * So: the timezone provides the first SUGGESTION and nothing more. The value only
 * ever changes because he pressed something. Away cities are never hidden, only
 * ranked below home ones, so a wrong choice costs him ordering rather than rows.
 */

export type HomeCity = 'london' | 'new_york' | 'sydney'

export interface CityOption {
  id: HomeCity
  label: string
  /** Shown under the label so the choice is legible without a map. */
  hint: string
  /** Sydney is a button press, never a resting state (architecture doc §3). */
  temporary?: boolean
}

export const CITIES: CityOption[] = [
  { id: 'new_york', label: 'New York', hint: 'Eastern' },
  { id: 'london', label: 'London', hint: 'UK' },
  { id: 'sydney', label: 'Sydney', hint: 'AEST', temporary: true },
]

export const DEFAULT_CITY: HomeCity = 'new_york'

const KEY = 'cc-home-city-v1'
const canUse = typeof window !== 'undefined' && typeof localStorage !== 'undefined'

export function isHomeCity(v: unknown): v is HomeCity {
  return typeof v === 'string' && CITIES.some(c => c.id === v)
}

/** The city this device's timezone implies, when it implies one. */
export function cityFromZone(zone: string = getZone()): HomeCity | null {
  if (zone === 'Europe/London') return 'london'
  if (zone === 'America/New_York') return 'new_york'
  if (zone === 'Australia/Sydney') return 'sydney'
  return null
}

function read(): HomeCity | null {
  if (!canUse) return null
  try {
    const v = localStorage.getItem(KEY)
    return isHomeCity(v) ? v : null
  } catch {
    // A private window or blocked site data throws rather than returning null.
    return null
  }
}

/**
 * The stored choice, or the one the zone implies, or the default.
 *
 * Note the order: a stored choice always wins, because he made it on purpose and
 * a later flight must not overrule him. The zone is consulted only when he has
 * never chosen, which is exactly the "first load" case where guessing beats
 * asking.
 */
let chosen = read()
let resolved: HomeCity = chosen ?? cityFromZone() ?? DEFAULT_CITY

export function getHomeCity(): HomeCity {
  return resolved
}

export function getChosenCity(): HomeCity | null {
  return chosen
}

export function cityMeta(id: HomeCity = resolved): CityOption {
  return CITIES.find(c => c.id === id) ?? CITIES[0]
}

export function cityLabel(id: string | null | undefined): string {
  if (!id) return 'Unknown'
  const known = CITIES.find(c => c.id === id)
  if (known) return known.label
  if (id === 'virtual') return 'Online'
  if (id === 'other') return 'Elsewhere'
  return id
}

const listeners = new Set<() => void>()
function emit() { listeners.forEach(l => l()) }

function mirrorToServer(id: HomeCity) {
  const base = import.meta.env.VITE_API_URL ?? ''
  fetch(`${base}/api/pilot/home-city`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city: id }),
  }).catch(() => {})
}

/**
 * Choose a city.
 *
 * Persists locally first so the lane re-filters in the same tick, then mirrors to
 * the server so the cron and SQL agree. A failed mirror is not fatal: the local
 * choice still applies and the server keeps its previous value until the next
 * successful write. Same trade as setZone().
 */
export function setHomeCity(id: HomeCity) {
  if (!isHomeCity(id)) return
  chosen = id
  if (canUse) {
    try { localStorage.setItem(KEY, id) } catch { /* the choice still applies this session */ }
  }
  resolved = id
  emit()
  mirrorToServer(id)
}

/** Subscribe to city changes. Mirrors useZone() in civilDate.ts. */
export function useHomeCity() {
  const [city, setCity] = useState<HomeCity>(resolved)
  useEffect(() => {
    const l = () => setCity(resolved)
    listeners.add(l)
    l()
    return () => { listeners.delete(l) }
  }, [])
  return {
    city,
    setCity: setHomeCity,
    meta: cityMeta(city),
    /** True while he has never chosen and we are going on the timezone. */
    inferred: chosen === null,
  }
}
