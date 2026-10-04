// Guards the pure functions the fleet observer classifies on.
//
// api/health/fleet-reconcile.ts is the only health signal in the OS that is not
// self-reported by the thing being measured, so what it says is what anyone
// acting on a fleet failure will believe. Its judgements live in
// api/_fleetGrade.ts, and each of them got the order or the window wrong once:
//
//   1. n8n wraps almost every non-2xx in "Forbidden - perhaps check your
//      credentials?" and puts the real cause in error.description. Testing
//      credential before quota read Zara's blown plan limit and the
//      Orchestrator's Drive rate limit as broken keys, which sends someone
//      rotating a perfectly good credential instead of topping up a plan.
//   2. A scheduled workflow that ran zero times in the window is dead, not
//      idle. That is precisely the case no self-reported heartbeat can produce,
//      and it is the reason this observer exists at all.
//   3. (2026-10-04) Grading a 28-day error ratio kept fixed workflows red for
//      weeks and read a fresh outage as healthy: Guest Pitch Draft failed every
//      run from 10-01 and showed healthy at 6/56. Grading is now on recent
//      production runs, newest first, and recovery takes K clean runs in a row.
//
// The changelog claimed these were caught by unit tests. They were not: no test
// existed. This is that test, so the claim is now true rather than deleted. The
// fuller cases are in tests/api/fleetGrade.test.ts.
//
//   npx tsx scripts/check-fleet-classifier.mts

import {
  classifyFailure, gradeWorkflow, summariseRuns, type Run,
} from '../api/_fleetGrade.js'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }

function eq(actual: unknown, expected: unknown, what: string) {
  if (actual !== expected) bad(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

/** Runs from a newest-first pattern: 'S' success, 'E' failure, one hour apart. */
function runs(pattern: string): Run[] {
  const t0 = Date.parse('2026-10-04T00:00:00Z')
  return [...pattern].map((c, i) => ({ id: String(1000 - i), at: new Date(t0 - i * 3_600_000).toISOString(), ok: c === 'S' }))
}
const grade = (pattern: string, opts: { active?: boolean; isScheduled?: boolean } = {}) =>
  gradeWorkflow({ active: opts.active ?? true, isScheduled: opts.isScheduled ?? true, evidence: summariseRuns(runs(pattern)) })

/* ---------- classifyFailure ---------- */

// Real strings observed in the 2026-08-19 audit, message and description joined
// the way the route joins them.
eq(classifyFailure('Forbidden - perhaps check your credentials? | Monthly usage hard limit exceeded', 'NodeApiError 403'),
   'quota', 'Zara plan limit must not read as a credential fault')
eq(classifyFailure('Forbidden - perhaps check your credentials? | Quota exceeded for quota metric Queries', 'NodeApiError 403'),
   'quota', 'Drive queries-per-minute must not read as a credential fault')

// A genuine credential fault still classifies as one.
eq(classifyFailure('No API key found in request', 'NodeApiError 401'),
   'credential', 'missing api key is a credential fault')
eq(classifyFailure('Credentials not found', 'NodeOperationError'),
   'credential', 'deleted credential is a credential fault')
eq(classifyFailure("Node does not exist for type 'gmailOAuth2'", ''),
   'credential', 'unbound credential type is a credential fault')

eq(classifyFailure('connect ECONNREFUSED 10.0.0.1:443', ''), 'network', 'refused connection is network')
eq(classifyFailure('socket hang up', ''), 'network', 'hang up is network')

eq(classifyFailure("Cannot read properties of undefined (reading 'json')", 'TypeError'),
   'logic', 'undefined read is a logic fault')
eq(classifyFailure('Could not get parameter jsCode', 'ExpressionError'),
   'logic', 'expression error is a logic fault')

eq(classifyFailure('', ''), 'unknown', 'no evidence classifies as unknown, never as healthy')

// Real strings from the 2026-10-04 audit.
eq(classifyFailure('Bad request - please check your parameters | You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC.', 'NodeApiError 400'),
   'quota', 'the Anthropic spend cap is a provider limit, not unknown')
eq(classifyFailure('this.getCredentials is not a function [line 2] | TypeError', ''),
   'logic', 'a Code node calling a missing helper is a bug, not a credential')
eq(classifyFailure('Authorization failed - please check your credentials | API key is invalid.', 'NodeApiError 401'),
   'credential', 'a dead Anthropic key is still a credential fault')

/* ---------- gradeWorkflow ---------- */

// The case the whole observer exists for: switched on, on a schedule, and it
// has not run at all. Self-reported heartbeats cannot express this.
eq(grade(''), 'dead', 'scheduled and never ran is dead, not idle')

// Not scheduled and never ran is genuinely just idle: nothing was due.
eq(grade('', { isScheduled: false }), 'idle', 'webhook-only workflow with no runs is idle')

// Switched off is idle whatever the history says.
eq(grade('EEEE', { active: false }), 'idle', 'inactive workflow is idle')

eq(grade('E'.repeat(94)), 'dead', 'HARO at 94/94 is dead')
eq(grade('S'.repeat(100)), 'healthy', 'clean run history is healthy')

// Guest Pitch Draft on 2026-10-04: six scheduled failures in a row on a dead
// key, after fifty clean runs. The 28-day ratio said 10.7% and healthy.
eq(grade('EEEEEE' + 'S'.repeat(50)), 'failing', 'a fresh run of failures is failing whatever the long ratio says')

// The same workflow two clean runs after its fix. Six of its last ten runs
// failed, and it is healthy, because the newest runs are the evidence.
eq(grade('SS' + 'EEEEEE' + 'S'.repeat(48)), 'healthy', 'a fixed outage clears on two clean runs')

// One clean run is what "last success is newer than last error" measures, and
// that test was rejected. It is not enough.
eq(grade('S' + 'EEEEEE' + 'S'.repeat(49)), 'degraded', 'one clean run after an outage is not yet recovered')

// PR Engine: fails every Tuesday and Thursday, so it is clean on most days and
// its last success is usually newer than its last error. Still not healthy.
eq(grade('SESSSSSESSSESESSSE'), 'degraded', 'a workflow failing on some days stays degraded')

if (fail) {
  console.log(`\n${fail} check(s) failed.`)
  process.exit(1)
}
console.log('fleet classifier: all checks passed')
