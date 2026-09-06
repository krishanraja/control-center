import { supabase } from './_supabase.js'
import { getOperatorTz, shiftYmd, dayStartUtcIn, dayEndUtcIn } from './_timezone.js'

// The twelve week scorecard (job 2, keep him honest).
//
// Source: docs/plans/one-swing/CHARTER.md, "The scorecard". Twelve weeks
// ending on Fridays, 11 September to 27 November 2026, six columns, targets
// read on day 90 (5 December), a stop rule read on 5 October.
//
// This module is the one place the columns, the targets and the derivation
// live. The GET route, the Friday freeze and the Monday note all read from
// here, so the number on Home and the number in the Telegram message cannot
// disagree about what counts.
//
// What counts, exactly:
//   approaches_sent    ships rows with channel 'approach' in the week
//   calls_taken        room_targets.call_taken_at in the week
//   paid_rooms         room_targets.room_paid_at in the week
//   cash_invoiced_gbp  sum of room_targets.cash_gbp over those paid rows
//   pieces_published   ships rows with channel 'publish' in the week
//   unasked_hours      build_activity_weeks.hours_estimate for the week
//
// unasked_hours is an ESTIMATE (commits times UNASKED_HOURS_PER_COMMIT) and is
// labelled as one everywhere it renders. A week with no build_activity_weeks
// row reads 0 with unasked_measured false, which the UI renders as "not
// measured yet" rather than as a clean sheet.
//
// A week runs Saturday 00:00 to Friday 24:00 in the operator's zone, so the
// Friday freeze (Saturday 00:30 New York) sees all of Friday.

export const WEEKS = [
  '2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02',
  '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30',
  '2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27',
] as const

// A literal list can drift by a typo. Each Friday must be seven days after the
// last, and there must be twelve of them.
for (let i = 1; i < WEEKS.length; i += 1) {
  if (shiftYmd(WEEKS[i - 1], 7) !== WEEKS[i]) {
    throw new Error(`WEEKS is not a run of Fridays: ${WEEKS[i - 1]} then ${WEEKS[i]}`)
  }
}
if (WEEKS.length !== 12) throw new Error('WEEKS must hold twelve Fridays')

export const TARGETS = {
  approaches_sent: 25,
  calls_taken: 5,
  paid_rooms: 1,
  cash_invoiced_gbp: 15000,
  pieces_published: 12,
  unasked_hours: 0,
} as const

export type ScorecardCol = keyof typeof TARGETS

export const COLS: ScorecardCol[] = [
  'approaches_sent', 'calls_taken', 'paid_rooms', 'cash_invoiced_gbp', 'pieces_published', 'unasked_hours',
]

export const STOP_RULE = {
  on: '2026-10-05',
  reads: 'Fewer than 2 of 25 took a call, or no paid room. The network advantage is not real for this offer.',
} as const

export const DAY_90 = '2026-12-05'

export const COLUMNS: { key: ScorecardCol; label: string; unit: string }[] = [
  { key: 'approaches_sent', label: 'Sent', unit: 'approaches' },
  { key: 'calls_taken', label: 'Calls', unit: 'calls' },
  { key: 'paid_rooms', label: 'Paid', unit: 'rooms' },
  { key: 'cash_invoiced_gbp', label: 'Cash', unit: 'GBP' },
  { key: 'pieces_published', label: 'Published', unit: 'pieces' },
  { key: 'unasked_hours', label: 'Unasked', unit: 'hours' },
]

export type WeekValues = Record<ScorecardCol, number>

export interface DerivedWeek extends WeekValues {
  week_ending: string
  /** True when a build_activity_weeks row exists for the week. */
  unasked_measured: boolean
  /** Commits behind the unasked estimate, 0 when not measured. */
  commits: number
  /** room_targets currently sitting in state 'drafted': written, not sent. */
  drafted_not_sent: number
  /** room_targets drafted inside the week (drafted_at in range). */
  drafted_this_week: number
}

export function emptyValues(): WeekValues {
  return {
    approaches_sent: 0, calls_taken: 0, paid_rooms: 0,
    cash_invoiced_gbp: 0, pieces_published: 0, unasked_hours: 0,
  }
}

/** The Friday on or after a civil date. A Friday maps to itself. */
export function weekEndingFor(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const toFriday = (5 - dow + 7) % 7
  return shiftYmd(ymd, toFriday)
}

