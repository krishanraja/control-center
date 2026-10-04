// How the n8n fleet observer grades a workflow, and when it calls an alert over.
//
// Pure functions only, so every rule here is testable without n8n or Supabase.
// api/health/fleet-reconcile.ts fetches, this file judges, the route writes.
// Tests: tests/api/fleetGrade.test.ts and scripts/check-fleet-classifier.mts.
//
// The 2026-10-04 audit found the observer wrong in both directions:
//
//   - It graded a 28-day error ratio, so a workflow fixed today stayed red for
//     weeks while its old failures aged out of the window. It also counted
//     manual test runs: two deliberate failures on made-up inbox ids during a
//     repair session raised alerts the next morning.
//   - The same ratio hid a fresh outage. Nell's Guest Pitch Draft failed every
//     scheduled run from 10-01 on a dead Anthropic key and read healthy,
//     because 6 failures out of 56 runs is 10.7%.
//   - It raised one silent_failures row per workflow per day and never
//     resolved one: 479 open runtime_failing rows across 30 workflows, the
//     oldest from 08-20, none ever closed.
//
// So a workflow is graded on its recent PRODUCTION runs, newest first, and an
// alert ends only on evidence that the workflow works again.

export const WINDOW_DAYS = 28
/** How many of the newest production runs count as "recent". */
export const RECENT_RUNS = 10
/** This many failures in a row, newest first, is an outage, not a blip. */
export const FAILING_STREAK = 2
/**
 * The fewest clean runs in a row that count as recovered.
 *
 * Not 1. One clean run is exactly what `last_success_at > last_error_at`
 * measures, and the audit rejected that test: PR Engine and the Orchestrator
 * both pass it while still broken. Two in a row is the smallest number that is
 * not that test.
 */
export const MIN_CLEAN_RUNS = 2
/**
 * The most clean runs in a row ever demanded. Without a ceiling, a busy
 * workflow with two blips 300 runs apart would need 301 clean runs to clear,
 * which is the stuck-red problem again in a new shape.
 */
export const MAX_CLEAN_RUNS = RECENT_RUNS

/**
 * Execution modes that are a person testing or re-running, not the workflow
 * doing its job on its own trigger.
 *
 *   manual      the editor's Execute button, test webhooks, MCP test runs
 *   evaluation  n8n's test-case runner
 *   retry       a person pressing Retry on a failed execution. It re-runs an
 *               input that is already counted, so counting it too would let
 *               one bad input look like two failures in a row.
 *
 * Everything else counts: trigger (schedules, pollers), webhook, integrated
 * (called by another workflow), error, cli, internal, chat. A deny list, so a
 * mode n8n adds later is counted rather than silently ignored.
 */
export const NON_PRODUCTION_MODES: ReadonlySet<string> = new Set(['manual', 'evaluation', 'retry'])

export type FleetStatus = 'healthy' | 'degraded' | 'failing' | 'dead' | 'idle'

/** Statuses that raise a silent_failures row. Leaving this set resolves them. */
export const ALERTABLE: ReadonlySet<string> = new Set(['degraded', 'failing', 'dead'])

export interface ExecutionLike {
  id?: string | number | null
  workflowId?: string | null
  status?: string | null
  mode?: string | null
  startedAt?: string | null
  stoppedAt?: string | null
}

/** One graded production run. */
export interface Run { id: string | null; at: string; ok: boolean }

/** Group failures by cause, so a credential outage is one story not six. */
export function classifyFailure(message: string, type: string): string {
  const m = `${message} ${type}`.toLowerCase()
  // Quota is tested FIRST and deliberately. n8n wraps almost every non-2xx in
  // "Forbidden - perhaps check your credentials?", so Zara's real error
  // ("Monthly usage hard limit exceeded") reads as a credential fault to a
  // naive matcher and would send someone hunting for a broken key instead of
  // topping up a plan.
  // "usage limit" is Anthropic's monthly spend cap ("You have reached your
  // specified API usage limits"), 12 of the 40 errors in the 2026-10-04 audit,
  // which this matcher had been filing as unknown.
  if (/quota|rate limit|too many requests|429|usage hard limit|usage limit|limit exceeded/.test(m)) return 'quota'
  // A Code node calling an n8n helper that does not exist is a bug in the
  // workflow, not a key. "this.getCredentials is not a function" (Feedback
  // Circle and Pulse) contains the word credential and was sending someone to
  // re-auth a credential that works.
  if (/is not a function/.test(m)) return 'logic'
  if (/credential|unauthor|401|x-api-key|does not exist for type/.test(m)) return 'credential'
  if (/econnrefused|etimedout|enotfound|socket hang up|network|timeout/.test(m)) return 'network'
  if (/unexpected|syntaxerror|cannot read|undefined|expressionerror|is not a function|json/.test(m)) return 'logic'
  return 'unknown'
}

