import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOME_FOLDS, foldsAt } from '../../src/lib/homeFolds.js'

// The order Home gives things up in when a screen is short. The order is the
// hierarchy, so a change to it is a design decision and fails here first.

test('the move is the last thing a short screen gives up', () => {
  assert.equal(HOME_FOLDS[HOME_FOLDS.length - 1], 'card')
  // The canon he knows by heart gives way first, the OS goals before the week;
  // the move's own reasons outrank both on a morning with a move.
  assert.deepEqual([...HOME_FOLDS], ['os', 'week', 'survived', 'why', 'tests', 'slots', 'cta', 'actions', 'card'])
})

test('level 0 folds nothing, and each level folds exactly one more thing', () => {
  assert.ok(Object.values(foldsAt(0)).every(v => v === false))
  for (let level = 1; level <= HOME_FOLDS.length; level++) {
    const folded = HOME_FOLDS.filter(f => foldsAt(level)[f])
    assert.deepEqual(folded, HOME_FOLDS.slice(0, level))
  }
})

test('what he opened by hand stays open at every level', () => {
  for (const pinned of ['week', 'os', 'tests', 'card'] as const) {
    assert.equal(foldsAt(HOME_FOLDS.length, pinned)[pinned], false)
    // Everything else still folds as it would have.
    const others = HOME_FOLDS.filter(f => f !== pinned)
    assert.ok(others.every(f => foldsAt(HOME_FOLDS.length, pinned)[f]))
  }
})
