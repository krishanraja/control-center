// What the n8n fleet observer is allowed to call broken, and when it may say a
// workflow is fixed.
//
// The 2026-10-04 audit found api/health/fleet-reconcile.ts wrong both ways. A
// 28-day error ratio kept fixed workflows red for weeks, counted manual test
// runs, and read Guest Pitch Draft as healthy while it failed every run. And it
// never resolved an alert: 479 open runtime_failing rows, none ever closed.
//
// The execution records below are copied from n8n (search_workflow_executions,
// read on 2026-10-04), trimmed to the fields the grader reads. Each case is one
// way the monitor could start lying again.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ALERTABLE, MAX_CLEAN_RUNS, MIN_CLEAN_RUNS, RECENT_RUNS, alertTier,
  classifyFailure, collectRuns, describeEvidence, executionTime, gradeWorkflow, newestFirst, planResolutions,
  requiredCleanRuns, runOutcome, summariseRuns,
  type ExecutionLike, type GradedWorkflow, type OpenAlert, type Run,
} from '../../api/_fleetGrade.ts'

const NOW = Date.parse('2026-10-04T02:00:00.000Z')
const SINCE = NOW - 28 * 86_400_000

/** Runs from a newest-first pattern: 'S' success, 'E' failure, one hour apart. */
function runs(pattern: string): Run[] {
  return [...pattern].map((c, i) => ({
    id: String(50_000 - i), at: new Date(NOW - (i + 1) * 3_600_000).toISOString(), ok: c === 'S',
  }))
}
function ex(id: number, workflowId: string, status: string, mode: string, startedAt: string | null, stoppedAt?: string | null): ExecutionLike {
  return { id: String(id), workflowId, status, mode, startedAt, stoppedAt: stoppedAt ?? startedAt }
}
function gradeOf(list: Run[], opts: { active?: boolean; isScheduled?: boolean } = {}) {
  const evidence = summariseRuns(list)
  return { evidence, status: gradeWorkflow({ active: opts.active ?? true, isScheduled: opts.isScheduled ?? true, evidence }) }
}
function gradeExecutions(executions: ExecutionLike[], workflowId: string, opts: { isScheduled?: boolean } = {}) {
  return gradeOf(collectRuns(executions, SINCE).byWorkflow.get(workflowId) || [], opts)
}

// ---------------------------------------------------------------------------
// Real records
// ---------------------------------------------------------------------------

// Nell | Guest Pitch Draft (GuWi9nxNHpbFEfyV), twice a day. Every run since
// 10-01 04:00 failed on a dead Anthropic key; the runs before it fetched an
// empty batch and succeeded without calling Anthropic.
const GUEST_PITCH: ExecutionLike[] = [
  ex(44813, 'GuWi', 'error', 'trigger', '2026-10-03T16:00:16.082Z'),
  ex(44755, 'GuWi', 'error', 'trigger', '2026-10-03T04:00:16.087Z'),
  ex(44696, 'GuWi', 'error', 'trigger', '2026-10-02T16:00:16.098Z'),
  ex(44636, 'GuWi', 'error', 'trigger', '2026-10-02T04:00:16.086Z'),
  ex(44580, 'GuWi', 'error', 'trigger', '2026-10-01T16:00:16.087Z'),
  ex(44522, 'GuWi', 'error', 'trigger', '2026-10-01T04:00:16.087Z'),
  // 50 clean runs back to 2026-09-06, twice a day.
  ...Array.from({ length: 50 }, (_, i) =>
    ex(44464 - i * 60, 'GuWi', 'success', 'trigger', new Date(Date.parse('2026-09-30T16:00:16Z') - i * 43_200_000).toISOString())),
]

