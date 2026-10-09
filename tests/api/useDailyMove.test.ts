import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentMove, answerKey } from '../../src/hooks/useDailyMove.js'
import type { NextStepSection, StrategistReadWire } from '../../src/types/strategist.js'

// Which move Home proposes, from what he has already said. The rule lives in a
// pure function so a change to it fails here, not on his phone.

const step = (text: string, suggestion_id?: string): NextStepSection =>
  ({ kind: 'next_step', text, goal_id: null, job: null, why: 'w', ...(suggestion_id ? { suggestion_id } : {}) })

function wire(steps: NextStepSection[]): StrategistReadWire {
  return {
    id: 'r', created_at: '2026-10-03T09:40:00Z', source: 'daily', goal_id: null, note_kind: null,
    week_start: '2026-09-28', status: 'complete', last_attempt_at: '2026-10-03T09:40:00Z', headline: 'h',
    read: {
      v: 1, shape: 'daily', headline: { kind: 'headline', text: 'h', rule: 'slow_pay', rule_n: 3, rule_chip: 'x' },
      heard: null, lenses: [], reframe: null, objectives: [], progress: [], next_steps: steps, asks: [],
      worry: null, kill: null, learning: null, close: { kind: 'close', stop: 's' },
    },
  } as StrategistReadWire
}

test('setting a move aside offers the next; taking one or saying later closes the day', () => {
  const w = wire([step('one', 's1'), step('two', 's2'), step('three', 's3')])
  assert.equal(currentMove(w, {})?.move.text, 'one')
  const next = currentMove(w, { s1: 'rejected' })
  assert.deepEqual(next && { text: next.move.text, rank: next.rank }, { text: 'two', rank: 2 })
  assert.equal(currentMove(w, { s1: 'rejected', s2: 'accepted' }), null)
  assert.equal(currentMove(w, { s2: 'deferred' }), null)
  assert.equal(currentMove(w, { s1: 'rejected', s2: 'rejected', s3: 'rejected' }), null)
})

test('a morning whose bank write failed still moves on when he answers', () => {
  // No suggestion ids: the answers are kept by the move's place in the read.
  const steps = [step('one'), step('two')]
  const w = wire(steps)
  assert.equal(answerKey(steps[0], steps), 'rank:1')
  assert.equal(currentMove(w, { [answerKey(steps[0], steps)]: 'rejected' })?.move.text, 'two')
  assert.equal(currentMove(w, { [answerKey(steps[1], steps)]: 'deferred' }), null)
})

// ── The ledger speaks (ADR-030) ─────────────────────────────────────────────

function withOutcomes(w: StrategistReadWire, outcomes: NonNullable<StrategistReadWire['outcomes']>): StrategistReadWire {
  return { ...w, outcomes }
}

test('a move the ledger says is done or dropped is skipped; the next one is offered', () => {
  const w = withOutcomes(wire([step('one', 's1'), step('two', 's2'), step('three', 's3')]), {
    s1: { outcome: 'did_it', artifact: null },
    s2: { outcome: 'dropped', artifact: null },
  })
  const c = currentMove(w, {})
  assert.equal(c?.move.text, 'three')
  assert.equal(c?.rank, 3)
  assert.equal(c?.outcome, null)
})

test('a drafted move is still offered, with its outcome, so the card can lead with the draft', () => {
  const w = withOutcomes(wire([step('one', 's1'), step('two', 's2')]), { s1: { outcome: 'drafted', artifact: 'Sam, twenty minutes?' } })
  const c = currentMove(w, {})
  assert.equal(c?.move.text, 'one')
  assert.equal(c?.outcome, 'drafted')
  assert.equal(c?.artifact, 'Sam, twenty minutes?')
})

test('every move done closes the day; his own answers still win over the ledger', () => {
  const all = withOutcomes(wire([step('one', 's1')]), { s1: { outcome: 'done_together', artifact: null } })
  assert.equal(currentMove(all, {}), null)
  // He set a drafted move aside: the ledger does not resurrect it.
  const w = withOutcomes(wire([step('one', 's1'), step('two', 's2')]), { s1: { outcome: 'drafted', artifact: null } })
  assert.equal(currentMove(w, { s1: 'rejected' })?.move.text, 'two')
  // He took one: the day is closed whatever the ledger says about the rest.
  assert.equal(currentMove(w, { s2: 'accepted' }), null)
})
