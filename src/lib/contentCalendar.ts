/**
 * The Library calendar's days, on the same clock as the rest of the Content
 * desk: calendar days in UTC, the calendar the engine keeps its series days on.
 *
 * The month grid used to bucket pieces by the BROWSER's local day. A
 * `scheduled_for` is a date column ("2026-10-07"), which `new Date()` reads as
 * midnight UTC, so anywhere west of UTC it became the evening before and the
 * piece was filed a day early. Every day here is a YYYY-MM-DD string and no
 * function reads the local zone.
 */

/** The UTC calendar day a stored date or timestamp falls on, or null. */
export function calendarDayOf(when: string | null | undefined): string | null {
  if (!when) return null
  // A date column is already a calendar day: never let a parser shift it.
  if (/^\d{4}-\d{2}-\d{2}$/.test(when)) return when
  const t = Date.parse(when)
  if (!Number.isFinite(t)) return null
  return new Date(t).toISOString().slice(0, 10)
}

/** The day a piece sits on: its scheduled day first, else the day it went out. */
export function pieceDay(i: { scheduled_for?: string | null; published_at?: string | null }): string | null {
  return calendarDayOf(i.scheduled_for || i.published_at)
}

export interface MonthCell {
  /** YYYY-MM-DD, UTC. */
  ymd: string
  inMonth: boolean
}

/** Year and zero-based month of a YYYY-MM-DD. */
export function monthOf(ymd: string): { year: number; month: number } {
  return { year: Number(ymd.slice(0, 4)), month: Number(ymd.slice(5, 7)) - 1 }
}

/** Step a month cursor by `delta` months. */
export function stepMonth(cursor: { year: number; month: number }, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(cursor.year, cursor.month + delta, 1))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() }
}

/** Six Sunday-first weeks (42 cells) covering the month, so the grid never jumps. */
export function monthGrid(year: number, month: number): MonthCell[] {
  const first = Date.UTC(year, month, 1)
  const lead = new Date(first).getUTCDay()
  const out: MonthCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(first + (i - lead) * 86_400_000)
    out.push({ ymd: d.toISOString().slice(0, 10), inMonth: d.getUTCMonth() === month && d.getUTCFullYear() === year })
  }
  return out
}

/** "Month 2026", named in UTC. */
export function monthName(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** "Wed, Oct 7", named in UTC. */
export function dayName(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