// Nova | Closed-Loop PR Engine (hCbvRXoGWaqG1Znx). Phase 2 reads a table
// dropped on 2026-05-22, so every Tuesday and Thursday run fails. It also runs
// as a sub-workflow of the Orchestrator ('integrated'), which succeeds.
const PR_ENGINE: ExecutionLike[] = [
  ex(44711, 'hCbv', 'success', 'trigger', '2026-10-02T18:00:00.544Z'),
  ex(44594, 'hCbv', 'error', 'trigger', '2026-10-01T18:00:00.459Z'),
  ex(44480, 'hCbv', 'success', 'trigger', '2026-09-30T18:00:00.671Z'),
  ex(44439, 'hCbv', 'success', 'integrated', '2026-09-30T12:35:05.794Z'),
  ex(44383, 'hCbv', 'success', 'integrated', '2026-09-30T09:15:26.399Z'),
  ex(44361, 'hCbv', 'success', 'integrated', '2026-09-30T09:02:30.920Z'),
  ex(44355, 'hCbv', 'success', 'integrated', '2026-09-30T09:02:27.349Z'),
  ex(44271, 'hCbv', 'error', 'trigger', '2026-09-29T18:00:00.592Z'),
  ex(44158, 'hCbv', 'success', 'trigger', '2026-09-28T19:00:00.473Z'),
  ex(44151, 'hCbv', 'success', 'trigger', '2026-09-28T18:00:00.603Z'),
  ex(43790, 'hCbv', 'success', 'trigger', '2026-09-25T18:00:00.489Z'),
  ex(43673, 'hCbv', 'error', 'trigger', '2026-09-24T18:00:00.422Z'),
  ex(43558, 'hCbv', 'success', 'trigger', '2026-09-23T18:00:00.568Z'),
  ex(43436, 'hCbv', 'error', 'trigger', '2026-09-22T18:00:00.425Z'),
  ex(43318, 'hCbv', 'success', 'trigger', '2026-09-21T19:00:00.499Z'),
  ex(43311, 'hCbv', 'success', 'trigger', '2026-09-21T18:00:00.409Z'),
  ex(42926, 'hCbv', 'success', 'trigger', '2026-09-18T18:00:00.730Z'),
  ex(42806, 'hCbv', 'error', 'trigger', '2026-09-17T18:00:00.211Z'),
  ex(42689, 'hCbv', 'success', 'trigger', '2026-09-16T18:00:00.621Z'),
  ex(42569, 'hCbv', 'error', 'trigger', '2026-09-15T18:00:00.458Z'),
]

// System | Orchestrator (u0kIULJBJL4dGcuR), webhook-driven. Agent `zara` is
// still mapped to a switched-off workflow, so any zara task event fails. Its
// newest 34 runs on 09-30, as n8n listed them.
const ORCH_PATTERN = 'SSSSSS' + 'E' + 'SSSSSSSSSSSSS' + 'E' + 'SSSS' + 'E' + 'SSSSSSSSSSSS' + 'E'
const ORCHESTRATOR: ExecutionLike[] = [...ORCH_PATTERN].map((c, i) =>
  ex(44456 - i, 'u0kI', c === 'S' ? 'success' : 'error', 'webhook', new Date(Date.parse('2026-09-30T14:35:03Z') - i * 60_000).toISOString()))

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

test('Guest Pitch failing every run since 10-01 is failing, not healthy', () => {
  const { status, evidence } = gradeExecutions(GUEST_PITCH, 'GuWi')
  // The old ratio: 6 of 56 is 10.7%, under the 15% line, so it read healthy.
  assert.equal(evidence.runs, 56)
  assert.equal(evidence.failures, 6)
  assert.equal(evidence.streak, 6)
  assert.equal(status, 'failing')
  assert.ok(ALERTABLE.has(status))
  assert.equal(describeEvidence(evidence), 'Its last 6 production runs failed.')
})

test('Guest Pitch is caught on 10-01 after its second failure, not days later', () => {
  // As n8n held it at 10-01 18:00: two scheduled failures after fifty clean
  // runs. Two of the last ten is only 20%, so a recent-ratio rule alone would
  // call this degraded, tier 2, off the Home alarm. Two in a row is an outage.
  const { status, evidence } = gradeExecutions(GUEST_PITCH.slice(4), 'GuWi')
  assert.equal(evidence.streak, 2)
  assert.equal(evidence.recentFailures, 2)
  assert.equal(status, 'failing')
})

