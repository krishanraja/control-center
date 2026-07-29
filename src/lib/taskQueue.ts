import { isToday, isPast, parseISO } from 'date-fns'
import type { TaskRow } from '../hooks/useRealtimeTasks'

// The single definition of "the day queue". This predicate set used to be
// copy-pasted across DesktopToday, MobileToday, and DesktopHome; when the three
// copies drifted, Home's waiting badge and the Today queue disagreed about the
// same rows. Every surface that reasons about the task ruling queue imports
// from here.

// Stale threshold for the auto-collapse: tasks untouched this long with no
// progress hide behind a "N stale items hidden" disclosure.
export const STALE_DAYS = 14
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000

// Health-alert noise that Marcus's prompt sometimes collapses into the
// "Top blockers" string. Filtered client-side as defence in depth; the Marcus
// prompt patch is the source-side fix.
const NOISE_TITLE_PATTERNS: RegExp[] = [
  /^\s*health alert:\s*0\s*down,\s*0\s*stale/i,
  /^\s*sync engine running every/i,
]

// The day queue mirrors the decisions_waiting task branch exactly: statuses an
// agent parks on Krish, not yet reviewed, not buried. Anything non-terminal
// outside that set is work the agents carry themselves.
export const QUEUE_STATUSES = new Set(['waiting', 'in_progress', 'blocked', 'new'])

/** A deferred task (future due_date) is off the plate until its date arrives. */
export function deferredToLater(t: TaskRow): boolean {
  if (!t.due_date) return false
  const startOfTomorrow = new Date(); startOfTomorrow.setHours(24, 0, 0, 0)
  return new Date(t.due_date).getTime() >= startOfTomorrow.getTime()
}

export function needsKrish(t: TaskRow): boolean {
  return QUEUE_STATUSES.has(t.status) && !t.krish_reviewed && !deferredToLater(t)
}

export function isStaleNoProgress(t: TaskRow): boolean {
  if (t.started_at) return false
  if (!t.updated_at) return false
  const ms = Date.now() - new Date(t.updated_at).getTime()
  if (!Number.isFinite(ms) || ms < STALE_MS) return false
  return t.status === 'active' || t.status === 'waiting' || t.status === 'new'
}

export function isNoiseTask(t: TaskRow): boolean {
  return !!t.title && NOISE_TITLE_PATTERNS.some(re => re.test(t.title))
}

export function isDoneish(t: TaskRow): boolean {
  return t.status === 'superseded' || t.status === 'done' || t.status === 'closed'
}

export function isDueNow(t: TaskRow): boolean {
  if (!t.due_date) return false
  const d = parseISO(t.due_date)
  return isToday(d) || isPast(d)
}

/**
 * Coarse sitting math, same spirit as minutesToZero in decisionKinds: a task
 * ruling runs well under a minute; floor of 1 so a non-empty queue never
 * claims zero minutes.
 */
export function minutesLeft(remaining: number): number {
  return Math.max(1, Math.round(remaining * 0.75))
}

export type DeferChoice = 'tomorrow' | 'monday' | 'next_week'

export const DEFER_CHOICES: Array<{ key: DeferChoice; label: string }> = [
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'monday', label: 'Monday' },
  { key: 'next_week', label: 'Next week' },
]

export function deferDateISO(choice: DeferChoice): string {
  const d = new Date()
  if (choice === 'tomorrow') d.setDate(d.getDate() + 1)
  else if (choice === 'monday') d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7))
  else d.setDate(d.getDate() + 7)
  return d.toISOString()
}

export interface TaskQueueSplit {
  /** Rows waiting on a Krish ruling, due-now first (earliest due date leads). */
  queue: TaskRow[]
  /** Non-terminal work the agents carry themselves (the ambient sentence). */
  carried: TaskRow[]
  /** Untouched >= STALE_DAYS with no progress; behind the disclosure. */
  stale: TaskRow[]
  /** Explicitly buried rows (backburner). */
  buried: TaskRow[]
}

/**
 * Split the raw task cache into the four surfaces every ruling view renders.
 * `exclude` supports the optimistic "committed" set (rows the user just ruled
 * on, removed before the realtime echo lands).
 */
export function splitTaskQueue(tasks: TaskRow[], exclude?: Set<string>): TaskQueueSplit {
  const visible: TaskRow[] = []
  const stale: TaskRow[] = []
  const buried: TaskRow[] = []
  for (const t of tasks) {
    if (isDoneish(t)) continue
    if (t.buried_at) { buried.push(t); continue }
    if (isNoiseTask(t)) continue
    if (isStaleNoProgress(t)) { stale.push(t); continue }
    visible.push(t)
  }
  const queued = visible.filter(needsKrish).filter(t => !exclude?.has(t.id))
  const dueNow = queued
    .filter(isDueNow)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
  const queue = [...dueNow, ...queued.filter(t => !isDueNow(t))]
  const carried = visible.filter(t => !needsKrish(t))
  return { queue, carried, stale, buried }
}