/**
 * When an execution happened: startedAt, else stoppedAt, else null.
 *
 * n8n leaves startedAt null on executions that failed before they started,
 * such as a Drive poller whose DNS lookup failed (Zara Layer 1, execution
 * 42415). The old reconcile counted such a run inside every window, because an
 * empty time slipped past the window check, yet never let it set last_run_at or
 * last_error_at. One timestamp now drives the window, the order and every
 * last_* column, so a run is either fully counted or not counted at all.
 */
export function executionTime(e: Pick<ExecutionLike, 'startedAt' | 'stoppedAt'>): string | null {
  for (const t of [e.startedAt, e.stoppedAt]) {
    if (t && Number.isFinite(Date.parse(t))) return t
  }
  return null
}

/**
 * true for a success, false for a failure, null for a run that is not over or
 * that n8n cannot judge (new, running, waiting, unknown).
 *
 * crashed (the worker died) and canceled (n8n's execution timeout ends a run
 * as canceled, and nobody stops a scheduled run by hand) are failures. The old
 * reconcile counted every status that was not 'error' as a success, including
 * runs still in progress.
 */
export function runOutcome(status: string | null | undefined): boolean | null {
  if (status === 'success') return true
  if (status === 'error' || status === 'crashed' || status === 'canceled') return false
  return null
}

export function isProductionRun(e: Pick<ExecutionLike, 'mode'>): boolean {
  return !(e.mode && NON_PRODUCTION_MODES.has(e.mode))
}

export interface CollectedRuns {
  /** Production runs per workflow id, newest first. */
  byWorkflow: Map<string, Run[]>
  /** Finished runs inside the window that were left out as manual or test runs. */
  testRuns: number
  /** Finished production runs with no time at all, so no window can hold them. */
  undated: number
}

function idNum(id: string | null): number {
  const n = id == null ? NaN : Number(id)
  return Number.isFinite(n) ? n : -1
}

/** Newest first. Equal times fall back to the execution id, which n8n issues in order. */
export function newestFirst(a: Run, b: Run): number {
  return (Date.parse(b.at) - Date.parse(a.at)) || (idNum(b.id) - idNum(a.id))
}

export function collectRuns(executions: ExecutionLike[], sinceMs: number): CollectedRuns {
  const byWorkflow = new Map<string, Run[]>()
  let testRuns = 0
  let undated = 0
  for (const e of executions) {
    if (!e.workflowId) continue
    const ok = runOutcome(e.status)
    if (ok === null) continue
    const at = executionTime(e)
    if (at && Date.parse(at) < sinceMs) continue
    if (!isProductionRun(e)) { testRuns++; continue }
    if (!at) { undated++; continue }
    const list = byWorkflow.get(e.workflowId) || []
    list.push({ id: e.id == null ? null : String(e.id), at, ok })
    byWorkflow.set(e.workflowId, list)
  }
  for (const list of byWorkflow.values()) list.sort(newestFirst)
  return { byWorkflow, testRuns, undated }
}

export interface RunEvidence {
  /** Production runs in the window. */
  runs: number
  failures: number
  /** Failures in a row, counting back from the newest run. */
  streak: number
  /** Successes in a row, counting back from the newest run. */
  clean: number
  recentRuns: number
  recentFailures: number
  /**
   * The longest run of successes that sat BETWEEN two failures. It measures how
   * long this workflow has gone clean before and still failed again.
   */
  longestCleanGap: number
  /** Clean runs in a row needed before the workflow counts as recovered. */
  requiredClean: number
  lastRunAt: string | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastFailureId: string | null
}