test('a workflow that fails every run for ten runs is dead even with older successes', () => {
  assert.equal(gradeOf(runs('E'.repeat(RECENT_RUNS) + 'S'.repeat(30))).status, 'dead')
  assert.equal(gradeOf(runs('E'.repeat(RECENT_RUNS - 1) + 'S'.repeat(30))).status, 'failing')
})

test('Guest Pitch recovers on two clean scheduled runs after the fix, not one', () => {
  const fixedOnce: ExecutionLike[] = [
    ex(44900, 'GuWi', 'success', 'trigger', '2026-10-04T04:00:16Z'), ...GUEST_PITCH]
  const one = gradeExecutions(fixedOnce, 'GuWi')
  // Last success is now newer than last error. That alone is not recovery.
  assert.ok(Date.parse(one.evidence.lastSuccessAt!) > Date.parse(one.evidence.lastFailureAt!))
  assert.equal(one.status, 'degraded')
  assert.match(describeEvidence(one.evidence), /needs 2 clean runs in a row to count as recovered and has 1/)

  const fixedTwice: ExecutionLike[] = [
    ex(44960, 'GuWi', 'success', 'trigger', '2026-10-04T16:00:16Z'), ...fixedOnce]
  const two = gradeExecutions(fixedTwice, 'GuWi')
  // Six of the last ten runs failed, and the newest runs say it works. The
  // newest runs win: this is the fixed-but-red-for-weeks case.
  assert.equal(two.evidence.recentFailures, 6)
  assert.equal(two.status, 'healthy')
})

test('PR Engine stays degraded although its last success is newer than its last error', () => {
  const { status, evidence } = gradeExecutions(PR_ENGINE, 'hCbv')
  assert.ok(Date.parse(evidence.lastSuccessAt!) > Date.parse(evidence.lastFailureAt!))
  // It went five runs clean between Tuesday's and Thursday's failures.
  assert.equal(evidence.longestCleanGap, 5)
  assert.equal(evidence.requiredClean, 6)
  assert.equal(evidence.clean, 1)
  assert.equal(status, 'degraded')
})

test('PR Engine is still degraded on Monday night, after its longest normal clean stretch', () => {
  // Fri, Mon 18:00 and Mon 19:00 succeed, as every week. Tuesday will fail.
  const monday: ExecutionLike[] = [
    ex(44990, 'hCbv', 'success', 'trigger', '2026-10-05T19:00:00Z'),
    ex(44980, 'hCbv', 'success', 'trigger', '2026-10-05T18:00:00Z'),
    ...PR_ENGINE,
  ]
  const { status, evidence } = gradeExecutions(monday, 'hCbv')
  assert.equal(evidence.clean, 3)
  assert.equal(status, 'degraded')
})

test('the Orchestrator failing on specific events stays degraded after six clean runs', () => {
  const { status, evidence } = gradeExecutions(ORCHESTRATOR, 'u0kI', { isScheduled: false })
  assert.ok(Date.parse(evidence.lastSuccessAt!) > Date.parse(evidence.lastFailureAt!))
  // Only one of its ten newest runs failed, so a recent-ratio rule alone would
  // call it healthy. It went 13 runs clean between failures in the same burst.
  assert.equal(evidence.recentFailures, 1)
  assert.equal(evidence.longestCleanGap, 13)
  assert.equal(evidence.requiredClean, MAX_CLEAN_RUNS)
  assert.equal(evidence.clean, 6)
  assert.equal(status, 'degraded')
})

test('an outage that a fix ended clears; the same failures spread out do not', () => {
  // Daily Brief on the spend cap: four failures in a row, then clean days.
  assert.equal(gradeOf(runs('SS' + 'EEEE' + 'S'.repeat(20))).status, 'healthy')
  // The same four failures, one every other run, need more than two clean runs.
  const spread = gradeOf(runs('SS' + 'ESESESE' + 'S'.repeat(17)))
  assert.equal(spread.evidence.requiredClean, 2)
  assert.equal(spread.status, 'healthy')
  const wider = gradeOf(runs('SSS' + 'ESSSE' + 'S'.repeat(20)))
  assert.equal(wider.evidence.requiredClean, 4)
  assert.equal(wider.status, 'degraded')
})

