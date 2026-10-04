import type { DecisionRow } from '../hooks/useRealtimeDecisionsWaiting'

/**
 * The honest waiting count (ruling, Krish 2026-10-04).
 *
 * The OS Queue showed 27 rulings, and 20 of them (74%) were stale or
 * superseded: a weekly brief that a newer week had replaced, the same piece
 * queued for graduation twice, rule corrections 41 days old, growth stalls
 * frozen at August numbers, a purge notice that offers nothing to decide, a
 * gap whose task he had already reviewed, and a rollup task that only repeats
 * the pipeline chips. Home's count inherited all of it.
 *
 * `freshDecisions` keeps only what Krish can still act on in the tab that
 * owns it. Feed it the typed rulings (`splitDecisions(rows).decisions`), not
 * the pipeline pools. It is pure: the clock and the reviewed task ids come in
 * as arguments, so the rules are tested without a database.
 */

export const FRESH_DAYS = 14
/** Content decisions that a newer week replaces wholesale. */
const WEEKLY_KINDS = new Set(['brief_review', 'graduation'])
const DAY_MS = 24 * 60 * 60 * 1000

export interface FreshContext {
  /** Defaults to the current time. */
  now?: Date
  /** Task ids Krish has already reviewed (`tasks.krish_reviewed = true`). */
  reviewedTaskIds?: ReadonlySet<string>
}

function meta(row: DecisionRow): Record<string, unknown> {
  return (row.meta ?? {}) as Record<string, unknown>
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** ISO week labels like 2026-W40 sort correctly as strings once padded. */
function weekKey(week: string | null): string | null {
  if (!week) return null
  const m = /^(\d{4})-W(\d{1,2})$/.exec(week)
  return m ? `${m[1]}-W${m[2].padStart(2, '0')}` : null
}

/** A task that only rolls up a pipeline pool ("41 podcasts + 28 stages awaiting approval (69 total)"). */
export function isPipelineRollup(row: DecisionRow): boolean {
  if (row.kind !== 'task') return false
  return /awaiting approval/i.test(row.title) && /\(\s*\d+\s+total\s*\)/i.test(row.title)
}

/** Older than FRESH_DAYS, or with no date at all, which cannot be shown to be fresh. */
export function isOld(row: DecisionRow, now: Date): boolean {
  if (!row.sort_at) return true
  const t = new Date(row.sort_at).getTime()
  if (Number.isNaN(t)) return true
  return now.getTime() - t > FRESH_DAYS * DAY_MS
}

export function freshDecisions(rows: DecisionRow[], ctx: FreshContext = {}): DecisionRow[] {
  const now = ctx.now ?? new Date()
  const reviewed = ctx.reviewedTaskIds ?? new Set<string>()

  // The newest week seen for each content decision kind, and for each
  // graduation ref, so an older copy can be recognised as superseded.
  const newestWeekByKind = new Map<string, string>()
  const newestWeekByRef = new Map<string, string>()
  for (const r of rows) {
    if (r.kind !== 'content_decision') continue
    const m = meta(r)
    const wk = weekKey(str(m.week))
    if (!wk) continue
    const dk = str(m.decision_kind) ?? r.status
    if ((newestWeekByKind.get(dk) ?? '') < wk) newestWeekByKind.set(dk, wk)
    const ref = str(m.ref)
    if (dk === 'graduation' && ref && (newestWeekByRef.get(ref) ?? '') < wk) newestWeekByRef.set(ref, wk)
  }

  const keptGraduationRefs = new Set<string>()
  const out: DecisionRow[] = []
  for (const r of rows) {
    if (isOld(r, now)) continue
    if (isPipelineRollup(r)) continue
    const m = meta(r)

    if (r.kind === 'content_decision') {
      const dk = str(m.decision_kind) ?? r.status
      // A notice, not a decision: there is nothing to rule on.
      if (dk === 'purge_preview') continue
      const wk = weekKey(str(m.week))
      // A newer week's brief or graduation list replaced this one. A shift
      // proposal is not weekly work, so a newer week does not retire it.
      if (WEEKLY_KINDS.has(dk) && wk && (newestWeekByKind.get(dk) ?? wk) > wk) continue
      if (dk === 'graduation') {
        const ref = str(m.ref)
        if (ref) {
          if (wk && (newestWeekByRef.get(ref) ?? wk) > wk) continue
          if (keptGraduationRefs.has(ref)) continue
          keptGraduationRefs.add(ref)
        }
      }
    }

    if (r.kind === 'vera_gap') {
      const taskId = str(m.task_id)
      if (taskId && reviewed.has(taskId)) continue
    }

    out.push(r)
  }
  return out
}

/** The plain line for the count, including the honest zero. */
export function waitingLine(n: number): string {
  if (n === 0) return 'Nothing is waiting on you.'
  return n === 1 ? '1 thing is waiting on you.' : `${n} things are waiting on you.`
}
