// The one sentence about where Krish and someone else have both been.
//
// It says what the record can prove and stops. A contact's career row carries a
// duration ("3 yrs 9 mos"), never a start and end date, so this never says
// "worked together" or "at the same time": both were at Nine, and that is all.
// Ask him and he will know whether they overlapped. The line's job is to make
// him think of it.
//
// A school is different. An education row carries years, so where both sides
// state years and they overlap, the line can say "in the same years as you".
// Where either side has no years, it says only that both went there.
//
// Used by the network row and the ask card, so the two cannot drift into
// saying different things about the same person.

export interface SharedEntry {
  key: string
  label: string
  closeness: 'close' | 'wide'
  their_title: string | null
  current: boolean
  /** Absent on rows written before schools were read (2026-10-04). */
  kind?: 'employer' | 'school'
  their_years?: string | null
  krish_years?: string | null
  /** True only where both sides state years and they overlap. */
  same_years?: boolean
}

/** Which entry leads the sentence: a close employer, then a school shared in
 *  the same years, then any school, then a large employer. */
function rank(e: SharedEntry): number {
  const school = e.kind === 'school'
  if (!school && e.closeness === 'close') return 0
  if (school && e.same_years) return 1
  if (school) return 2
  return 3
}

export function sharedHistoryLine(history: SharedEntry[] | null | undefined): string | null {
  if (!history || !history.length) return null
  // The SQL already orders them; this does not trust it.
  const sorted = [...history].sort((a, b) => rank(a) - rank(b))
  const first = sorted[0]
  const others = sorted.length - 1
  const tail = others > 0 ? ` and ${others} more of yours` : ''

  if (first.kind === 'school') {
    return first.same_years
      ? `Went to ${first.label} in the same years as you${tail}.`
      : `Also went to ${first.label}${tail}.`
  }

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
