import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  subscriptionsMove, huntMove, advisoryMove, orgMove, systemsMove, flowsMove,
  COMMIT_ROUTES, isCommitRoute, type SurfaceMove,
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

// ── Prepared moves (ADR-030) ────────────────────────────────────────────────

const CONTACT = { name: 'Sam Patel', email: 'sam@example.com', linkedin_url: 'https://www.linkedin.com/in/sam' }

test('advisory: a drafted deal with a Gmail draft is prepared to the send wall, and the press is his', () => {
  const m = advisoryMove({ ...adv, deals: [{ id: 'a', name: 'Sam Patel', state: 'drafted', draftUrl: 'https://mail.google.com/mail/u/0/#drafts/abc', contact: CONTACT }] })!
  assert.equal(m.kind, 'send')
  assert.equal(m.prepared?.wall, 'send')
  assert.equal(m.prepared?.commit, undefined)
  assert.equal(m.prepared?.his?.href, 'https://mail.google.com/mail/u/0/#drafts/abc')
  assert.equal(m.actionLabel, 'Open the draft in Gmail')
  assert.equal(m.prepared?.artifact?.kind, 'gmail_draft')
})

test('advisory: a drafted deal with no Gmail draft falls to his mail or the profile with the draft', () => {
  const mail = advisoryMove({ ...adv, deals: [{ id: 'a', name: 'Sam Patel', state: 'drafted', draftBody: 'Sam, twenty minutes?', contact: CONTACT }] })!
  assert.match(mail.prepared!.his!.href, /^mailto:sam@example\.com/)
  assert.equal(mail.prepared!.his!.copies, undefined)
  const li = advisoryMove({ ...adv, deals: [{ id: 'a', name: 'Sam Patel', state: 'drafted', draftBody: 'Sam, twenty minutes?', contact: { ...CONTACT, email: null } }] })!
  assert.equal(li.prepared!.his!.href, 'https://www.linkedin.com/in/sam')
  assert.equal(li.prepared!.his!.copies, 'Sam, twenty minutes?')
  // No way to reach them: the move is advice, as before.
  const none = advisoryMove({ ...adv, deals: [{ id: 'a', name: 'Sam Patel', state: 'drafted' }] })!
  assert.equal(none.prepared, undefined)
  assert.equal(none.actionLabel, 'Show the note')
})

test('advisory: a listed person with a contact is a draft the system can commit, before finding more', () => {
  const m = advisoryMove({ ...adv, deals: [{ id: 'aaaa', name: 'Alex Morgan', state: 'listed', contact: CONTACT }, { id: 'b', name: 'Bo', state: 'listed', contact: CONTACT }] })!
  assert.equal(m.kind, 'draft')
  assert.equal(m.headline, 'Draft the note to Alex Morgan')
  assert.match(m.sub, /1 more on the list after this one\./)
  assert.equal(m.prepared?.wall, 'none')
  assert.equal(m.prepared?.commit?.route, '/api/pilot-deals/aaaa/draft')
  assert.equal(m.prepared?.his, undefined)
  // Without a contact the lane waits for Monday, as before.
  assert.equal(advisoryMove({ ...adv, deals: [{ id: 'a', name: 'Alex', state: 'listed' }] })!.kind, 'wait')
  noDash(m)
})

test('hunt: a role with a person and a draft is prepared to the send wall', () => {
  const m = huntMove({ ...hunt, roles: [{ id: 'r1', title: 'VP Product', company: 'Legora', person: 'Ada', applied: false, contactable: true, contact: { name: 'Ada Lane', email: 'ada@example.com', linkedin_url: null }, draft: 'Ada, a quick one.' }] })
  assert.equal(m.kind, 'contact')
  assert.equal(m.prepared?.wall, 'send')
  assert.match(m.prepared!.his!.href, /^mailto:ada@example\.com\?subject=VP%20Product%20at%20Legora/)
  assert.equal(m.actionLabel, 'Email Ada')
})

test('prepared: a wall means no commit and a press of his; a commit means an allowlisted route', () => {
  const moves: Array<SurfaceMove | null> = [
    advisoryMove({ ...adv, deals: [{ id: 'a', name: 'Sam', state: 'drafted', draftUrl: 'https://mail.google.com/x', contact: CONTACT }] }),
    advisoryMove({ ...adv, deals: [{ id: 'a', name: 'Sam', state: 'drafted', draftBody: 'x', contact: { ...CONTACT, email: null } }] }),
    advisoryMove({ ...adv, deals: [{ id: 'a', name: 'Alex', state: 'listed', contact: CONTACT }] }),
    huntMove({ ...hunt, roles: [{ id: 'r', title: 'VP', company: 'Y', person: 'Ada', applied: false, contactable: true, contact: { name: 'Ada', email: 'a@example.com', linkedin_url: null }, draft: 'x' }] }),
  ]
  for (const m of moves) {
    const p = m?.prepared
    assert.ok(p, `${m?.kind} is prepared`)
    if (p.wall !== 'none') {
      assert.equal(p.commit, undefined, `${m!.kind}: a wall move has no system commit`)
      assert.ok(p.his?.href, `${m!.kind}: a wall move has his press`)
    } else {
      assert.ok(p.commit, `${m!.kind}: a move with no wall commits`)
      assert.ok(isCommitRoute(p.commit!.route), `${m!.kind}: ${p.commit!.route} is on COMMIT_ROUTES`)
      assert.doesNotMatch(p.commit!.says, EMDASH)
    }
  }
})

test('COMMIT_ROUTES never names a route that can reach another person', () => {
  for (const r of COMMIT_ROUTES) {
    assert.doesNotMatch(r, /acquisition\/sends|skills\/ship|\/send\b|\/publish\b/, `${r} reaches a person`)
  }
  assert.equal(isCommitRoute('/api/acquisition/sends'), false)
  assert.equal(isCommitRoute('/api/skills/ship'), false)
  assert.equal(isCommitRoute('/api/pilot-deals/aaaa/draft?x=1'), true)
  assert.equal(isCommitRoute('/api/pilot-deals/aaaa/draft/extra'), false)
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

test('org: a rung change the weekly review proposed waits after a ruling and before a correction, answered in place', () => {
  const promotions = [{ id: 'p1', surface: 'strategist_ask', label: 'the ask', from: 'propose', to: 'assist', reason: '23 of 29 ruled asks taken as proposed up to 2026-10-05, at or above 60%.' }]
  const up = orgMove({ corrections: [{ id: 'c', agent: 'cleo', reason: 'tone_off', downvotes: 3 }], rulings: [], agentCount: 12, working: 5, promotions })
  assert.equal(up.kind, 'promotion')
  assert.equal(up.headline, 'Let the OS prepare the ask before you see it?')
  assert.equal(up.sub, promotions[0].reason)
  assert.equal(up.actionLabel, undefined)
  assert.match(up.why!, /never sends, posts or spends/)
  assert.doesNotMatch(up.why!, /autonomous/)
  const down = orgMove({ corrections: [], rulings: [], agentCount: 12, working: 5, promotions: [{ ...promotions[0], from: 'assist', to: 'propose' }] })
  assert.equal(down.headline, 'Send the ask back to proposing?')
  // A ruling an agent is blocked on still comes first.
  const r = orgMove({ corrections: [], rulings: [{ id: 't', kind: 'task', title: 'Decide X', agent: 'nova', detail: null }], agentCount: 12, working: 5, promotions })
  assert.equal(r.kind, 'ruling')
})