/** Saturday 00:00 to Friday 24:00 in the operator's zone, as UTC instants. */
export function weekRangeUtc(weekEnding: string, tz: string): { start: Date; end: Date } {
  return {
    start: dayStartUtcIn(shiftYmd(weekEnding, -6), tz),
    end: dayEndUtcIn(weekEnding, tz),
  }
}

/** True when the failure is "that table does not exist". room_targets is
 *  built in a parallel package and may not be applied yet on a fresh
 *  database; a missing table reads as 0, never as a crashed scorecard. */
export function isMissingTable(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false
  if (err.code === '42P01' || err.code === 'PGRST205') return true
  const m = (err.message || '').toLowerCase()
  return m.includes('does not exist') || m.includes('could not find the table')
}

async function countRows(
  table: string,
  build: (q: ReturnType<typeof supabase.from>) => PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>,
): Promise<number> {
  try {
    const { count, error } = await build(supabase.from(table))
    if (error) {
      if (isMissingTable(error)) return 0
      throw new Error(`${table}: ${error.message}`)
    }
    return count ?? 0
  } catch (e) {
    if (isMissingTable(e as { code?: string; message?: string })) return 0
    throw e
  }
}

/** Derive one week from the ledgers. Every read tolerates a missing table. */
export async function deriveWeek(weekEnding: string, tz?: string): Promise<DerivedWeek> {
  const zone = tz || await getOperatorTz()
  const { start, end } = weekRangeUtc(weekEnding, zone)
  const s = start.toISOString()
  const e = end.toISOString()

  const approaches = await countRows('ships', q => q
    .select('id', { count: 'exact', head: true })
    .eq('channel', 'approach').gte('occurred_at', s).lt('occurred_at', e))

  const published = await countRows('ships', q => q
    .select('id', { count: 'exact', head: true })
    .eq('channel', 'publish').gte('occurred_at', s).lt('occurred_at', e))

  const calls = await countRows('room_targets', q => q
    .select('id', { count: 'exact', head: true })
    .gte('call_taken_at', s).lt('call_taken_at', e))

  let paidRooms = 0
  let cash = 0
  try {
    const { data, error } = await supabase.from('room_targets')
      .select('cash_gbp').gte('room_paid_at', s).lt('room_paid_at', e)
    if (error && !isMissingTable(error)) throw new Error(`room_targets: ${error.message}`)
    for (const r of (data || []) as { cash_gbp: number | string | null }[]) {
      paidRooms += 1
      cash += Number(r.cash_gbp || 0)
    }
  } catch (err) {
    if (!isMissingTable(err as { code?: string; message?: string })) throw err
  }

  const draftedNotSent = await countRows('room_targets', q => q
    .select('id', { count: 'exact', head: true }).eq('state', 'drafted'))

  const draftedThisWeek = await countRows('room_targets', q => q
    .select('id', { count: 'exact', head: true })
    .gte('drafted_at', s).lt('drafted_at', e))

  let unasked = 0
  let measured = false
  let commits = 0
  try {
    const { data, error } = await supabase.from('build_activity_weeks')
      .select('hours_estimate, commits').eq('week_ending', weekEnding).maybeSingle()
    if (error && !isMissingTable(error)) throw new Error(`build_activity_weeks: ${error.message}`)
    if (data) {
      measured = true
      unasked = Number((data as { hours_estimate: number | string | null }).hours_estimate || 0)
      commits = Number((data as { commits: number | null }).commits || 0)
    }
  } catch (err) {
    if (!isMissingTable(err as { code?: string; message?: string })) throw err
  }

  return {
    week_ending: weekEnding,
    approaches_sent: approaches,
    calls_taken: calls,
    paid_rooms: paidRooms,
    cash_invoiced_gbp: Math.round(cash * 100) / 100,
    pieces_published: published,
    unasked_hours: Math.round(unasked * 10) / 10,
    unasked_measured: measured,
    commits,
    drafted_not_sent: draftedNotSent,
    drafted_this_week: draftedThisWeek,
  }
}

/** A scorecard_weeks row as stored. Derived columns plus their override twins. */
export interface ScorecardRow extends WeekValues {
  week_ending: string
  override_approaches_sent: number | null
  override_calls_taken: number | null
  override_paid_rooms: number | null
  override_cash_invoiced_gbp: number | null
  override_pieces_published: number | null
  override_unasked_hours: number | null
  plan_sent: number | null
  variance_note: string | null
  frozen_at: string | null
}

