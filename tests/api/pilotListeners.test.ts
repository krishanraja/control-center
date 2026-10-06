import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LISTENER_PRODUCT, LISTENER_SOURCE, LISTENER_SYNC_WORKFLOW_ID,
  countPilotListeners, listenerRowFor, listenerSyncState, listenerGoalView,
} from '../../src/lib/pilotListeners.ts'
import { listenerRows, planListenerSync, runListenerSync, outcomeLine } from '../../api/_fulltimeListeners.js'
import { JOBS, MISSION_JOBS, PILOT_SEPARATION, missionBlock, jobLabel } from '../../api/_mission.js'
import { JOB_OPTIONS } from '../../src/content/jobs.ts'
import { buildStrategistSystem } from '../../api/_strategist.js'
import { buildBoard, type BoardInput } from '../../src/lib/portfolioBoard.ts'
import { PORTFOLIO } from '../../src/lib/portfolio.ts'
import { isTestRecord } from '../../src/lib/recordHygiene.ts'

// Rulings (Krish, 2026-10-06): "yes and 100": copy Full Time sign-ups into
// Control Center so pilot listeners can be counted, toward 100. And Full
// Time's pilot listeners and Mindmake's pilot customers "are TOTALLY
// unrelated and cannot be confused with one another". These tests hold both.

const NOW = '2026-10-06T12:00:00Z'
const user = (id: string, email: string, over: Record<string, unknown> = {}) =>
  ({ id, email, email_confirmed_at: '2026-10-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z', is_anonymous: false, ...over })
const listener = (id: string, over: Record<string, unknown> = {}) =>
  ({ product: 'full_time', kind: 'free_signup', raw: { fulltime_user_id: id, pilot_listener: true, test_account: false, ...over } })

// ---------------------------------------------------------------- the jobs

test('Full Time has its own job, and its words never say pilot customers', () => {
  const ft = JOBS.find(j => j.id === 'fill_listeners')!
  assert.equal(ft.venture, 'full_time')
  assert.match(ft.label, /pilot listeners/)
  assert.doesNotMatch(ft.label, /customer/i)
  const mm = JOBS.find(j => j.id === 'fill_pilots')!
  assert.equal(mm.venture, 'mindmake')
  assert.doesNotMatch(mm.label, /listener/i)
  assert.equal(jobLabel('fill_pilots'), 'Find pilot customers')
  // The UI chips say the same thing, in full, so a chip can never read "pilots" alone.
  const chip = (v: string) => JOB_OPTIONS.find(o => o.value === v)!.label
  assert.equal(chip('fill_pilots'), 'Find pilot customers')
  assert.equal(chip('fill_listeners'), 'Find Full Time pilot listeners')
})

test('the five jobs of the OS stay five and Mindmake\'s; the mission prompt never offers fill_listeners as one of them', () => {
  assert.deepEqual(MISSION_JOBS.map(j => j.id), ['fill_pilots', 'keep_honest', 'run_pilots', 'feed_demand', 'keep_edge'])
  const block = missionBlock()
  assert.match(block, /The five jobs of the OS/)
  assert.ok(!/^\d\. Find pilot listeners/m.test(block), 'Full Time is not listed as a job of the OS')
  assert.ok(block.includes(PILOT_SEPARATION), 'and every mission prompt says the two pilots are different')
})

test('the strategist offers only Mindmake\'s open jobs and carries the separation line', () => {
  const sys = buildStrategistSystem({ source: 'daily' })
  assert.ok(sys.includes('[fill_pilots]'))
  assert.ok(!sys.includes('[fill_listeners]'), 'never offered as a strategist job')
  assert.ok(sys.includes(PILOT_SEPARATION))
})

// ---------------------------------------------------------------- the definition and the mapping

