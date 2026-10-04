// The one sentence about where Krish and someone else have both worked.
//
// It says what the record can prove and stops. A contact's career row carries a
// duration ("3 yrs 9 mos"), never a start and end date, so this never says
// "worked together" or "at the same time": both were at Nine, and that is all.
// Ask him and he will know whether they overlapped. The line's job is to make
// him think of it.
//
// Used by the network row and the ask card, so the two cannot drift into
// saying different things about the same person.

export interface SharedEntry {
  key: string
  label: string
  closeness: 'close' | 'wide'
  their_title: string | null
  current: boolean
}

export function sharedHistoryLine(history: SharedEntry[] | null | undefined): string | null {
  if (!history || !history.length) return null
  // Close employers first; the SQL already orders them, this does not trust it.
  const sorted = [...history].sort((a, b) => Number(b.closeness === 'close') - Number(a.closeness === 'close'))
  const first = sorted[0]
  const others = sorted.length - 1
  const tail = others > 0 ? ` and ${others} more of yours` : ''

  if (first.closeness === 'wide') {
    // Microsoft has 220,000 people. True, and it should not sound like more.
    return `Also at ${first.label}, a large company, so you may never have crossed paths${tail}.`
  }
  if (first.current) {
    return `Now at ${first.label}, where you worked${first.their_title ? `, as ${first.their_title}` : ''}${tail}.`
  }
  return `Also at ${first.label}${first.their_title ? `, as ${first.their_title}` : ''}${tail}.`
}

/** The plays worth a badge. Alumni has its own sentence, and "buyer" sits on a
 *  third of the network, where a badge would be wallpaper. */
export const BADGED_PLAYS: Record<string, string> = {
  multiplier: 'reaches many buyers',
  amplifier: 'puts you in rooms',
  subject: 'worth a story',
}
