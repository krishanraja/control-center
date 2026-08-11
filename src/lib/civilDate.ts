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
 * THE DEVICE IS THE DEFAULT, and the device is almost always right. A phone
 * that has flown to Lisbon already knows it is in Lisbon; asking the operator to
 * remember to tell the app is asking him to do the one thing travel guarantees
 * he will forget. Getting this wrong does not degrade gracefully: a check-in
 * filed at 10pm on a device pinned a few zones east lands on TOMORROW's date,
 * and the next morning the gate sees the day as already answered and never
 * appears.
 *
 * So the zone resolves as: an explicit pin if the operator set one, otherwise
 * whatever `Intl` says this device is in, re-read whenever the tab comes back to
 * the foreground. The resolved value is mirrored to system_config so the server
 * routes and the SQL views agree, but that mirror is one-way. The device tells
 * the server what day it is; the server never tells the device.
 *
 * Everything that asks "what day is it" must come through this file.
 */

export interface Zone {
  id: string
  label: string
  /** Shown under the label so the choice is legible without a map. */
  hint: string
}

/** Suggestions for the picker. NOT an allow-list: any IANA zone is legal. */
export const ZONES: Zone[] = [
  { id: 'America/New_York',  label: 'New York', hint: 'Eastern' },
  { id: 'Europe/London',     label: 'London',   hint: 'UK' },
  { id: 'Australia/Sydney',  label: 'Sydney',   hint: 'AEST' },
]

/** Last resort only, for a device whose Intl is unusable. */
export const DEFAULT_ZONE = 'America/New_York'

// v1 stored a pinned city and defaulted to New York, so every existing install
// carries a pin it never deliberately chose. A new key retires those in one
// step: everyone lands on auto, which is the behaviour they wanted all along.
const KEY = 'cc-timezone-v2'
const canUse = typeof window !== 'undefined' && typeof localStorage !== 'undefined'

/** True for any zone this runtime's Intl will actually accept. */
export function isValidZone(id: unknown): id is string {
  if (typeof id !== 'string' || !id) return false
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: id })
    return true
  } catch {
    return false
  }
}

/** What this device believes it is in, right now. */
export function deviceZone(): string {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isValidZone(z) ? z : DEFAULT_ZONE
  } catch {
    return DEFAULT_ZONE
  }
}

function readPin(): string | null {
  if (!canUse) return null
  const v = localStorage.getItem(KEY)
  return isValidZone(v) ? v : null
}

/** null means auto: follow the device. */
let pinned = readPin()
let resolved = pinned ?? deviceZone()

/** The active zone. Safe to call outside React. */
export function getZone(): string {
  return resolved
}

/** The explicit pin, or null when following the device. */
export function getPinnedZone(): string | null {
  return pinned
}

export function isAutoZone(): boolean {
  return pinned === null
}

/**
 * A readable label for any IANA zone, derived rather than looked up, because
 * the zone can now be any of the ~400 Intl knows and a hand-kept table would be
 * wrong the first time he lands somewhere it does not list.
 */
export function zoneMeta(id: string = resolved): Zone {
  const known = ZONES.find(z => z.id === id)
  if (known) return known
  const label = (id.split('/').pop() ?? id).replace(/_/g, ' ')
  let hint = ''
  try {
    hint = new Intl.DateTimeFormat('en-GB', { timeZone: id, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find(p => p.type === 'timeZoneName')?.value ?? ''
  } catch { /* label alone is enough */ }
  return { id, label, hint }
}

const listeners = new Set<() => void>()
function emit() { listeners.forEach(l => l()) }

function mirrorToServer(id: string) {
  const base = import.meta.env.VITE_API_URL ?? ''
  fetch(`${base}/api/pilot/timezone`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timezone: id }),
  }).catch(() => {})
}

/**
 * Pin a zone, or pass null to go back to following the device.
 *
 * Persists locally at once so every boundary moves in the same tick, then
 * mirrors to the server so routes and views follow. A failed mirror is
 * deliberately not fatal: the local choice still applies, and the server keeps
 * its previous value until the next successful write.
 */
export function setZone(id: string | null) {
  if (id !== null && !isValidZone(id)) return
  pinned = id
  if (canUse) {
    if (id === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, id)
  }
  resolved = pinned ?? deviceZone()
  emit()
  mirrorToServer(resolved)
}

/**
 * Re-read the device zone and, if it moved, adopt it.
 *
 * A flight is the whole reason this exists: the tab is suspended in one zone and
 * resumed in another, and nothing in a single-page app would otherwise notice.
 * A no-op while a pin is set, and a no-op when the zone has not changed, so the
 * common case costs one string comparison.
 */
export function refreshDeviceZone() {
  if (pinned !== null) return
  const next = deviceZone()
  if (next === resolved) return
  resolved = next
  emit()
  mirrorToServer(resolved)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshDeviceZone()
  })
}

/**
 * Tell the server what this device thinks the zone is, when the two disagree.
 *
 * This is the inverse of the call it replaces. The old `adoptServerZone` pushed
 * the STORED zone onto the device on every load, so a value written from the
 * laptop in New York overrode a phone that was standing in London and knew it.
 * Server-side consumers (n8n, cron, the SQL views) still need a value they can
 * read without a browser, so the mirror stays; only its direction changes.
 */
export function syncZoneToServer(serverZone: string | null | undefined) {
  if (serverZone === resolved) return
  mirrorToServer(resolved)
}

export function useZone() {
  const [, setV] = useState(0)
  useEffect(() => {
    const l = () => setV(v => v + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return { zone: resolved, meta: zoneMeta(resolved), auto: pinned === null, setZone }
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
export function civilYmd(now: Date = new Date(), zone: string = resolved): string {
  return parts(now, zone).ymd
}

/** The civil hour, 0 to 23, in the active zone. */
export function civilHour(now: Date = new Date(), zone: string = resolved): number {
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
export function weekOf(now: Date = new Date(), zone: string = resolved): string {
  const p = parts(now, zone)
  return shiftYmd(p.ymd, -(DOW[p.weekday] ?? 0))
}

export function isMonday(now: Date = new Date(), zone: string = resolved): boolean {
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
export function dayStartUtc(ymd: string, zone: string = resolved): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const midnight = Date.UTC(y, m - 1, d, 0, 0, 0)
  const first = midnight + offsetMs(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)), zone)
  return new Date(midnight + offsetMs(new Date(first), zone))
}

/** The UTC instant at which a civil date ends, exclusive. */
export function dayEndUtc(ymd: string, zone: string = resolved): Date {
  return dayStartUtc(shiftYmd(ymd, 1), zone)
}

/** Whole days between two instants, measured on civil dates. */
export function daysBetween(from: Date, to: Date = new Date(), zone: string = resolved): number {
  const a = dayStartUtc(civilYmd(from, zone), zone).getTime()
  const b = dayStartUtc(civilYmd(to, zone), zone).getTime()
  return Math.round((b - a) / 86_400_000)
}