test('a pilot listener is a confirmed, non-anonymous Full Time account; nothing that names a person is copied', () => {
  const ok = listenerRowFor(user('u1', 'Fan@Club.org'), { id: 'u1', display_name: 'A Fan', plan: 'free' }, true, isTestRecord)!
  assert.equal(ok.product, 'full_time')
  assert.equal(ok.kind, 'free_signup', 'paying is Stripe\'s to say, never the copy\'s')
  assert.equal(ok.source, LISTENER_SOURCE)
  assert.equal(ok.email, null)
  assert.equal(ok.full_name, null)
  assert.ok(!JSON.stringify(ok).includes('@'), 'no email anywhere in the row')
  assert.ok(!JSON.stringify(ok).includes('A Fan'), 'no name anywhere in the row')
  assert.deepEqual(ok.raw, { fulltime_user_id: 'u1', pilot_listener: true, test_account: false, on_launch_list: true, fulltime_plan: 'free' })

  assert.equal(listenerRowFor(user('u2', 'x@y.org', { email_confirmed_at: null }), null, false, isTestRecord), null, 'unconfirmed')
  assert.equal(listenerRowFor(user('u3', 'x@y.org', { is_anonymous: true }), null, false, isTestRecord), null, 'anonymous')
  assert.equal(listenerRowFor(user('u4', ''), null, false, isTestRecord), null, 'no email')
})

test('test, QA and founder accounts are copied but marked, and never counted', () => {
  const rows = listenerRows(
    [user('a', 'qa-bot@merciless-qa.dev'), user('b', 'krishanraja@gmail.com'), user('c', 'real.fan@club.org'), user('c', 'real.fan@club.org')],
    [], [],
  )
  assert.equal(rows.length, 3, 'one row per account, a repeated account once')
  assert.deepEqual(rows.map(r => r.raw.test_account), [true, true, false])
  assert.equal(countPilotListeners(rows), 1)
})

// ---------------------------------------------------------------- separation in the count

test('the listener count reads only Full Time listener rows: no other product, no Stripe row, ever', () => {
  const rows = [
    listener('u1'), listener('u2'), listener('u2'),                       // one account counted once
    listener('u3', { test_account: true }),                               // a test account
    listener('u4', { pilot_listener: false, removed_at: NOW }),           // gone from Full Time
    { product: 'full_time', kind: 'paid', raw: null },                    // Full Time's Stripe row
    // Mindmake's rows, even ones dressed up as listeners, never count.
    { product: 'mindmake', kind: 'free_signup', raw: { fulltime_user_id: 'x', pilot_listener: true } },
    { product: 'publication', kind: 'paid', raw: { fulltime_user_id: 'y', pilot_listener: true } },
    { product: 'mm_ctrl', kind: 'free_signup', raw: null },
  ]
  assert.equal(countPilotListeners(rows), 2)
})

test('Mindmake sign-ups never move Full Time\'s listener cell, and listeners never reach another product\'s sign-ups', () => {
  const base: BoardInput = { signals: [], reviews: [], customers: [], audience: {}, usage: [], listenerSync: { ok: true, line: null } }
  const withListeners = buildBoard({ ...base, customers: [listener('u1'), listener('u2'), listener('u3')] }, new Date(NOW))
  const ft = withListeners.rows.find(r => r.product.venture === 'full_time')!
  assert.equal(ft.cells.signups.value, '3 of 100')
  assert.equal(ft.cells.signups.note, 'pilot listeners')
  for (const r of withListeners.rows.filter(r => r.product.venture !== 'full_time')) {
    assert.ok(!(r.signups ?? 0), `${r.product.label} counted no Full Time listener`)
  }

  const mindmakeNoise = [
    { product: 'mindmake', kind: 'free_signup', raw: null },
    { product: 'mm_ctrl', kind: 'free_signup', raw: null },
    { product: 'publication', kind: 'paid', raw: null },
    { product: 'full_time', kind: 'paid', raw: null },
  ]
  const noisy = buildBoard({ ...base, customers: [listener('u1'), ...mindmakeNoise] }, new Date(NOW))
  assert.equal(noisy.rows.find(r => r.product.venture === 'full_time')!.cells.signups.value, '1 of 100')
})

test('before the copy has worked, the cell says not connected, never 0 of 100', () => {
  const base: BoardInput = { signals: [], reviews: [], customers: [], audience: {}, usage: [] }
  for (const listenerSync of [undefined, null, { ok: false, line: 'The Full Time copy has never worked: Full Time refused the read key (HTTP 401)' }]) {
    const b = buildBoard({ ...base, listenerSync }, new Date(NOW))
    const c = b.rows.find(r => r.product.venture === 'full_time')!.cells.signups
    assert.equal(c.state, 'unwired')
    assert.equal(c.value, 'Not connected')
    assert.ok(!/0 of/.test(c.value))
  }
})

test('the target lives once, on the product, at 100', () => {
  const ft = PORTFOLIO.find(p => p.venture === 'full_time')!
  assert.deepEqual([ft.goal?.target, ft.goal?.noun, ft.goal?.job], [100, 'pilot listeners', 'fill_listeners'])
  assert.equal(PORTFOLIO.filter(p => p.goal).length, 1, 'no other product borrows it')
})

