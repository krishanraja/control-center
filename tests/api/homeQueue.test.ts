import { test } from 'node:test'
import assert from 'node:assert/strict'
import { homeQueue, queueHead, queueRest, queueRank, TIER_ORDER } from '../../src/lib/homeQueue.js'

// The one queue (ADR-030). The order is the product decision, so it fails
// here before it reaches his phone. Every number here is invented.

const EMDASH = new RegExp(String.fromCharCode(0x2014))
const quiet = { dailyMove: null, pilots: { replied: 0, drafted: 0 }, dueTests: 0, waiting: 0, weekAsk: null }
const move = { text: 'Ask the operating chief for twenty minutes.' }

test('a reply outranks today\'s move, which outranks a drafted note, a due test, a ruling and the week', () => {
  const q = homeQueue({ dailyMove: move, pilots: { replied: 1, drafted: 2 }, dueTests: 1, waiting: 3, weekAsk: 'Set this week\'s 3' })
  assert.deepEqual(q.map(e => e.tier), ['reply', 'move', 'prepared', 'ruling', 'ruling', 'wiring'])
  assert.deepEqual(q.map(e => e.id), ['advisory-reply', 'daily-move', 'advisory-drafted', 'due-tests', 'waiting', 'week'])
  for (const e of q) for (const s of [e.headline, e.sub, e.press.label]) assert.doesNotMatch(s, EMDASH)
})

test('the hero yields while the move is the head, and shows the reply when one is ahead of it', () => {
  const alone = homeQueue({ ...quiet, dailyMove: move, pilots: { replied: 0, drafted: 2 } })
  assert.equal(alone[0].id, 'daily-move')
  assert.equal(queueHead(alone), null)
  // The rest is what the Waiting list shows: never the move, which the slot draws.
  assert.deepEqual(queueRest(alone).map(e => e.id), ['advisory-drafted'])

  const withReply = homeQueue({ ...quiet, dailyMove: move, pilots: { replied: 2, drafted: 0 } })
  assert.equal(queueHead(withReply)?.headline, '2 people replied. Book the calls')
  assert.equal(queueHead(withReply)?.press.label, 'Show the replies')
  assert.deepEqual(queueRest(withReply).map(e => e.id), [])
})

test('once the move is answered the next entry is the head', () => {
  const q = homeQueue({ ...quiet, dailyMove: null, pilots: { replied: 0, drafted: 1 }, dueTests: 1 })
  assert.equal(queueHead(q)?.id, 'advisory-drafted')
  assert.equal(queueHead(q)?.headline, 'Send the drafted note')
  assert.deepEqual(queueRest(q).map(e => e.id), ['due-tests'])
})

test('an entry Home already draws never takes the hero: a due test, the rulings, the week', () => {
  // The first cut put the Waiting count in the hero too; at 360x640 the
  // second copy's height folded the OS goals. A second copy is a second ask.
  const q = homeQueue({ ...quiet, dailyMove: null, dueTests: 1, waiting: 4, weekAsk: 'Set this week\'s 3' })
  assert.deepEqual(q.map(e => e.id), ['due-tests', 'waiting', 'week'])
  assert.equal(queueHead(q), null)
  // The list behind the Waiting count keeps the test and the week, in order,
  // and never lists the rulings it opened from.
  assert.deepEqual(queueRest(q).map(e => e.id), ['due-tests', 'week'])
})

test('a quiet morning is an empty queue, and unread counts are not invented', () => {
  assert.deepEqual(homeQueue(quiet), [])
  assert.deepEqual(homeQueue({ ...quiet, pilots: null }), [])
  assert.equal(queueHead([]), null)
})

test('within a tier the mission leads, then the ladder, then no venture', () => {
  assert.ok(queueRank('mindmake') < queueRank('heartside'))
  assert.ok(queueRank('heartside') < queueRank('ctrl'))
  assert.ok(queueRank('ctrl') < queueRank(null))
  assert.deepEqual([...TIER_ORDER], ['reply', 'move', 'prepared', 'ruling', 'health', 'wiring'])
})
