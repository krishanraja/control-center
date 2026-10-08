// When hunter's next batch is owed. Mirrors hunter/src/hunter/schedule.py:
// Sunday 13:00 in London and Thursday 08:27 UTC. The status card used to say
// Monday and Thursday at 08:27, which had stopped being true.

const LONDON = 'Europe/London'

/** Minutes London is ahead of UTC at this instant (0 in winter, 60 in summer). */
function londonOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(at)
  const n = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'))
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000)
}

/** The UTC instant of 13:00 London on the given UTC calendar day. */
function sundayLondon(day: Date): Date {
  const noonUtc = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 13, 0))
  return new Date(noonUtc.getTime() - londonOffsetMinutes(noonUtc) * 60000)
}

export function nextBatchUtc(from: Date): string {
  for (let i = 0; i < 9; i++) {
    const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + i))
    const dow = day.getUTCDay()
    const at = dow === 0 ? sundayLondon(day)
      : dow === 4 ? new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 8, 27))
        : null
    if (at && at > from) return at.toISOString()
  }
  return ''
}
