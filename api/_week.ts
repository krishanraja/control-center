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