test('alternating success and failure: failing after a failure, degraded after a success', () => {
  assert.equal(gradeOf(runs('ESESESESES')).status, 'failing')
  // The newest run worked, so it is not failing, and it is not recovered.
  assert.equal(gradeOf(runs('SESESESESE')).status, 'degraded')
})

test('the first clean run after an outage reads as recovering, not failing', () => {
  const { status, evidence } = gradeOf(runs('S' + 'EEEEEE' + 'S'.repeat(30)))
  assert.equal(evidence.recentFailures, 6)
  assert.equal(status, 'degraded')
})

test('the newest run failing once is degraded, not failing', () => {
  // Feedback Aggregation, weekly: the spend cap took its 09-27 run.
  const { status, evidence } = gradeOf(runs('ESSS'))
  assert.equal(status, 'degraded')
  assert.equal(describeEvidence(evidence), '1 of its last 4 production runs failed, including the newest one.')
})

test('scheduled with no production run is dead; switched off or unscheduled is idle', () => {
  assert.equal(gradeOf([], { isScheduled: true }).status, 'dead')
  assert.equal(gradeOf([], { isScheduled: false }).status, 'idle')
  assert.equal(gradeOf(runs('EEEE'), { active: false }).status, 'idle')
  assert.equal(describeEvidence(summariseRuns([])), 'It is switched on and scheduled, but n8n shows no production run in 28 days.')
  // An unscheduled workflow with no runs must not be described as scheduled.
  assert.equal(describeEvidence(summariseRuns([]), false), 'No production run in 28 days, and nothing schedules it.')
})

test('every production run failing is dead, and says so in plain words', () => {
  assert.equal(gradeOf(runs('EEEE')).status, 'dead')
  assert.equal(describeEvidence(summariseRuns(runs('EEEE'))), 'None of its 4 production runs in 28 days succeeded.')
  assert.equal(describeEvidence(summariseRuns(runs('E'))), 'Its only production run in 28 days failed.')
})

test('required clean runs: two at least, one more than the longest clean gap, ten at most', () => {
  assert.equal(MIN_CLEAN_RUNS, 2)
  assert.equal(requiredCleanRuns(0), 2)
  assert.equal(requiredCleanRuns(1), 2)
  assert.equal(requiredCleanRuns(5), 6)
  assert.equal(requiredCleanRuns(29), MAX_CLEAN_RUNS)
  // Two blips 300 runs apart must not demand 301 clean runs.
  const busy = gradeOf(runs('S'.repeat(12) + 'E' + 'S'.repeat(300) + 'E'))
  assert.equal(busy.evidence.requiredClean, MAX_CLEAN_RUNS)
  assert.equal(busy.status, 'healthy')
})

test('failure classes name the real cause, from the strings n8n recorded', () => {
  // workflow_health on 2026-10-04 filed the spend cap as unknown and a Code
  // node bug as a credential fault.
  assert.equal(classifyFailure('Bad request - please check your parameters | You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC.', 'NodeApiError 400'), 'quota')
  assert.equal(classifyFailure('this.getCredentials is not a function [line 2] | TypeError', ''), 'logic')
  assert.equal(classifyFailure('Authorization failed - please check your credentials | API key is invalid.', 'NodeApiError 401'), 'credential')
  // Quota still outranks the credential wrapper n8n puts on most errors.
  assert.equal(classifyFailure('Forbidden - perhaps check your credentials? | Monthly usage hard limit exceeded', 'NodeApiError 403'), 'quota')
})

// ---------------------------------------------------------------------------
// Which runs count
// ---------------------------------------------------------------------------

test('manual test runs are left out: the 10-03 inbox tests raise nothing', () => {
  // Krish | Inbox Router (GVnJkvJm9vmLG4Jp): three manual runs during the
  // repair session, one deliberately on a made-up id.
  const inbox: ExecutionLike[] = [
    ex(44864, 'GVnJ', 'success', 'manual', '2026-10-03T20:30:43.217Z'),
    ex(44863, 'GVnJ', 'success', 'manual', '2026-10-03T20:30:39.172Z'),
    ex(44862, 'GVnJ', 'error', 'manual', '2026-10-03T20:30:36.881Z'),
  ]
  const collected = collectRuns(inbox, SINCE)
  assert.equal(collected.byWorkflow.get('GVnJ'), undefined)
  assert.equal(collected.testRuns, 3)
  assert.equal(gradeExecutions(inbox, 'GVnJ', { isScheduled: false }).status, 'idle')
})

