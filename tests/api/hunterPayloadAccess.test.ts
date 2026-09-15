import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mayRead, sameSecret, verdict } from '../../src/lib/hunterPayloadAccess.ts'

// The payload carries Krish's CV and every answer he gave on one application.
// These are the ways in that must stay shut.

const KEY = '0123456789abcdef0123456789abcdef'
const row = (over = {}) => ({
  state: 'approved', open_key: KEY, fill_payload: { fields: [] }, ...over,
})

test('the right key on an open application reads it', () => {
  assert.equal(mayRead(row(), KEY), true)
  assert.equal(mayRead(row({ state: 'awaiting' }), KEY), true)
})

test('a wrong key of the same length is refused', () => {
  assert.equal(mayRead(row(), 'f'.repeat(32)), false)
})

test('a key of the wrong length is refused rather than throwing', () => {
  // timingSafeEqual throws on a length mismatch, which would be a 500 and a
  // length oracle in one.
  assert.equal(mayRead(row(), 'short'), false)
  assert.equal(mayRead(row(), ''), false)
  assert.equal(mayRead(row(), KEY + 'x'), false)
})

test('an empty stored key never matches', () => {
  // A row written before this column existed must not be readable by anyone
  // who guesses the empty string.
  assert.equal(mayRead(row({ open_key: null }), ''), false)
  assert.equal(mayRead(row({ open_key: '' }), ''), false)
})

test('a cancelled or submitted application is closed', () => {
  for (const state of ['cancelled', 'submitted', 'queued', 'failed']) {
    assert.equal(mayRead(row({ state }), KEY), false, state)
  }
})

test('a row with no payload is not a hole', () => {
  assert.equal(mayRead(row({ fill_payload: null }), KEY), false)
})

test('an unknown token is refused', () => {
  assert.equal(mayRead(null, KEY), false)
})

test('sameSecret is length safe in both directions', () => {
  assert.equal(sameSecret('abc', 'abc'), true)
  assert.equal(sameSecret('abc', 'abcd'), false)
  assert.equal(sameSecret('', ''), false)
})

test('the right key on a superseded application says so', () => {
  // Krish opened an older email and got "the server said 404". Someone holding
  // the right key IS the person the email was sent to, so telling them it was
  // replaced gives nothing away.
  assert.equal(verdict(row({ state: 'cancelled' }), KEY), 'superseded')
  assert.equal(verdict(row({ state: 'submitted' }), KEY), 'superseded')
})

test('a wrong key on a superseded application still says nothing', () => {
  assert.equal(verdict(row({ state: 'cancelled' }), 'f'.repeat(32)), 'no')
  assert.equal(verdict(null, KEY), 'no')
})

test('a row with no payload never reveals its state', () => {
  assert.equal(verdict(row({ state: 'cancelled', fill_payload: null }), KEY), 'no')
})
