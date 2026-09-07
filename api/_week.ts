import { weekOfIn, shiftYmd } from './_timezone.js'

// The current week label, derived rather than stored.
//
// `system_config.week_of` held the literal string "Week of April 14, 2026" and
// was still being shown on the Home hero in August. It was written once by
// whoever last ran a weekly ritual and nothing moved it on afterwards.
//
// Canon Rule A: nothing dead is displayed. A week label is the most temporary
// fact in the OS, so it must be computed at read time. Storing it guarantees it
// is wrong the moment the week turns.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Monday of the week containing `d`, in UTC. */
export function weekStart(d: Date = new Date()): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  // getUTCDay: 0 = Sunday. Shift so Monday is the first day.
  const offset = (x.getUTCDay() + 6) % 7
  x.setUTCDate(x.getUTCDate() - offset)
  return x
}

/** "Week of August 3, 2026" for the week containing `d`. */
export function weekOfLabel(d: Date = new Date()): string {
  const w = weekStart(d)
  return `Week of ${MONTHS[w.getUTCMonth()]} ${w.getUTCDate()}, ${w.getUTCFullYear()}`
}

/** "YYYY-MM-DD" of the Monday, for tables keyed by week. */
export function weekOfKey(d: Date = new Date()): string {
  return weekStart(d).toISOString().slice(0, 10)
}

// ── Operator-civil weeks, for the goal cadence ───────────────────────────────
// The label above is UTC because it is only a label. The weekly rung of the
// goal ladder is keyed by the operator's own Monday (goals.week_start), so a
// Sunday-night objective in New York lands in the week he thinks it does.


/** Monday of the operator's civil week containing `at`, as YYYY-MM-DD. */
export function weekStartIn(at: Date, tz: string): string {
  return weekOfIn(at, tz)
}

/** True on Saturday or Sunday in the operator's zone. */
export function isWeekendIn(at: Date, tz: string): boolean {
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(at)
  return weekday === 'Sat' || weekday === 'Sun'
}

/**
 * The week an objective set right now belongs to. Monday to Friday it is this
 * week. On Saturday or Sunday the week has closed, so a new objective is for
 * the week that starts on Monday.
 */
export function targetWeekStartIn(at: Date, tz: string): string {
  const monday = weekStartIn(at, tz)
  return isWeekendIn(at, tz) ? shiftYmd(monday, 7) : monday
}
