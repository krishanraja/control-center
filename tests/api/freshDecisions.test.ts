import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshDecisions, isPipelineRollup, waitingLine } from '../../src/lib/freshDecisions.js'
import type { DecisionRow } from '../../src/hooks/useRealtimeDecisionsWaiting.js'

// The rows below are the shapes the live decisions_waiting view returned on
// 2026-10-04, trimmed. Of 27 typed rulings, six were things Krish could still
// act on: the W40 brief, the shift proposal, three W40 graduations and one idea.

const NOW = new Date('2026-10-04T12:00:00Z')

function row(p: Partial<DecisionRow> & Pick<DecisionRow, 'kind' | 'id'>): DecisionRow {
  return {
    title: p.id, description: null, agent: 'cleo', status: 'open', priority: 'normal',
    sort_at: '2026-10-02T18:00:00Z', url: null, source_table: 't', meta: {}, route_target: null, ...p,
  }
}

const cd = (id: string, decision_kind: string, week: string, sort_at: string, ref = id) =>
  row({ kind: 'content_decision', id, status: decision_kind, sort_at, meta: { decision_kind, week, ref } })

const LIVE: DecisionRow[] = [
  cd('brief39', 'brief_review', '2026-W39', '2026-09-25T18:02:22Z', 'b39'),
  cd('grad39-levie', 'graduation', '2026-W39', '2026-09-25T18:02:23Z', 'levie'),
  cd('grad39-harness', 'graduation', '2026-W39', '2026-09-25T18:02:23Z', 'harness'),
  cd('grad39-gtm', 'graduation', '2026-W39', '2026-09-25T18:02:23Z', 'gtm'),
  cd('shift40', 'shift_proposal', '2026-W40', '2026-10-02T17:30:14Z', 'shift'),
  cd('brief40', 'brief_review', '2026-W40', '2026-10-02T18:03:54Z', 'b40'),
  cd('purge40', 'purge_preview', '2026-W40', '2026-10-02T18:03:55Z', 'b40'),
  cd('grad40-klarna', 'graduation', '2026-W40', '2026-10-02T18:03:55Z', 'klarna'),
  cd('grad40-slop', 'graduation', '2026-W40', '2026-10-02T18:03:55Z', 'slop'),
  cd('grad40-levie', 'graduation', '2026-W40', '2026-10-02T18:03:55Z', 'levie'),
  row({ kind: 'correction', id: 'corr1', priority: 'overdue', sort_at: '2026-08-24T07:41:50Z' }),
  row({ kind: 'growth_stall', id: 'stall1', sort_at: '2026-08-12T07:00:37Z' }),
  row({ kind: 'idea', id: 'idea1', sort_at: '2026-10-04T00:15:58Z' }),
  row({ kind: 'task', id: 'nova', agent: 'nova', sort_at: null as unknown as string,
    title: 'Nova Visibility Pipeline — 41 podcasts + 28 stages awaiting approval (69 total)' }),
  row({ kind: 'vera_gap', id: 'gap:stripe', sort_at: '2026-09-04T11:30:01Z', meta: { task_id: 't-reviewed' } }),
]

test('the live mix of 2026-10-04 comes down to the six Krish can act on', () => {
  const ids = freshDecisions(LIVE, { now: NOW, reviewedTaskIds: new Set(['t-reviewed']) }).map(r => r.id).sort()
  assert.deepEqual(ids, ['brief40', 'grad40-klarna', 'grad40-levie', 'grad40-slop', 'idea1', 'shift40'])
})

test('a newer week supersedes an older brief and its graduations', () => {
  const ids = freshDecisions(LIVE, { now: NOW }).map(r => r.id)
  for (const old of ['brief39', 'grad39-levie', 'grad39-harness', 'grad39-gtm']) assert.ok(!ids.includes(old), old)
})

test('a piece queued for graduation twice counts once, the newest copy', () => {
  const twice = [
    cd('a', 'graduation', '2026-W40', '2026-10-02T18:00:00Z', 'same'),
    cd('b', 'graduation', '2026-W40', '2026-10-02T18:01:00Z', 'same'),
  ]
  assert.equal(freshDecisions(twice, { now: NOW }).length, 1)
})

test('a shift proposal is not retired by a newer week', () => {
  const rows = [
    cd('s39', 'shift_proposal', '2026-W39', '2026-09-27T10:00:00Z', 's1'),
    cd('s40', 'shift_proposal', '2026-W40', '2026-10-02T10:00:00Z', 's2'),
  ]
  assert.equal(freshDecisions(rows, { now: NOW }).length, 2)
})

test('items older than 14 days, or with no date, drop out', () => {
  const rows = [
    row({ kind: 'correction', id: 'day13', sort_at: '2026-09-21T13:00:00Z' }),
    row({ kind: 'correction', id: 'day15', sort_at: '2026-09-19T11:00:00Z' }),
    row({ kind: 'task', id: 'undated', sort_at: null as unknown as string }),
  ]
  assert.deepEqual(freshDecisions(rows, { now: NOW }).map(r => r.id), ['day13'])
})

test('purge notices are never counted', () => {
  assert.equal(freshDecisions([cd('p', 'purge_preview', '2026-W40', '2026-10-03T00:00:00Z')], { now: NOW }).length, 0)
})

test('a gap stays until its task is reviewed', () => {
  const gap = row({ kind: 'vera_gap', id: 'g', sort_at: '2026-10-01T00:00:00Z', meta: { task_id: 't1' } })
  assert.equal(freshDecisions([gap], { now: NOW }).length, 1)
  assert.equal(freshDecisions([gap], { now: NOW, reviewedTaskIds: new Set(['t1']) }).length, 0)
})

test('the pipeline rollup task is recognised even when dated today', () => {
  const nova = LIVE.find(r => r.id === 'nova')!
  assert.ok(isPipelineRollup(nova))
  assert.equal(freshDecisions([{ ...nova, sort_at: '2026-10-04T00:00:00Z' }], { now: NOW }).length, 0)
  assert.ok(!isPipelineRollup(row({ kind: 'task', id: 'x', title: 'Approve the Stripe fix' })))
})

test('zero is said plainly', () => {
  assert.equal(waitingLine(0), 'Nothing is waiting on you.')
  assert.equal(waitingLine(1), '1 thing is waiting on you.')
  assert.equal(waitingLine(6), '6 things are waiting on you.')
})
