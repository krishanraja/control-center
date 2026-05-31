// Civil-date helpers in Europe/London regardless of device timezone, so day and
// week boundaries land on Krish's morning rather than a UTC midnight. Extracted
// from useWeeklyFocus so the focus spine (useAltitudes, FocusRitual) shares one
// implementation.

export function londonParts(now: Date): { ymd: string; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value || ''
  return { ymd: `${get('year')}-${get('month')}-${get('day')}`, weekday: get('weekday') }
}

// Today's London civil date as YYYY-MM-DD.
export function londonYmd(now: Date): string {
  return londonParts(now).ymd
}

const DOW: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

// Monday (Europe/London) of the week containing `now`, as YYYY-MM-DD. Built at
// noon UTC off the London civil date so DST never shifts the date.
export function weekOfLondon(now: Date): string {
  const { ymd, weekday } = londonParts(now)
  const [y, m, d] = ymd.split('-').map(Number)
  const offset = DOW[weekday] ?? 0
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  base.setUTCDate(base.getUTCDate() - offset)
  return base.toISOString().slice(0, 10)
}

export function isMondayLondon(now: Date): boolean {
  return londonParts(now).weekday === 'Mon'
}
