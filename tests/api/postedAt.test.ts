import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePostedAt } from '../../api/_apify.js'

// The shape the registered actor actually sends. It is an OBJECT, and reading
// it with a string helper returned nothing: eight people were scraped, every
// post came back undated, and because an undated post can never be recent,
// every intent score was a structural zero while the run reported success.
test('reads the nested object the posts actor sends', () => {
  const iso = parsePostedAt({ timestamp: 1750000000000, date: '2026-06-15 12:00:00', postedAgoText: '3mo' })
  assert.ok(iso)
  assert.match(iso as string, /^2026-06-15/)
})

test('prefers the exact date over the relative text in the same object', () => {
  const iso = parsePostedAt({ date: '2026-09-01T00:00:00Z', postedAgoText: '2w' })
  assert.equal(iso, '2026-09-01T00:00:00.000Z')
})

test('falls back to the timestamp when there is no date string', () => {
  const iso = parsePostedAt({ timestamp: 1750000000000 })
  assert.equal(iso, new Date(1750000000000).toISOString())
})

test('reads epoch seconds and milliseconds alike', () => {
  assert.equal(parsePostedAt(1750000000), new Date(1750000000000).toISOString())
  assert.equal(parsePostedAt(1750000000000), new Date(1750000000000).toISOString())
})

// Date.parse('1719') is the year 1719, which would date a post three centuries
// ago and silently drop it out of every recency window.
test('a numeric string is a timestamp, not a year', () => {
  const iso = parsePostedAt('1750000000')
  assert.equal(iso, new Date(1750000000000).toISOString())
})

test('reads ISO strings', () => {
  assert.equal(parsePostedAt('2026-09-10T08:30:00Z'), '2026-09-10T08:30:00.000Z')
})

test('reads relative text in the forms LinkedIn uses', () => {
  const now = Date.now()
  const within = (iso: string | null, minMs: number, maxMs: number) => {
    assert.ok(iso)
    const age = now - Date.parse(iso as string)
    assert.ok(age >= minMs && age <= maxMs, `age ${age} outside [${minMs}, ${maxMs}]`)
  }
  within(parsePostedAt('2d'), 2 * 86400000 - 5000, 2 * 86400000 + 5000)
  within(parsePostedAt('3 weeks ago'), 21 * 86400000 - 5000, 21 * 86400000 + 5000)
  within(parsePostedAt('2mo'), 60 * 86400000 - 5000, 60 * 86400000 + 5000)
  within(parsePostedAt('1yr'), 365 * 86400000 - 5000, 365 * 86400000 + 5000)
})

// Guessing a date here manufactures intent that does not exist.
test('refuses what it cannot date rather than inventing a date', () => {
  assert.equal(parsePostedAt(null), null)
  assert.equal(parsePostedAt(undefined), null)
  assert.equal(parsePostedAt(''), null)
  assert.equal(parsePostedAt('recently'), null)
  assert.equal(parsePostedAt({}), null)
  assert.equal(parsePostedAt(0), null)
  assert.equal(parsePostedAt(Number.NaN), null)
})
