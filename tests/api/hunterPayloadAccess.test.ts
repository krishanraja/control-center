import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mayRead, maySubmit, sameSecret, verdict } from '../../src/lib/hunterPayloadAccess.ts'

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

// Recording a press is a WRITE, so it asks a different question from a read.
// These are the cases that made it a separate function.

const subRow = (over = {}) => ({
  state: 'awaiting', open_key: KEY, submitted_at: null, ...over,
})

test('a press on an open application is recorded', () => {
  assert.equal(maySubmit(subRow(), KEY), 'record')
  assert.equal(maySubmit(subRow({ state: 'approved' }), KEY), 'record')
})

test('a press on a cancelled application is refused, not recorded', () => {
  // verdict() calls this row 'superseded' and the payload route answers 410.
  // Recording a submit on it would undo the cancellation: approval.supersede()
  // sets CANCELLED for exactly one reason, that Krish asked for an amend, and
  // flipping it to submitted would archive the role off his Pipeline tab into
  // Applied and make hunter skip the APPROVE he sends for the rebuilt one.
  assert.equal(maySubmit(subRow({ state: 'cancelled' }), KEY), 'gone')
  assert.equal(maySubmit(subRow({ state: 'failed' }), KEY), 'gone')
  assert.equal(maySubmit(subRow({ state: 'amending' }), KEY), 'gone')
})

test('pressing twice is not an error', () => {
  // The employer's receipt email can also land first. Checked before the state
  // gate, because a submitted row is itself outside OPEN_STATES.
  assert.equal(maySubmit(subRow({ submitted_at: '2026-09-15T20:00:00Z' }), KEY), 'already')
  assert.equal(
    maySubmit(subRow({ state: 'submitted', submitted_at: '2026-09-15T20:00:00Z' }), KEY),
    'already')
})

test('a wrong key or unknown token gives one answer for every failure', () => {
  assert.equal(maySubmit(subRow(), 'f'.repeat(32)), 'no')
  assert.equal(maySubmit(subRow(), 'short'), 'no')
  assert.equal(maySubmit(subRow(), ''), 'no')
  assert.equal(maySubmit(null, KEY), 'no')
  assert.equal(maySubmit(subRow({ open_key: null }), ''), 'no')
  // Even on a cancelled row, a wrong key learns nothing.
  assert.equal(maySubmit(subRow({ state: 'cancelled' }), 'f'.repeat(32)), 'no')
})

test('a press does not need a payload the way a read does', () => {
  // verdict() refuses a row with no fill_payload because there is nothing to
  // serve. He can still have submitted it.
  assert.equal(maySubmit({ state: 'awaiting', open_key: KEY, submitted_at: null }, KEY),
    'record')
})
