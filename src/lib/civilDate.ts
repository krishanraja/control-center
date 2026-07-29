import { useEffect, useState } from 'react'

/**
 * One clock for the whole product.
 *
 * This replaces three disagreeing implementations: londonDate.ts (Europe/London,
 * used by the focus spine), pilotDay.ts (America/New_York, used by the pilot
 * layer), and a bare `toISOString().slice(0,10)` UTC key used for
 * daily_focus.focus_date. Those could and did disagree: useAltitudes would
 * believe today's focus was unset while daily_focus held a row for it, and a
 * check-in filed at 9am London landed on the previous Eastern day.
 *
 * The zone is a user setting, persisted to localStorage for instant reads and
 * mirrored to system_config so the server routes and the SQL views agree. It
 * follows the pub/sub shape of theme.ts, which is the established pattern here
 * for a global switch every surface must react to.
 *
 * Everything that asks "what day is it" must come through this file.
 */

export interface Zone {
  id: string
  label: string
  /** Shown under the label so the choice is legible without a map. */
  hint: string
}

export const ZONES: Zone[] = [
  { id: 'America/New_York',  label: 'New York', hint: 'Eastern' },
  { id: 'Europe/London',     label: 'London',   hint: 'UK' },
  { id: 'Australia/Sydney',  label: 'Sydney',   hint: 'AEST' },
]

export const DEFAULT_ZONE = 'America/New_York'

const KEY = 'cc-timezone'
const canUse = typeof window !== 'undefined' && typeof localStorage !== 'undefined'

function read(): string {
  if (!canUse) return DEFAULT_ZONE
  const v = localStorage.getItem(KEY)
  return v && ZONES.some(z => z.id === v) ? v : DEFAULT_ZONE
}

let current = read()

/** The active zone. Safe to call outside React. */
export function getZone(): string {
  return current
}

export function zoneMeta(id: string = current): Zone {
  return ZONES.find(z => z.id === id) ?? ZONES[0]
}

const listeners = new Set<() => void>()
function emit() { listeners.forEach(l => l()) }

/**
 * Change the zone. Persists locally at once so every boundary moves in the same
 * tick, then mirrors to the server so routes and views follow. A failed mirror
 * is deliberately not fatal: the local choice still applies, and the server
 * keeps its previous value until the next successful write.
 */
export function setZone(id: string) {
  if (!ZONES.some(z => z.id === id)) return
  current = id
  if (canUse) localStorage.setItem(KEY, id)
  emit()
  const base = import.meta.env.VITE_API_URL ?? ''
  fetch(`${base}/api/pilot/timezone`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timezone: id }),
  }).catch(() => {})
}

export function useZone() {
  const [, setV] = useState(0)
  useEffect(() => {
    const l = () => setV(v => v + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return { zone: current, meta: zoneMeta(current), setZone }
}

/**
 * Adopt the server's stored zone when it differs from this device. Called once
 * on load with the value the check-in route already returns, so a zone set on
 * the laptop shows up on the phone without a second round trip.
 */
export function adoptServerZone(id: string | null | undefined) {
  if (!id || !ZONES.some(z => z.id === id) || id === current) return
  current = id
  if (canUse) localStorage.setItem(KEY, id)
  emit()
}

// ── Civil date maths ─────────────────────────────────────────────────────────

interface Parts { ymd: string; weekday: string; hour: number }

function parts(now: Date, zone: string): Parts {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', hour12: false,
  }).formatToParts(now)
  const get = (t: string) => f.find(p => p.type === t)?.value || ''
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: get('weekday'),
    // hour12:false renders midnight as 24 in some engines.
    hour: Number(get('hour')) % 24,
  }
}

/** Today's civil date as YYYY-MM-DD in the active zone. */
export function civilYmd(now: Date = new Date(), zone: string = current): string {
  return parts(now, zone).ymd
}

/** The civil hour, 0 to 23, in the active zone. */
export function civilHour(now: Date = new Date(), zone: string = current): number {
  return parts(now, zone).hour
}

/** Shift a YYYY-MM-DD by whole days. Built at noon UTC so DST cannot shift it. */
export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

const DOW: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

/** Monday of the current civil week, as YYYY-MM-DD. */
export function weekOf(now: Date = new Date(), zone: string = current): string {
  const p = parts(now, zone)
  return shiftYmd(p.ymd, -(DOW[p.weekday] ?? 0))
}

export function isMonday(now: Date = new Date(), zone: string = current): boolean {
  return parts(now, zone).weekday === 'Mon'
}

/** Milliseconds to add to a wall-clock time in `zone` to get UTC. */
function offsetMs(at: Date, zone: string): number {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(at)
  const get = (t: string) => Number(f.find(p => p.type === t)?.value || '0')
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return at.getTime() - asUtc
}

/**
 * The UTC instant at which a civil date begins in the active zone.
 *
 * Two passes, because one is wrong twice a year. Probing the offset at noon and
 * applying it to midnight breaks on a DST transition day: on 25 Oct 2026 London
 * is BST at midnight but GMT by noon, so a single pass put the day boundary an
 * hour late and every row filed in that hour landed on the wrong date. The
 * second pass re-reads the offset at the approximate midnight and corrects it.
 */
export function dayStartUtc(ymd: string, zone: string = current): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const midnight = Date.UTC(y, m - 1, d, 0, 0, 0)
  const first = midnight + offsetMs(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)), zone)
  return new Date(midnight + offsetMs(new Date(first), zone))
}

/** The UTC instant at which a civil date ends, exclusive. */
export function dayEndUtc(ymd: string, zone: string = current): Date {
  return dayStartUtc(shiftYmd(ymd, 1), zone)
}

/** Whole days between two instants, measured on civil dates. */
export function daysBetween(from: Date, to: Date = new Date(), zone: string = current): number {
  const a = dayStartUtc(civilYmd(from, zone), zone).getTime()
  const b = dayStartUtc(civilYmd(to, zone), zone).getTime()
  return Math.round((b - a) / 86_400_000)
}
