// Civil-date helpers for the pilot layer, in the operator's own zone regardless
// of device timezone, so the morning gate opens with his morning and the evening
// shutdown prompts at his 5pm rather than a UTC boundary.
//
// Note: the rest of the app (src/lib/londonDate.ts, used by useWeeklyFocus,
// useAltitudes, FocusRitual) runs on Europe/London. The pilot layer runs on
// Eastern. That divergence is deliberate and documented in docs/PILOT-LAYER.md.
// Change PILOT_TZ here and both the gate and the shutdown follow.

export const PILOT_TZ = 'America/New_York'

// The hour after which the evening shutdown auto-prompts, in PILOT_TZ.
export const SHUTDOWN_HOUR = 17

interface PilotParts {
  ymd: string
  weekday: string
  hour: number
}

function parts(now: Date): PilotParts {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: PILOT_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', hour12: false,
  }).formatToParts(now)
  const get = (t: string) => f.find(p => p.type === t)?.value || ''
  // hour12:false can render midnight as "24" in some engines; normalise it.
  const hour = Number(get('hour')) % 24
  return { ymd: `${get('year')}-${get('month')}-${get('day')}`, weekday: get('weekday'), hour }
}

/** Today's civil date in PILOT_TZ as YYYY-MM-DD. */
export function pilotYmd(now: Date = new Date()): string {
  return parts(now).ymd
}

/** The civil hour (0 to 23) in PILOT_TZ. */
export function pilotHour(now: Date = new Date()): number {
  return parts(now).hour
}

/** True once the operator is past the shutdown hour on his own clock. */
export function isAfterShutdownHour(now: Date = new Date()): boolean {
  return parts(now).hour >= SHUTDOWN_HOUR
}

const DOW: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

/** Yesterday's civil date in PILOT_TZ as YYYY-MM-DD. */
export function pilotYesterdayYmd(now: Date = new Date()): string {
  return shiftYmd(pilotYmd(now), -1)
}

/** Tomorrow's civil date in PILOT_TZ as YYYY-MM-DD. */
export function pilotTomorrowYmd(now: Date = new Date()): string {
  return shiftYmd(pilotYmd(now), 1)
}

/**
 * Shift a YYYY-MM-DD civil date by whole days. Built at noon UTC so a DST
 * transition can never push the result onto the wrong date.
 */
export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

/** Monday of the current PILOT_TZ week, as YYYY-MM-DD. */
export function pilotWeekStartYmd(now: Date = new Date()): string {
  const { ymd, weekday } = parts(now)
  return shiftYmd(ymd, -(DOW[weekday] ?? 0))
}

/**
 * The UTC instant at which a PILOT_TZ civil date begins. Used to turn a civil
 * day into a timestamptz range for querying, since the rows store instants.
 * Resolved by probing the zone offset at midday on the target date, which is
 * safe for every real DST rule.
 */
export function pilotDayStartUtc(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const offsetMs = zoneOffsetMs(probe)
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + offsetMs)
}

/** The UTC instant at which a PILOT_TZ civil date ends (exclusive). */
export function pilotDayEndUtc(ymd: string): Date {
  return pilotDayStartUtc(shiftYmd(ymd, 1))
}

/** Milliseconds to add to a PILOT_TZ wall-clock time to get UTC. */
function zoneOffsetMs(at: Date): number {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: PILOT_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(at)
  const get = (t: string) => Number(f.find(p => p.type === t)?.value || '0')
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return at.getTime() - asUtc
}

/** Whole days between two instants, measured on civil dates in PILOT_TZ. */
export function pilotDaysBetween(from: Date, to: Date = new Date()): number {
  const a = pilotDayStartUtc(pilotYmd(from)).getTime()
  const b = pilotDayStartUtc(pilotYmd(to)).getTime()
  return Math.round((b - a) / 86_400_000)
}