/**
 * The "most recent K runs all succeeded" test, with K set per workflow.
 *
 * K is one more than the longest clean stretch the workflow has had between
 * two failures in the window, never below MIN_CLEAN_RUNS and never above
 * MAX_CLEAN_RUNS. A workflow whose failures came as one solid block (an outage
 * that a fix ended, like Guest Pitch's dead key) clears after two clean runs.
 * A workflow that fails on some days or some inputs has to stay clean for
 * longer than it ever has between failures, because for it a few clean runs
 * prove nothing: PR Engine goes up to five runs clean between its Tuesday and
 * Thursday failures, and the Orchestrator went 13 clean between failures in
 * one burst on 09-30.
 */
export function requiredCleanRuns(longestCleanGap: number): number {
  return Math.min(MAX_CLEAN_RUNS, Math.max(MIN_CLEAN_RUNS, longestCleanGap + 1))
}

/** Summarise a workflow's production runs. `runs` must be newest first. */
export function summariseRuns(runs: Run[]): RunEvidence {
  let failures = 0
  let streak = 0
  let clean = 0
  let headDone = false
  let longestCleanGap = 0
  let prevFailure = -1
  let lastSuccessAt: string | null = null
  let lastFailureAt: string | null = null
  let lastFailureId: string | null = null

  runs.forEach((r, i) => {
    if (!headDone) {
      if (i === 0 || r.ok === runs[0].ok) {
        if (r.ok) clean++
        else streak++
      } else {
        headDone = true
      }
    }
    if (r.ok) {
      if (!lastSuccessAt) lastSuccessAt = r.at
    } else {
      failures++
      if (!lastFailureAt) { lastFailureAt = r.at; lastFailureId = r.id }
      if (prevFailure >= 0) longestCleanGap = Math.max(longestCleanGap, i - prevFailure - 1)
      prevFailure = i
    }
  })

  const recent = runs.slice(0, RECENT_RUNS)
  return {
    runs: runs.length,
    failures,
    streak,
    clean,
    recentRuns: recent.length,
    recentFailures: recent.filter(r => !r.ok).length,
    longestCleanGap,
    requiredClean: requiredCleanRuns(longestCleanGap),
    lastRunAt: runs[0]?.at ?? null,
    lastSuccessAt,
    lastFailureAt,
    lastFailureId,
  }
}

/**
 * A workflow's health from its own production record, newest runs first.
 *
 *   idle      switched off, or nothing ran and nothing schedules it
 *   dead      scheduled with no production run in the window, no production
 *             run in the window succeeded, or the last RECENT_RUNS all failed
 *   failing   the newest FAILING_STREAK or more runs failed, or the newest run
 *             failed and so did at least half of the recent runs
 *   degraded  it failed recently and has not proved it recovered: the newest
 *             run failed once, or it has succeeded since but fewer than
 *             `requiredClean` times in a row
 *   healthy   no failure in the window, or recovered: its newest
 *             `requiredClean` runs all succeeded
 *
 * A recovered workflow is healthy whatever its older ratio says. That is the
 * point: Guest Pitch with two clean runs after its outage is healthy even
 * though six of its last ten runs failed. And a workflow whose newest run
 * succeeded is never 'failing': it is recovering, which is 'degraded'.
 */
export function gradeWorkflow(opts: { active: boolean; isScheduled: boolean; evidence: RunEvidence }): FleetStatus {
  const { active, isScheduled, evidence: ev } = opts
  if (!active) return 'idle'
  // Scheduled, switched on, and no production run in the whole window: it is
  // not quiet, it is not running. No self-reported heartbeat can say this.
  if (ev.runs === 0) return isScheduled ? 'dead' : 'idle'
  if (ev.failures === ev.runs) return 'dead'
  if (ev.streak >= RECENT_RUNS) return 'dead'
  if (ev.streak >= FAILING_STREAK) return 'failing'
  if (ev.failures === 0) return 'healthy'
  if (ev.clean >= ev.requiredClean) return 'healthy'
  if (ev.clean === 0 && ev.recentFailures * 2 >= ev.recentRuns) return 'failing'
  return 'degraded'
}

function runsWord(n: number): string {
  return n === 1 ? 'run' : 'runs'
}

