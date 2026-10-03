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