export function overrideKey(col: ScorecardCol): `override_${ScorecardCol}` {
  return `override_${col}`
}

/** Operator overrides win when set. A row of nulls changes nothing. */
export function mergeOverrides<T extends WeekValues>(derived: T, row: Partial<ScorecardRow> | null | undefined): T {
  if (!row) return derived
  const out = { ...derived }
  for (const col of COLS) {
    const v = row[overrideKey(col)]
    if (v != null && Number.isFinite(Number(v))) out[col] = Number(v) as T[ScorecardCol]
  }
  return out
}

export function fmtYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** The Friday variance note, in plain sentences. What was sent against the
 *  plan, what slipped, and the unasked hours with their estimate label. */
export function varianceNote(
  row: WeekValues & { week_ending: string; drafted_not_sent?: number; commits?: number; unasked_measured?: boolean },
  planSent: number,
): string {
  const lines: string[] = []
  lines.push(`Week ending ${fmtYmd(row.week_ending)}.`)
  lines.push(`Sent ${plural(row.approaches_sent, 'approach', 'approaches')} against a plan of ${planSent}.`)
  const slipped = row.drafted_not_sent ?? 0
  lines.push(slipped > 0
    ? `${plural(slipped, 'drafted approach', 'drafted approaches')} not sent.`
    : 'Nothing drafted was left unsent.')
  lines.push(
    `Calls taken ${row.calls_taken}, paid rooms ${row.paid_rooms}, `
    + `cash invoiced ${row.cash_invoiced_gbp.toLocaleString('en-GB')} GBP, `
    + `pieces published ${row.pieces_published}.`,
  )
  if (row.unasked_measured) {
    lines.push(`Unasked building ${row.unasked_hours}h, an estimate from ${plural(row.commits ?? 0, 'commit', 'commits')}.`)
  } else {
    lines.push('Unasked building not measured yet.')
  }
  return lines.join(' ')
}

/** Read every stored row, tolerating a database where the migration has not
 *  been applied yet. */
export async function loadRows(): Promise<Map<string, ScorecardRow>> {
  const out = new Map<string, ScorecardRow>()
  try {
    const { data, error } = await supabase.from('scorecard_weeks').select('*')
    if (error) {
      if (isMissingTable(error)) return out
      throw new Error(`scorecard_weeks: ${error.message}`)
    }
    for (const r of (data || []) as ScorecardRow[]) out.set(r.week_ending, r)
  } catch (err) {
    if (!isMissingTable(err as { code?: string; message?: string })) throw err
  }
  return out
}

/** Values for one week as the scorecard reports them: the frozen row when the
 *  week is frozen, otherwise a live derivation; overrides applied either way. */
export async function weekValues(weekEnding: string, row: ScorecardRow | undefined, tz: string): Promise<DerivedWeek> {
  if (row?.frozen_at) {
    const frozen: DerivedWeek = {
      week_ending: weekEnding,
      approaches_sent: Number(row.approaches_sent || 0),
      calls_taken: Number(row.calls_taken || 0),
      paid_rooms: Number(row.paid_rooms || 0),
      cash_invoiced_gbp: Number(row.cash_invoiced_gbp || 0),
      pieces_published: Number(row.pieces_published || 0),
      unasked_hours: Number(row.unasked_hours || 0),
      unasked_measured: true,
      commits: 0,
      drafted_not_sent: 0,
      drafted_this_week: 0,
    }
    return mergeOverrides(frozen, row)
  }
  const derived = await deriveWeek(weekEnding, tz)
  return mergeOverrides(derived, row)
}

export function sumValues(rows: WeekValues[]): WeekValues {
  const t = emptyValues()
  for (const r of rows) for (const col of COLS) t[col] += Number(r[col] || 0)
  t.cash_invoiced_gbp = Math.round(t.cash_invoiced_gbp * 100) / 100
  t.unasked_hours = Math.round(t.unasked_hours * 10) / 10
  return t
}

/** Target minus total, floored at zero. Unasked is the exception: its target is
 *  zero, so the gap is the hours themselves, reported as they are. */
export function gapTo(totals: WeekValues): WeekValues {
  const g = emptyValues()
  for (const col of COLS) {
    g[col] = col === 'unasked_hours'
      ? totals.unasked_hours
      : Math.max(0, TARGETS[col] - totals[col])
  }
  return g
}
