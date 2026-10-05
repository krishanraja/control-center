import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  subscriptionsMove, huntMove, advisoryMove, orgMove, systemsMove, flowsMove,
} from '../../src/lib/surfaceMoves.js'
import { rosterWork, taskStatusWord } from '../../src/lib/rosterWork.js'

// The one move on each surface (src/lib/surfaceMoves.ts). These pin the ORDER
// each surface follows, because the order is the product decision: what Krish
// is told to do first. Every person and product here is invented.

const EMDASH = new RegExp(String.fromCharCode(0x2014))

function noDash(m: { headline: string; sub: string; why?: string } | null) {
  if (!m) return
  for (const s of [m.headline, m.sub, m.why ?? '']) assert.doesNotMatch(s, EMDASH, `em dash in "${s}"`)
}

// ── Subscriptions ───────────────────────────────────────────────────────────

const subsBase = {
  checkIns: [] as Array<{ id: string; name: string; mrrUsd: number | null }>,
  revenue: { paying: 3, committedLabel: '$120.00' },
  ageHours: 2, behind: false,
  gaps: [] as Array<{ productLabel: string; venture: string; tier: number; label: string; gap: string; fix: string | null }>,
  loading: false,
}
const gap = { productLabel: 'Heartside', venture: 'heartside', tier: 1, label: 'Analytics', gap: 'No site analytics are read.', fix: 'Turn on Google Analytics.' }

test('subscriptions: a paying customer waiting on a check-in comes first', () => {
  const m = subscriptionsMove({ ...subsBase, behind: true, gaps: [gap], checkIns: [{ id: 'c1', name: 'Ada Lane', mrrUsd: 49 }, { id: 'c2', name: 'Bo Kim', mrrUsd: 10 }] })!
  assert.equal(m.kind, 'check_in')
  assert.equal(m.headline, 'Check in with Ada Lane')
  assert.match(m.sub, /\$49 a month\. 1 more paying account after this one\./)
  noDash(m)
})

test('subscriptions: a stale Stripe read outranks wiring', () => {
  const m = subscriptionsMove({ ...subsBase, behind: true, ageHours: 60, gaps: [gap] })!
  assert.equal(m.kind, 'sync')
  assert.match(m.sub, /3 days ago/)
  const never = subscriptionsMove({ ...subsBase, behind: true, ageHours: null, revenue: null })!
  assert.equal(never.headline, 'Read Stripe for the first time')
})

test('subscriptions: then the first unwired number, then honest quiet', () => {
  const m = subscriptionsMove({ ...subsBase, gaps: [gap, { ...gap, label: 'Sign-ups' }] })!
  assert.equal(m.kind, 'wire')
  assert.equal(m.headline, 'Wire Analytics for Heartside')
  assert.equal(m.sub, 'Turn on Google Analytics.')
  assert.match(m.why!, /1 more number to wire/)
  const clear = subscriptionsMove(subsBase)!
  assert.equal(clear.kind, 'clear')
  assert.equal(clear.clear, true)
  assert.match(clear.sub, /3 paying subscribers, \$120\.00 a month/)
})

test('subscriptions: no move is invented while the first read is in flight', () => {
  assert.equal(subscriptionsMove({ ...subsBase, loading: true, revenue: null }), null)
})

// ── Hunt ────────────────────────────────────────────────────────────────────

const hunt = { status: { failing: false, failLine: null, waitingOnKrish: 0, approvedAwaitingBuild: 0 }, roles: [], paths: [], running: null }

test('hunt: a broken hunter first, then a person to write to', () => {
  const fail = huntMove({ ...hunt, status: { ...hunt.status, failing: true, failLine: 'Last run failed 2h ago. Timeout.' } })
  assert.equal(fail.kind, 'fix')
  assert.equal(fail.sub, 'Last run failed 2h ago. Timeout.')
  const role = huntMove({ ...hunt, roles: [
    { id: 'r0', title: 'Head of AI', company: 'Fleek', person: null, applied: false, contactable: false },
    { id: 'r1', title: 'VP Product', company: 'Legora', person: 'Ada', applied: false, contactable: true },
  ], paths: [{ id: 'p', person: 'Bo', title: 'CTO', company: 'X' }] })
  assert.equal(role.kind, 'contact')
  assert.equal(role.headline, 'Write to Ada about VP Product at Legora')
  noDash(role)
})

test('hunt: applied roles become follow-ups; paths, sheet and packages follow in order', () => {
  const applied = huntMove({ ...hunt, roles: [{ id: 'r', title: 'VP', company: 'Y', person: 'Ada', applied: true, contactable: true }] })
  assert.match(applied.headline, /^Follow up with Ada/)
  assert.equal(huntMove({ ...hunt, paths: [{ id: 'p', person: 'Bo', title: 'CTO', company: 'X' }] }).headline, 'Send Bo the draft about CTO at X')
  assert.equal(huntMove({ ...hunt, status: { ...hunt.status, waitingOnKrish: 4 } }).headline, 'Give your verdict on 4 roles')
  assert.equal(huntMove({ ...hunt, status: { ...hunt.status, approvedAwaitingBuild: 1 } }).kind, 'build')
  assert.equal(huntMove({ ...hunt, running: 'process' }).headline, 'Process is running')
  const clear = huntMove(hunt)
  assert.equal(clear.kind, 'clear')
  assert.equal(clear.clear, true)
})

// ── Advisory ────────────────────────────────────────────────────────────────

const adv = { deals: [] as Array<{ id: string; name: string; state: string }>, asked: 6, replies: 0, onList: 3, proposals: 0, seeding: false, findNote: null as string | null, error: false }