test('a manual run cannot clear a production failure, and a manual failure cannot raise one', () => {
  // Nova | Visibility Deep Enrich (kbHAHuxfzQLLlysG): five webhook runs failed
  // on the dead key, then a manual test passed on the new key.
  const enrich: ExecutionLike[] = [
    ex(44844, 'kbHA', 'success', 'manual', '2026-10-03T18:49:57.250Z'),
    ...[44842, 44841, 44840, 44839, 44838].map(id => ex(id, 'kbHA', 'error', 'webhook', `2026-10-03T18:04:48.${id - 44000}Z`)),
  ]
  assert.equal(gradeExecutions(enrich, 'kbHA', { isScheduled: false }).status, 'dead')

  // Content Lane Sourcing: the real 10-03 scheduled failure, the repair
  // session's manual failure after it, then two scheduled runs that would
  // prove the fix. The manual failure does not reset the clean count.
  const cls: ExecutionLike[] = [
    ex(45100, 'rRAy', 'success', 'trigger', '2026-10-05T17:00:48Z'),
    ex(44950, 'rRAy', 'success', 'trigger', '2026-10-04T17:00:48Z'),
    ex(44826, 'rRAy', 'error', 'manual', '2026-10-03T17:47:48.828Z'),
    ex(44825, 'rRAy', 'error', 'trigger', '2026-10-03T17:00:48.084Z'),
    ex(44708, 'rRAy', 'error', 'trigger', '2026-10-02T17:00:48.086Z'),
  ]
  const after = gradeExecutions(cls, 'rRAy')
  assert.equal(after.evidence.clean, 2)
  assert.equal(after.status, 'healthy')
})

test('retries and evaluation runs are left out; webhook, integrated and error runs count', () => {
  const mixed: ExecutionLike[] = [
    ex(10, 'w', 'error', 'retry', '2026-10-03T10:00:00Z'),
    ex(9, 'w', 'error', 'evaluation', '2026-10-03T09:00:00Z'),
    ex(8, 'w', 'success', 'webhook', '2026-10-03T08:00:00Z'),
    ex(7, 'w', 'success', 'integrated', '2026-10-03T07:00:00Z'),
    ex(6, 'w', 'success', 'error', '2026-10-03T06:00:00Z'),
    ex(5, 'w', 'success', 'trigger', '2026-10-03T05:00:00Z'),
  ]
  const c = collectRuns(mixed, SINCE)
  assert.equal(c.byWorkflow.get('w')!.length, 4)
  assert.equal(c.testRuns, 2)
})

test('runs still in progress are not graded; crashed and canceled are failures', () => {
  assert.equal(runOutcome('success'), true)
  assert.equal(runOutcome('error'), false)
  assert.equal(runOutcome('crashed'), false)
  assert.equal(runOutcome('canceled'), false)
  for (const s of ['running', 'waiting', 'new', 'unknown', null, undefined]) assert.equal(runOutcome(s), null)
  // The old reconcile counted a running execution as a success.
  const list: ExecutionLike[] = [
    ex(3, 'w', 'running', 'trigger', '2026-10-03T12:00:00Z'),
    ex(2, 'w', 'crashed', 'trigger', '2026-10-03T11:00:00Z'),
    ex(1, 'w', 'error', 'trigger', '2026-10-03T10:00:00Z'),
    ex(0, 'w', 'success', 'trigger', '2026-10-03T09:00:00Z'),
  ]
  const { status, evidence } = gradeExecutions(list, 'w')
  assert.equal(evidence.runs, 3)
  assert.equal(evidence.streak, 2)
  assert.equal(status, 'failing')
})

