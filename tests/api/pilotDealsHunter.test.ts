import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { isHunterCard, NOT_HUNTER_CARD_FILTER } from '../../src/lib/pilotDealsHunter.ts'

// The Monday drafter must never take hunter's door-in cards: it would overwrite
// the opening line hunter checked and move the card to drafted.

test('a hunter card is recognised by its notes tag', () => {
  assert.equal(isHunterCard('hunter door-in: HeyGen. Route: ...'), true)
  assert.equal(isHunterCard('  Hunter Door-In: Pylon.'), true)
})

test('his own rows are not hunter cards, including rows with no notes', () => {
  assert.equal(isHunterCard('met at the summit'), false)
  assert.equal(isHunterCard(''), false)
  assert.equal(isHunterCard(null), false)
  assert.equal(isHunterCard(undefined), false)
})

test('the query filter keeps rows with no notes', () => {
  assert.match(NOT_HUNTER_CARD_FILTER, /^notes\.is\.null,/)
  assert.match(NOT_HUNTER_CARD_FILTER, /notes\.not\.ilike\.hunter door-in:\*$/)
})

test('the Monday run filters hunter cards out in the query and again per row', () => {
  const src = readFileSync(new URL('../../api/pilot-deals/monday.ts', import.meta.url), 'utf8')
  assert.match(src, /\.or\(NOT_HUNTER_CARD_FILTER\)/)
  assert.match(src, /isHunterCard\(/)
})
