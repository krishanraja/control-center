// The Library calendar's days (src/lib/contentCalendar.ts).
//
// Until 2026-10-06 the grid bucketed pieces by the browser's local day, so a
// scheduled_for of "2026-10-07" (a date column, read as midnight UTC) landed on
// 6 October anywhere west of UTC. Every day is a UTC calendar day now. The
// browser-zone half is proved in e2e/content-calendar.spec.ts.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calendarDayOf, monthGrid, pieceDay, stepMonth } from '../../src/lib/contentCalendar.ts'

test('a date column is its own day, never shifted', () => {
  assert.equal(calendarDayOf('2026-10-07'), '2026-10-07')
})

test('a timestamp falls on its UTC day', () => {
  assert.equal(calendarDayOf('2026-10-07T23:30:00Z'), '2026-10-07')
  assert.equal(calendarDayOf('2026-10-07T00:30:00+10:00'), '2026-10-06')
  assert.equal(calendarDayOf('nonsense'), null)
  assert.equal(calendarDayOf(null), null)
})

test('a piece sits on its scheduled day first, else the day it went out', () => {
  assert.equal(pieceDay({ scheduled_for: '2026-10-07', published_at: '2026-10-09T10:00:00Z' }), '2026-10-07')
  assert.equal(pieceDay({ scheduled_for: null, published_at: '2026-10-09T10:00:00Z' }), '2026-10-09')
})

test('the month grid is six Sunday-first weeks in UTC', () => {
  const g = monthGrid(2026, 9) // October 2026 starts on a Thursday
  assert.equal(g.length, 42)
  assert.equal(g[0].ymd, '2026-09-27')
  assert.equal(g[0].inMonth, false)
  assert.equal(g[4].ymd, '2026-10-01')
  assert.equal(g[4].inMonth, true)
  assert.equal(g.filter(c => c.inMonth).length, 31)
  assert.equal(g[41].ymd, '2026-11-07')
})

test('stepping months crosses a year', () => {
  assert.deepEqual(stepMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 })
  assert.deepEqual(stepMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 })
})
