// Picking a piece for a series (src/lib/contentPick.ts, written by
// api/content/pick.ts, called through pickForSeries in src/lib/contentActions.ts).
//
// "Write this" meant two things until 2026-10-04: a ledger row on the desk and
// a move to drafting on the phone. A pick is now one act: drafting, with the
// series stored in lane_slot, protected from the Monday clear-out.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PICKABLE_STATES, planPick, planRestore, type PickRow } from '../../src/lib/contentPick.ts'

const NOW = '2026-10-04T12:00:00.000Z'

const row = (o: Partial<PickRow> = {}): PickRow => ({
  id: '00000000-0000-4000-8000-000000000001',
  state: 'researching',
  lane_slot: 'mind_the_gap',
  buried_at: null,
  protected_at: null,
  updated_at: '2026-10-04T05:00:00.000Z',
  ...o,
})

test('a pick moves the piece to drafting with its series, protected, and remembers what it was', () => {
  const plan = planPick(row(), 'mind_the_gap', true, NOW)
  assert.equal(plan.ok, true)
  if (plan.ok === false) return
  assert.deepEqual(plan.update, { state: 'drafting', lane_slot: 'mind_the_gap', protected_at: NOW })
  assert.deepEqual(plan.previous, { state: 'researching', lane_slot: 'mind_the_gap', protected_at: null })
})

test('a pick can change the series, and keeps an earlier protection as it was', () => {
  const plan = planPick(row({ state: 'seeded', lane_slot: null, protected_at: '2026-09-01T00:00:00Z' }), 'under_the_hood', true, NOW)
  assert.equal(plan.ok && plan.update.lane_slot, 'under_the_hood')
  assert.equal(plan.ok && plan.update.protected_at, '2026-09-01T00:00:00Z')
  assert.equal(plan.ok && plan.previous.lane_slot, null)
})

test('nothing past writing can be picked, and nothing set aside', () => {
  for (const state of ['review', 'approved', 'published', 'dropped', 'absorbed']) {
    const plan = planPick(row({ state }), 'mind_the_gap', true, NOW)
    assert.equal(plan.ok, false, state)
    assert.equal(!plan.ok && plan.status, 409)
  }
  const buried = planPick(row({ buried_at: '2026-10-01T00:00:00Z' }), 'mind_the_gap', true, NOW)
  assert.equal(!buried.ok && buried.reason, 'set_aside')
  assert.deepEqual([...PICKABLE_STATES], ['seeded', 'researching', 'drafting'])
})

test('a series that does not publish is refused before anything moves', () => {
  const plan = planPick(row(), 'money_of_ai', false, NOW)
  assert.equal(!plan.ok && plan.status, 400)
  assert.equal(!plan.ok && plan.reason, 'series_not_live')
  assert.equal(planPick(row(), '', true, NOW).ok, false)
  assert.equal(!planPick(null, 'mind_the_gap', true, NOW).ok && (planPick(null, 'mind_the_gap', true, NOW) as { status: number }).status, 404)
})

test('picking a piece already drafting for that series is harmless', () => {
  const plan = planPick(row({ state: 'drafting' }), 'mind_the_gap', true, NOW)
  assert.equal(plan.ok && plan.update.state, 'drafting')
})

test('an undo puts back exactly what the pick replaced', () => {
  const picked = planPick(row({ state: 'seeded', lane_slot: null }), 'follow_the_money', true, NOW)
  assert.equal(picked.ok, true)
  if (picked.ok === false) return
  const after = row({ state: 'drafting', lane_slot: 'follow_the_money', protected_at: NOW })
  const undo = planRestore(after, 'follow_the_money', picked.previous)
  assert.equal(undo.ok, true)
  if (undo.ok === false) return
  assert.deepEqual(undo.update, { state: 'seeded', lane_slot: null, protected_at: null })
})

test('an undo refuses once the piece has moved on, rather than throw that work away', () => {
  const previous = { state: 'researching', lane_slot: 'mind_the_gap', protected_at: null }
  assert.equal(!planRestore(row({ state: 'review', lane_slot: 'mind_the_gap' }), 'mind_the_gap', previous).ok, true)
  assert.equal(!planRestore(row({ state: 'drafting', lane_slot: 'under_the_hood' }), 'mind_the_gap', previous).ok, true)
  assert.equal(!planRestore(row({ state: 'drafting' }), 'mind_the_gap', null).ok, true)
  assert.equal(!planRestore(row({ state: 'drafting' }), 'mind_the_gap', { ...previous, state: 'approved' }).ok, true)
})

test('the plan module has no imports, so the serverless route can load it under Node ESM', () => {
  // api/content/pick.ts imports it as ../../src/lib/contentPick.js. A relative
  // import without .js, or the formats JSON, would build and then fail to
  // load on the first request (tsconfig.api.json says why).
  const src = readFileSync('src/lib/contentPick.ts', 'utf8')
  assert.equal(/^\s*import\s/m.test(src), false)
  const route = readFileSync('api/content/pick.ts', 'utf8')
  assert.match(route, /from '\.\.\/\.\.\/src\/lib\/contentPick\.js'/)
  // The live list of series is read from venture_formats, never copied.
  assert.match(route, /from\('venture_formats'\)/)
})