// ---------------------------------------------------------------- the copy

test('the plan is idempotent: a second run with nothing new plans nothing', () => {
  const incoming = listenerRows([user('u1', 'a@club.org'), user('u2', 'b@club.org')], [], ['u2'])
  const first = planListenerSync(incoming, [], NOW)
  assert.equal(first.inserts.length, 2)
  const stored = first.inserts.map((r, i) => ({ id: `row${i}`, signed_up_at: r.signed_up_at, raw: { ...r.raw } }))
  const second = planListenerSync(incoming, stored, NOW)
  assert.deepEqual([second.inserts.length, second.updates.length, second.removals.length], [0, 0, 0])
  assert.match(outcomeLine(second, 2, 100), /^2 of 100 pilot listeners\. Nothing new since the last copy\.$/)
})

test('a changed account is updated and a deleted one is marked, never deleted', () => {
  const stored = [
    { id: 'r1', signed_up_at: '2026-10-01T00:00:00Z', raw: { fulltime_user_id: 'u1', pilot_listener: true, test_account: false, on_launch_list: false, fulltime_plan: 'free' } },
    { id: 'r2', signed_up_at: '2026-10-01T00:00:00Z', raw: { fulltime_user_id: 'gone', pilot_listener: true, test_account: false, on_launch_list: false, fulltime_plan: 'free' } },
  ]
  const incoming = listenerRows([user('u1', 'a@club.org')], [{ id: 'u1', plan: 'free' }], ['u1'])
  const plan = planListenerSync(incoming, stored, NOW)
  assert.deepEqual(plan.updates.map(u => [u.id, u.raw.on_launch_list]), [['r1', true]])
  assert.deepEqual(plan.removals.map(r => [r.id, r.raw.removed_at, r.raw.pilot_listener]), [['r2', NOW, false]])
})

