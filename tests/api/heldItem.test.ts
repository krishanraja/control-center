// Holding the item he is reading still while the list under it changes
// (src/lib/heldItem.ts, wrapped by src/hooks/useHeldItem.ts).
//
// The failure this exists for: every Content list refetches the whole table on
// any write, and the decide card was keyed on "whatever sorts first", so a
// refetch swapped the piece under him and dropped the reason step he had open.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NOTHING_HELD, anchoredPage, resolveHeld, stepHeld, type HeldState } from '../../src/lib/heldItem.ts'

test('the held item stays on screen when a refetch re-sorts the list', () => {
  assert.deepEqual(resolveHeld(['a', 'b', 'c'], 'b', 1), { id: 'b', index: 1 })
  // A new piece lands above it and the rest reshuffle: still b.
  assert.deepEqual(resolveHeld(['new', 'c', 'a', 'b'], 'b', 1), { id: 'b', index: 3 })
})

test('nothing held yet: the head of the list', () => {
  assert.deepEqual(resolveHeld(['a', 'b'], null, 0), { id: 'a', index: 0 })
  assert.deepEqual(resolveHeld(['a', 'b'], null, 5, 'same-index'), { id: 'a', index: 0 })
})

test('once he acts and it leaves, a queue serves its head next', () => {
  assert.deepEqual(resolveHeld(['c', 'd'], 'b', 1, 'head'), { id: 'c', index: 0 })
})

test('once he acts and it leaves, a deck shows the card now in its place', () => {
  assert.deepEqual(resolveHeld(['a', 'c', 'd'], 'b', 1, 'same-index'), { id: 'c', index: 1 })
  // The last card went: the deck clamps to the new last card.
  assert.deepEqual(resolveHeld(['a', 'b'], 'c', 2, 'same-index'), { id: 'b', index: 1 })
})

test('an empty list holds nothing', () => {
  assert.deepEqual(resolveHeld([], 'a', 3), { id: null, index: -1 })
  assert.deepEqual(resolveHeld([], null, 0, 'same-index'), { id: null, index: -1 })
})

test('resolving its own answer again changes nothing, so a render cannot loop', () => {
  const lists = [[], ['a'], ['a', 'b', 'c'], ['c', 'b', 'a'], ['x', 'y']]
  const held = [null, 'a', 'b', 'z']
  for (const ids of lists) {
    for (const h of held) {
      for (const fallback of ['head', 'same-index'] as const) {
        for (const last of [0, 1, 4]) {
          const once = resolveHeld(ids, h, last, fallback)
          assert.deepEqual(resolveHeld(ids, once.id, once.index, fallback), once)
        }
      }
    }
  }
})

test('a holder holds the head once adopting, and the same card through refetches', () => {
  let s: HeldState = NOTHING_HELD
  s = stepHeld(s, ['a', 'b'])
  assert.deepEqual(s, { id: 'a', index: 0, explicit: false })
  // A refetch lands a piece above it: still a.
  s = stepHeld(s, ['new', 'a', 'b'])
  assert.deepEqual(s, { id: 'a', index: 1, explicit: false })
})

test('a deck still loading shows its head without holding it, so the anchor can take the front', () => {
  // The video review answered first; the weekly brief arrives after it and
  // must lead. Holding the early head is how the brief ended up second.
  let s: HeldState = NOTHING_HELD
  s = stepHeld(s, ['video'], { fallback: 'same-index', adopt: false })
  assert.deepEqual(s, { id: null, index: 0, explicit: false })
  s = stepHeld(s, ['brief', 'video', 'investigation'], { fallback: 'same-index', adopt: true })
  assert.deepEqual(s, { id: 'brief', index: 0, explicit: false })
})

test('a card he browsed to stays held, loading or not, until it leaves', () => {
  let s: HeldState = { id: 'video', index: 0, explicit: true }
  s = stepHeld(s, ['brief', 'video'], { fallback: 'same-index', adopt: false })
  assert.deepEqual(s, { id: 'video', index: 1, explicit: true })
  // He decided it and it left: the card now in its place, no longer explicit.
  s = stepHeld(s, ['brief', 'investigation'], { fallback: 'same-index', adopt: true })
  assert.deepEqual(s, { id: 'investigation', index: 1, explicit: false })
})

test('stepping its own result again changes nothing', () => {
  const states: HeldState[] = [NOTHING_HELD, { id: 'a', index: 0, explicit: true }, { id: 'z', index: 2, explicit: false }]
  for (const prev of states) {
    for (const ids of [[], ['a'], ['b', 'a', 'c']]) {
      for (const adopt of [true, false]) {
        for (const fallback of ['head', 'same-index'] as const) {
          const once = stepHeld(prev, ids, { adopt, fallback })
          assert.deepEqual(stepHeld(once, ids, { adopt, fallback }), once)
        }
      }
    }
  }
})

test('a page anchored on its first card keeps that card in view', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  // He paged to the second page of three: d, e, f.
  assert.equal(anchoredPage(ids, 'd', 3, 1), 1)
  // An idea arrives above: d is now index 4, still on the second page.
  assert.equal(anchoredPage(['new', ...ids], 'd', 3, 1), 1)
  // Two more arrive: d moves to the third page, and the page follows it
  // rather than sliding a different set of cards under him.
  assert.equal(anchoredPage(['n1', 'n2', 'n3', ...ids], 'd', 3, 1), 2)
  // The fit changed the page size: the page is whichever now holds d.
  assert.equal(anchoredPage(ids, 'd', 2, 1), 1)
  assert.equal(anchoredPage(ids, 'd', 4, 1), 0)
})

test('with the anchor gone or never set, the page number stands, clamped', () => {
  const ids = ['a', 'b', 'c', 'd', 'e']
  assert.equal(anchoredPage(ids, null, 2, 1), 1)
  assert.equal(anchoredPage(ids, 'gone', 2, 9), 2)
  assert.equal(anchoredPage([], 'a', 2, 3), 0)
  // A zero or broken page size never divides by zero.
  assert.equal(anchoredPage(ids, 'c', 0, 0), 2)
})