test('advisory: a reply beats a draft, a draft beats finding more', () => {
  const deals = [{ id: 'a', name: 'Sam Patel', state: 'drafted' }, { id: 'b', name: 'Alex Morgan', state: 'replied' }]
  assert.equal(advisoryMove({ ...adv, deals, replies: 1 })!.headline, 'Alex Morgan replied. Book the call')
  const send = advisoryMove({ ...adv, deals: [deals[0]] })!
  assert.equal(send.headline, 'Send Sam Patel the note')
  assert.match(send.sub, /6 of the 25 asks the plan needs\./)
  // A reply outside the default view still leads, by count.
  assert.equal(advisoryMove({ ...adv, replies: 2 })!.headline, '2 people replied. Book the calls')
})

test('advisory: the empty list is one move, and an error is not a move', () => {
  const empty = advisoryMove({ ...adv, onList: 0, asked: 0 })!
  assert.equal(empty.kind, 'find')
  assert.equal(empty.actionLabel, 'Find five')
  const after = advisoryMove({ ...adv, onList: 0, findNote: 'Nobody new fits closely enough right now.' })!
  assert.equal(after.actionLabel, 'Search again')
  assert.match(after.sub, /Nobody new fits/)
  assert.equal(advisoryMove({ ...adv, error: true }), null)
  assert.equal(advisoryMove({ ...adv, proposals: 4 })!.kind, 'triage')
})

// ── OS > Org ────────────────────────────────────────────────────────────────

test('org: a ruling an agent waits on comes before a brief correction', () => {
  const m = orgMove({
    corrections: [{ id: 'c', agent: 'cleo', reason: 'tone_off', downvotes: 3 }],
    rulings: [{ id: 't', kind: 'task', title: 'Decide whether to run the Sifted play', agent: 'nova', detail: null }],
    agentCount: 12, working: 5,
  })
  assert.equal(m.kind, 'ruling')
  assert.equal(m.headline, 'Decide whether to run the Sifted play')
  assert.equal(m.sub, 'Nova is waiting on you.')
  // A task ruling is answered in place, so the move carries no button label.
  assert.equal(m.actionLabel, undefined)
  const c = orgMove({ corrections: [{ id: 'c', agent: 'cleo', reason: 'tone_off', downvotes: 3 }], rulings: [], agentCount: 12, working: 5 })
  assert.equal(c.headline, "Review Vera's change to Cleo's brief")
  assert.match(c.why!, /\(tone off\)/)
})

test('org: then the agent failing most, then honest quiet', () => {
  const f = orgMove({ corrections: [], rulings: [], agentCount: 12, working: 5, failing: { agent: 'maya', errors: 3, of: 5 } })
  assert.equal(f.headline, "Look at why Maya's runs are failing")
  const q = orgMove({ corrections: [], rulings: [], agentCount: 12, working: 5 })
  assert.equal(q.kind, 'clear')
  assert.equal(q.sub, '12 agents, 5 with open work. Nothing to rule on and no brief change to review.')
})

test('rosterWork: per agent, waiting beats working; names match across spellings', () => {
  const w = rosterWork(
    [{ title: 'Draft the brief', status: 'active', owner: 'Cleo' }, { title: 'Older', status: 'active', owner: 'cleo' }],
    [{ agent_id: 'maya', status: 'error' }, { agent_id: 'maya', status: 'success' }, { agent_id: 'Maya', status: 'error' }],
    [{ agent: 'nova', title: 'Rule on X' }],
  )
  assert.equal(w.byAgent.get('cleo')!.now, 'Draft the brief')
  assert.equal(w.byAgent.get('cleo')!.open, 2)
  assert.equal(w.byAgent.get('nova')!.waiting, 1)
  assert.deepEqual(w.worstFailing, { agent: 'maya', errors: 2, of: 3 })
  assert.equal(taskStatusWord('in_progress'), 'In progress')
  assert.equal(taskStatusWord('pending-agatha-review'), 'With Agatha for review')
})

// ── OS > Systems and Flows ──────────────────────────────────────────────────

test('systems: down before warning; an all-unchecked board is not "healthy"', () => {
  const d = systemsMove({ down: [{ name: 'Apify', note: 'Out of credit' }], warning: [{ name: 'n8n', note: '' }], healthy: 4, unchecked: 0 })
  assert.equal(d.headline, 'Apify is down')
  assert.equal(d.sub, 'Out of credit. 1 down, 1 warning, 4 healthy.')
  assert.equal(systemsMove({ down: [], warning: [{ name: 'n8n', note: '' }, { name: 'x', note: '' }], healthy: 0, unchecked: 0 }).headline, 'n8n and 1 other need a look')
  const u = systemsMove({ down: [], warning: [], healthy: 0, unchecked: 9 })
  assert.equal(u.kind, 'unchecked')
  assert.notEqual(u.clear, true)
  assert.equal(systemsMove({ down: [], warning: [], healthy: 9, unchecked: 0 }).kind, 'clear')
})

test('flows: a proposal waits on him before a failing workflow', () => {
  const p = flowsMove({ proposals: [{ id: 'p', title: 'Batch the brief runs', agent: 'arlo' }], failing: [{ id: 'f', name: 'Cleo Daily Brief', errors: 2, runs: 6 }], workflows: 8 })
  assert.equal(p.headline, 'Approve or reject: Batch the brief runs')
  const f = flowsMove({ proposals: [], failing: [{ id: 'f', name: 'Cleo Daily Brief', errors: 2, runs: 6 }], workflows: 8 })
  assert.equal(f.sub, '2 of its last 6 runs failed.')
  assert.equal(flowsMove({ proposals: [], failing: [], workflows: 0 }).sub, 'No workflow has run yet and no proposal is waiting.')
})