/** One plain sentence saying why a workflow got its grade. */
export function describeEvidence(ev: RunEvidence, isScheduled = true): string {
  if (ev.runs === 0) {
    return isScheduled
      ? 'It is switched on and scheduled, but n8n shows no production run in 28 days.'
      : 'No production run in 28 days, and nothing schedules it.'
  }
  if (ev.failures === ev.runs) {
    return ev.runs === 1
      ? 'Its only production run in 28 days failed.'
      : `None of its ${ev.runs} production runs in 28 days succeeded.`
  }
  if (ev.streak >= FAILING_STREAK) return `Its last ${ev.streak} production runs failed.`
  if (ev.failures === 0) return 'No production run failed in 28 days.'
  if (ev.clean >= ev.requiredClean) return `Its last ${ev.clean} production runs succeeded.`
  const recent = `${ev.recentFailures} of its last ${ev.recentRuns} production ${runsWord(ev.recentRuns)} failed`
  if (ev.clean === 0) return `${recent}, including the newest one.`
  return `${recent}. It needs ${ev.requiredClean} clean runs in a row to count as recovered and has ${ev.clean}.`
}

export interface GradedWorkflow {
  workflow_id: string
  status: string
  active: boolean
  evidence: RunEvidence
}

/** The silent_failures tier each alertable status writes. */
export function alertTier(status: string): 2 | 3 {
  return status === 'degraded' ? 2 : 3
}

/** An open runtime_failing row, as much of it as resolution needs. */
export interface OpenAlert { workflow_id: string; tier: number }

/**
 * Close this workflow's open runtime_failing rows. With `minTier`, only rows
 * at that tier or above: a workflow that is now degraded keeps its tier-2 row
 * and loses the tier-3 rows that said it was down.
 */
export interface Resolution { workflowId: string; note: string; minTier?: number }

const RESOLVED_BY = 'Resolved by fleet-reconcile:'

/**
 * Which open runtime_failing rows to close, and the sentence that says why.
 *
 * A row closes when its workflow leaves the alertable set. Being alertable is
 * decided by gradeWorkflow, whose recovery test is "the newest K production
 * runs all succeeded". It is never "last success is newer than last error":
 * PR Engine fails every Tuesday and Thursday and the Orchestrator fails on
 * specific events, and on any other day both pass that test while broken.
 *
 * A row above the workflow's current tier closes too. The Home alarm shows
 * every open row at tier 3 or above, so a workflow that has gone from failing
 * to degraded would otherwise keep saying "is down" on Home until it fully
 * recovered.
 *
 * `listComplete` says the workflow list was read to its end. Only then does a
 * workflow missing from it mean n8n no longer has it, rather than that the
 * list was cut short.
 */
export function planResolutions(
  graded: GradedWorkflow[],
  openAlerts: OpenAlert[],
  listComplete: boolean,
): Resolution[] {
  const byId = new Map(graded.map(g => [g.workflow_id, g]))
  const topTier = new Map<string, number>()
  for (const a of openAlerts) topTier.set(a.workflow_id, Math.max(topTier.get(a.workflow_id) ?? 0, a.tier))
  const out: Resolution[] = []
  for (const [id, openTop] of topTier) {
    const g = byId.get(id)
    if (!g) {
      if (listComplete) out.push({ workflowId: id, note: `${RESOLVED_BY} n8n no longer lists this workflow, so it cannot be failing.` })
      continue
    }
    if (ALERTABLE.has(g.status)) {
      const tier = alertTier(g.status)
      if (openTop > tier) {
        out.push({
          workflowId: id,
          minTier: tier + 1,
          note: `${RESOLVED_BY} no longer failing, so it is off the alarm. It stays on watch as ${g.status}. ${describeEvidence(g.evidence)}`,
        })
      }
      continue
    }
    if (!g.active) {
      out.push({ workflowId: id, note: `${RESOLVED_BY} the workflow is switched off in n8n, so it is not failing.` })
    } else if (g.status === 'idle') {
      out.push({ workflowId: id, note: `${RESOLVED_BY} no production run in 28 days, and nothing schedules it.` })
    } else {
      out.push({ workflowId: id, note: `${RESOLVED_BY} ${describeEvidence(g.evidence)}` })
    }
  }
  return out
}