// A fake Supabase client that records every call, so the test can prove the
// copy writes only Full Time listener rows and a heartbeat.
function fakeDb(existing: Array<Record<string, unknown>> = []) {
  const calls: Array<{ table: string; op: string; filters: Array<[string, unknown]>; payload?: unknown }> = []
  const store = [...existing]
  const from = (table: string) => {
    const call = { table, op: 'select', filters: [] as Array<[string, unknown]>, payload: undefined as unknown }
    calls.push(call)
    const q: any = {
      select: () => q,
      insert: (p: unknown) => { call.op = 'insert'; call.payload = p; if (table === 'customers') store.push(...(p as any[]).map((r, i) => ({ id: `new${store.length + i}`, ...r }))); return q },
      update: (p: unknown) => { call.op = 'update'; call.payload = p; return q },
      eq: (k: string, v: unknown) => { call.filters.push([k, v]); return q },
      order: () => q, limit: () => q,
      single: () => Promise.resolve({ data: { id: 42 }, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve(
        table === 'customers' && call.op === 'select' ? { data: store, error: null } : { data: null, error: null },
      ).then(res),
    }
    return q
  }
  return { db: { from }, calls }
}

function fakeFetch(users: unknown[], profiles: unknown[] = [], waitlist: unknown[] = [], status = 200) {
  return (async (url: string) => {
    const u = String(url)
    const body = u.includes('/auth/v1/admin/users') ? { users } : u.includes('/rest/v1/profiles') ? profiles : waitlist
    return new Response(JSON.stringify(body), { status })
  }) as unknown as typeof fetch
}

test('the copy writes only Full Time listener rows and one heartbeat, and says the count against 100', async () => {
  const { db, calls } = fakeDb()
  const r = await runListenerSync({
    db, fetch: fakeFetch([user('u1', 'a@club.org'), user('u2', 'qa_desk_1@x.org')]),
    url: 'https://example.invalid', key: 'k', target: 100, trigger: 'cron', now: new Date(NOW),
  })
  assert.equal(r.ok, true)
  assert.equal(r.listeners, 1)
  assert.match(r.line, /^1 of 100 pilot listeners\. Copied 2 new, updated 0, marked 0 gone\. 1 test account left out\.$/)
  // Only two tables are ever touched.
  assert.deepEqual([...new Set(calls.map(c => c.table))].sort(), ['customers', 'workflow_runs'])
  // Every customers query is pinned to Full Time's listener rows.
  for (const c of calls.filter(c => c.table === 'customers' && c.op !== 'insert')) {
    assert.deepEqual(c.filters.filter(([k]) => k === 'product' || k === 'source'), [['product', LISTENER_PRODUCT], ['source', LISTENER_SOURCE]])
  }
  const ins = calls.find(c => c.table === 'customers' && c.op === 'insert')!
  for (const row of ins.payload as Array<{ product: string; email: unknown }>) {
    assert.equal(row.product, 'full_time')
    assert.equal(row.email, null)
  }
  const beat = calls.find(c => c.table === 'workflow_runs' && c.op === 'insert')!
  assert.equal((beat.payload as { workflow_id: string }).workflow_id, LISTENER_SYNC_WORKFLOW_ID)
  const done = calls.find(c => c.table === 'workflow_runs' && c.op === 'update')!
  assert.equal((done.payload as { status: string }).status, 'success')
})

test('no read key is a loud failure: an error heartbeat, never a skip and never 0', async () => {
  const { db, calls } = fakeDb()
  const r = await runListenerSync({ db, fetch: fakeFetch([]), url: null, key: null, target: 100, trigger: 'cron' })
  assert.deepEqual([r.ok, r.status, r.listeners], [false, 'not_configured', null])
  const done = calls.find(c => c.table === 'workflow_runs' && c.op === 'update')!
  assert.equal((done.payload as { status: string }).status, 'error')
  assert.match(String((done.payload as { outcome: string }).outcome), /Not connected/)
  assert.ok(!calls.some(c => c.table === 'customers'), 'nothing is written without a read')
})

test('a refused key fails the run and names the status, without echoing the body', async () => {
  const { db, calls } = fakeDb()
  const r = await runListenerSync({ db, fetch: fakeFetch([], [], [], 401), url: 'https://example.invalid', key: 'k', target: 100, trigger: 'cron' })
  assert.deepEqual([r.ok, r.status], [false, 'failed'])
  assert.match(r.line, /refused the read key \(HTTP 401\)/)
  assert.ok(!calls.some(c => c.table === 'customers' && c.op !== 'select'))
})

// ---------------------------------------------------------------- what Growth says

test('the sync state: never ran, never worked, worked, and worked then failed', () => {
  assert.equal(listenerSyncState([]).ok, false)
  assert.match(String(listenerSyncState([]).line), /has not run yet/)
  assert.equal(listenerSyncState(null).ok, false)
  const never = listenerSyncState([{ status: 'error', run_at: NOW, outcome: 'Not connected: no key' }])
  assert.deepEqual([never.ok, never.failing], [false, true])
  const fine = listenerSyncState([{ status: 'success', run_at: NOW }, { status: 'error', run_at: '2026-10-05T00:00:00Z' }])
  assert.deepEqual([fine.ok, fine.failing, fine.line, fine.lastOkAt], [true, false, null, NOW])
  const broke = listenerSyncState([{ status: 'error', run_at: NOW, outcome: 'boom' }, { status: 'success', run_at: '2026-10-05T00:00:00Z' }])
  assert.deepEqual([broke.ok, broke.failing], [true, true])
  assert.equal(listenerSyncState([{ status: 'running', run_at: NOW }]).ok, false, 'a run in flight is not a result')
})

test('the goal card: one next action, and never a Mindmake pilot action', () => {
  const off = listenerGoalView(listenerSyncState([]), 0, 100, null)
  assert.deepEqual([off.count, off.headline], [null, 'Not connected'])
  assert.match(off.next, /read key/)

  const ok = listenerSyncState([{ status: 'success', run_at: NOW }])
  const empty = listenerGoalView(ok, 0, 100, null)
  assert.deepEqual([empty.count, empty.headline], [0, '0 of 100'])
  assert.match(empty.line, /^No pilot listeners yet\./)
  assert.match(empty.next, /football fans/)

  const site = listenerGoalView(ok, 4, 100, { title: 'Ask five football fans you know to be pilot listeners', job: 'fill_listeners' })
  assert.equal(site.next, 'Ask five football fans you know to be pilot listeners')
  assert.match(site.line, /^96 to go\./)

  // A stored action from the hours the site shared Mindmake's job is not used.
  const stale = listenerGoalView(ok, 4, 100, { title: 'Send the pilot approach drafted on 1 Oct', job: 'fill_pilots' })
  assert.doesNotMatch(stale.next, /pilot approach/)
})
