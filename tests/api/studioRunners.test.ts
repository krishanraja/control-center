// The Studio's Windows runners as Control Center shows them.
//
// Ruling (Krish, 2026-09-28): a second Windows machine is a cold standby with
// its task disabled. The content engine's health route now reports the active
// runner and the standby apart (content-engine, api/video-studio/_runnerWatch.ts);
// these cases pin how that report becomes words, and which runners the switch
// may offer.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  driveLabel, parseStudioRunners, roleLabel, runnerAgeLabel, studioRunnerRows, switchRefusalLine, switchTargets,
} from '../../src/lib/studioRunners.ts'

const runner = (prefix: string, over: Record<string, unknown> = {}) => ({
  runner_id_prefix: prefix,
  role: 'active',
  last_heartbeat_at: '2026-09-28T18:23:29.583Z',
  heartbeat_age_seconds: 5,
  fresh: true,
  runner_status: 'idle',
  drive_state: 'ready',
  software_commit: '6bf78628a481a61bf16ea3b4deec0d326281eee6',
  pending_receipts: 0,
  working: false,
  ...over,
})

const report = {
  fenced: true,
  active: runner('656ae98c'),
  standby: [runner('e4e562cc', { role: 'standby', heartbeat_age_seconds: 1416, fresh: false })],
  unassigned: [],
  retired_count: 4,
  waiting: { queued_commands: 0, pending_reviews: 0, ready_briefs: 0, expired_brief_leases: 0, total: 0 },
  attention: [],
}

test('the active runner and the standby are read apart, active first', () => {
  const parsed = parseStudioRunners(report)
  assert.ok(parsed)
  assert.equal(parsed.fenced, true)
  assert.deepEqual(studioRunnerRows(parsed).map(row => [row.role, row.runner_id_prefix]), [['active', '656ae98c'], ['standby', 'e4e562cc']])
  assert.equal(parsed.retired_count, 4)
})

test('an older engine without the block, or a malformed one, reads as nothing rather than a guess', () => {
  assert.equal(parseStudioRunners(undefined), null)
  assert.equal(parseStudioRunners({ active: runner('656ae98c') }), null)
  const odd = parseStudioRunners({ ...report, active: { runner_id_prefix: 'a'.repeat(64) }, standby: [{}, runner('e4e562cc', { role: 'standby' })] })
  assert.ok(odd)
  assert.equal(odd.active, null, 'a full hash never passes as a prefix')
  assert.equal(odd.standby.length, 1)
})

test('last heartbeat and Drive state are said in plain words', () => {
  assert.equal(runnerAgeLabel(5), '5 seconds ago')
  assert.equal(runnerAgeLabel(1416), '24 minutes ago')
  assert.equal(runnerAgeLabel(98_243), '27 hours ago')
  assert.equal(runnerAgeLabel(1_752_123), '20 days ago')
  assert.equal(runnerAgeLabel(null), 'never heard')
  assert.equal(driveLabel('ready'), 'Drive ready')
  assert.equal(driveLabel('unavailable'), 'Drive offline')
  assert.equal(roleLabel('active', true), 'Active')
  assert.equal(roleLabel('active', false), 'Working (roles not set)')
  assert.equal(roleLabel('standby', true), 'Standby')
})

test('the switch is offered only to a runner that is up, idle, Drive ready and holding nothing', () => {
  const cold = parseStudioRunners(report)!
  assert.deepEqual(switchTargets(cold), [], 'a cold standby with its task off is not offered')
  const started = parseStudioRunners({ ...report, standby: [runner('e4e562cc', { role: 'standby' })] })!
  assert.deepEqual(switchTargets(started).map(row => row.runner_id_prefix), ['e4e562cc'])
  const degraded = parseStudioRunners({ ...report, standby: [runner('e4e562cc', { role: 'standby', drive_state: 'unavailable' })] })!
  assert.deepEqual(switchTargets(degraded), [])
  const unseeded = parseStudioRunners({ ...report, fenced: false, standby: [runner('e4e562cc', { role: 'standby' })] })!
  assert.deepEqual(switchTargets(unseeded), [], 'before the roles exist there is nothing to switch')
})

test('every refusal the engine can give has its own sentence, and nothing unknown reads as success', () => {
  for (const code of [
    'active_runner_still_running', 'active_runner_has_pending_receipts', 'active_runner_holds_work',
    'target_runner_not_ready', 'active_runner_changed', 'runner_retired', 'runner_roles_not_seeded',
  ]) {
    assert.notEqual(switchRefusalLine(code), switchRefusalLine('something_else'), code)
  }
  assert.match(switchRefusalLine('something_else'), /Nothing changed/)
  assert.doesNotMatch(Object.values({ a: switchRefusalLine('active_runner_holds_work') }).join(' '), /\u2014/)
})
