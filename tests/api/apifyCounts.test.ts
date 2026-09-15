import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCount } from '../../api/_apify.js'

// Follower count is the ranker's hub term, and it was silently absent from 22
// enriched profiles because it was the one field in the profile mapper read
// with a strict typeof check while every other field probed spellings. These
// are the shapes LinkedIn actors actually return.

test('reads a plain number', () => {
  assert.equal(parseCount(7284), 7284)
})

test('reads a thousands-separated string', () => {
  assert.equal(parseCount('12,345'), 12345)
  assert.equal(parseCount(' 1,000 '), 1000)
})

test('reads abbreviated counts in both cases', () => {
  assert.equal(parseCount('1.2K'), 1200)
  assert.equal(parseCount('24k'), 24000)
  assert.equal(parseCount('3.4M'), 3400000)
  assert.equal(parseCount('2m'), 2000000)
})

test('reads a count with trailing words', () => {
  assert.equal(parseCount('5,120 followers'), 5120)
})

// Zero and "we never learned" are different claims, and the ranker prices them
// differently: a null follower count contributes nothing to actionability,
// while a 0 would assert this person is a leaf.
test('refuses anything it cannot read rather than guessing zero', () => {
  assert.equal(parseCount(undefined), undefined)
  assert.equal(parseCount(null), undefined)
  assert.equal(parseCount(''), undefined)
  assert.equal(parseCount('500+ connections'), 500)
  assert.equal(parseCount('lots'), undefined)
  assert.equal(parseCount({}), undefined)
  assert.equal(parseCount(Number.NaN), undefined)
  assert.equal(parseCount(Infinity), undefined)
})