test('startedAt null: dated by stoppedAt everywhere, or left out everywhere', () => {
  // Zara | Layer 1 Signal Inbox (b1UkRo6XuymALAgb), execution 42415: a Drive
  // poller that failed before it started. The old reconcile counted it inside
  // every window yet left last_error_at null.
  const zara: ExecutionLike[] = [ex(42415, 'b1Uk', 'error', 'trigger', null, '2026-09-14T13:13:11.069Z')]
  assert.equal(executionTime(zara[0]), '2026-09-14T13:13:11.069Z')
  const { status, evidence } = gradeExecutions(zara, 'b1Uk', { isScheduled: false })
  assert.equal(evidence.runs, 1)
  assert.equal(evidence.lastFailureAt, '2026-09-14T13:13:11.069Z')
  assert.equal(evidence.lastRunAt, '2026-09-14T13:13:11.069Z')
  assert.equal(status, 'dead')

  // The same record once its stoppedAt has aged out of the window: not counted.
  const old = collectRuns([ex(1, 'z', 'error', 'trigger', null, '2026-08-01T00:00:00Z')], SINCE)
  assert.equal(old.byWorkflow.get('z'), undefined)
  assert.equal(old.undated, 0)

  // No time at all: no window can hold it, so it is left out and counted.
  const none = collectRuns([ex(2, 'z', 'error', 'trigger', null, null)], SINCE)
  assert.equal(none.byWorkflow.get('z'), undefined)
  assert.equal(none.undated, 1)

  // An unparseable time is treated the same as no time.
  assert.equal(executionTime({ startedAt: 'not a date', stoppedAt: null }), null)
})

test('runs outside the 28-day window do not count', () => {
  const list: ExecutionLike[] = [
    ex(2, 'w', 'success', 'trigger', '2026-10-03T00:00:00Z'),
    ex(1, 'w', 'error', 'trigger', '2026-09-01T00:00:00Z'),
  ]
  assert.equal(gradeExecutions(list, 'w').evidence.failures, 0)
})

test('order is newest first by time, then by execution id', () => {
  const t = '2026-10-03T09:02:30.000Z'
  const sorted = [
    { id: '7', at: t, ok: true }, { id: '9', at: t, ok: false }, { id: '8', at: '2026-10-03T10:00:00.000Z', ok: true },
  ].sort(newestFirst)
  assert.deepEqual(sorted.map(r => r.id), ['8', '9', '7'])
  // n8n lists by id, which is not always time order; the grader re-sorts.
  const shuffled = collectRuns([
    ex(1, 'w', 'error', 'trigger', '2026-10-03T12:00:00Z'),
    ex(2, 'w', 'success', 'trigger', '2026-10-03T11:00:00Z'),
  ], SINCE)
  assert.equal(shuffled.byWorkflow.get('w')![0].ok, false)
})

// ---------------------------------------------------------------------------
// Resolving alerts
// ---------------------------------------------------------------------------

function graded(id: string, pattern: string, opts: { active?: boolean; isScheduled?: boolean } = {}): GradedWorkflow {
  const { evidence, status } = gradeOf(runs(pattern), opts)
  return { workflow_id: id, status, active: opts.active ?? true, evidence }
}

/** Open runtime_failing rows: one per id, at the given tier. */
const open = (tier: number, ...ids: string[]): OpenAlert[] => ids.map(workflow_id => ({ workflow_id, tier }))

test('a workflow that recovered has its open alerts resolved, with the reason', () => {
  const plan = planResolutions([graded('daily-brief', 'SSSS' + 'EEEE' + 'S'.repeat(10))], open(2, 'daily-brief'), true)
  assert.deepEqual(plan, [{ workflowId: 'daily-brief', note: 'Resolved by fleet-reconcile: Its last 4 production runs succeeded.' }])
})

test('alertable workflows keep their alerts, whatever their last success says', () => {
  const pr = gradeExecutions(PR_ENGINE, 'hCbv')
  const orch = gradeExecutions(ORCHESTRATOR, 'u0kI', { isScheduled: false })
  const gp = gradeExecutions(GUEST_PITCH, 'GuWi')
  const plan = planResolutions([
    { workflow_id: 'hCbv', status: pr.status, active: true, evidence: pr.evidence },
    { workflow_id: 'u0kI', status: orch.status, active: true, evidence: orch.evidence },
    { workflow_id: 'GuWi', status: gp.status, active: true, evidence: gp.evidence },
  ], [...open(2, 'hCbv', 'u0kI'), ...open(3, 'GuWi')], true)
  assert.deepEqual(plan, [])
})

test('one clean run after an outage does not resolve the alert', () => {
  assert.deepEqual(planResolutions([graded('w', 'S' + 'EEE' + 'S'.repeat(10))], open(3, 'w'), false), [
    // It is recovering (degraded), so only the rows saying it is down close.
    { workflowId: 'w', minTier: 3, note: 'Resolved by fleet-reconcile: no longer failing, so it is off the alarm. It stays on watch as degraded. 3 of its last 10 production runs failed. It needs 2 clean runs in a row to count as recovered and has 1.' },
  ])
  assert.deepEqual(planResolutions([graded('w', 'S' + 'EEE' + 'S'.repeat(10))], open(2, 'w'), true), [])
})

test('a workflow that drops from failing to degraded leaves the Home alarm but stays on watch', () => {
  // Feedback Aggregation on 2026-10-04: tier-3 rows from when it was failing,
  // degraded now. Home shows every open row at tier 3 or above, so those rows
  // would keep calling it down.
  const plan = planResolutions([graded('agg', 'ESSS')], [...open(3, 'agg', 'agg'), ...open(2, 'agg')], true)
  assert.equal(plan.length, 1)
  assert.equal(plan[0].workflowId, 'agg')
  assert.equal(plan[0].minTier, 3)
  assert.match(plan[0].note, /stays on watch as degraded/)
  // Failing workflows keep their tier-3 rows.
  assert.deepEqual(planResolutions([graded('gp', 'EEE' + 'S'.repeat(9))], open(3, 'gp'), true), [])
})

test('switched-off, idle and vanished workflows are resolved, each with its own reason', () => {
  const plan = planResolutions([
    graded('off', 'EEEE', { active: false }),
    graded('idle', '', { isScheduled: false }),
    graded('clean', 'S'.repeat(8)),
  ], [...open(3, 'off', 'idle'), ...open(2, 'clean', 'gone', 'gone')], true)
  assert.deepEqual(plan.map(p => p.workflowId), ['off', 'idle', 'clean', 'gone'])
  assert.ok(plan.every(p => p.minTier === undefined))
  assert.match(plan[0].note, /switched off in n8n/)
  assert.match(plan[1].note, /nothing schedules it/)
  assert.match(plan[2].note, /No production run failed in 28 days/)
  assert.match(plan[3].note, /no longer lists this workflow/)
})

test('a workflow missing from a list that was cut short is left open', () => {
  assert.deepEqual(planResolutions([], open(3, 'gone'), false), [])
})

test('workflows with no open alert need no resolution', () => {
  assert.deepEqual(planResolutions([graded('clean', 'SSSS')], [], true), [])
})

test('alert tiers: degraded writes tier 2, failing and dead write tier 3', () => {
  assert.equal(alertTier('degraded'), 2)
  assert.equal(alertTier('failing'), 3)
  assert.equal(alertTier('dead'), 3)
})

test('every sentence the grader writes is plain: no em dash, no ellipsis', () => {
  const samples = [
    '', 'E', 'EEEE', 'EEEEEE' + 'S'.repeat(20), 'S'.repeat(5), 'SS' + 'EEE' + 'S'.repeat(5),
    'ESSS', 'S' + 'EEE' + 'S'.repeat(5), 'SESESESESE',
  ].map(p => describeEvidence(summariseRuns(runs(p))))
  const notes = planResolutions([
    graded('a', 'EEEE', { active: false }), graded('b', '', { isScheduled: false }), graded('c', 'SSSS'),
    graded('e', 'ESSS'),
  ], [...open(3, 'a', 'b', 'c', 'd', 'e')], true).map(p => p.note)
  assert.equal(notes.length, 5)
  for (const s of [...samples, ...notes]) {
    assert.ok(!/[\u2014\u2026]/.test(s), `not plain: ${s}`)
    assert.ok(s.length > 0)
  }
})
