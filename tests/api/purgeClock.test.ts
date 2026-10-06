// The weekly clear-out's clock (src/lib/purgeClock.ts), shared by the Content
// tab's "Clears out Monday" badge and the server's purge boundary.
//
// Until 2026-10-06 the badge counted to the END of Monday UTC while the purge
// runs at Monday 14:00 UTC, so a piece expiring Monday afternoon or evening
// was labelled as clearing out that Monday and actually went a week later.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clearsAtNextPurge, nextPurgeRun, purgeBoundary } from '../../src/lib/purgeClock.ts'
import { clearOutEnd, clearsOutMonday } from '../../src/lib/contentCallWords.ts'
import { purgeBoundary as serverBoundary } from '../../api/_weeks.ts'

// Monday 2026-10-12 is the coming purge for every "now" below except the
// Monday-afternoon ones.
const THU = new Date('2026-10-08T10:00:00Z')
const SUN_LATE = new Date('2026-10-11T23:30:00Z')
const MON = '2026-10-12'
const at = (hm: string) => `${MON}T${hm}:00Z`

test('the next purge is Monday 14:00 UTC, seen from a Thursday and from late Sunday', () => {
  assert.equal(nextPurgeRun(THU).toISOString(), '2026-10-12T14:00:00.000Z')
  assert.equal(nextPurgeRun(SUN_LATE).toISOString(), '2026-10-12T14:00:00.000Z')
})

test('on a Monday the next purge is this afternoon until 14:00, then the Monday after', () => {
  assert.equal(nextPurgeRun(new Date(at('09:00'))).toISOString(), '2026-10-12T14:00:00.000Z')
  assert.equal(nextPurgeRun(new Date(at('13:59'))).toISOString(), '2026-10-12T14:00:00.000Z')
  assert.equal(nextPurgeRun(new Date(at('14:00'))).toISOString(), '2026-10-19T14:00:00.000Z')
  assert.equal(nextPurgeRun(new Date(at('23:59'))).toISOString(), '2026-10-19T14:00:00.000Z')
})

for (const now of [THU, SUN_LATE]) {
  const label = now === THU ? 'Thursday' : 'Sunday 23:30'
  test(`seen from ${label}: the badge agrees with the purge at Monday's edges`, () => {
    assert.equal(clearsOutMonday({ expires_at: at('13:59') }, now), true, 'Mon 13:59 goes in the 14:00 run')
    assert.equal(clearsOutMonday({ expires_at: at('14:00') }, now), true, 'Mon 14:00, the ingest stamp, goes in the 14:00 run')
    assert.equal(clearsOutMonday({ expires_at: at('14:01') }, now), false, 'Mon 14:01 waits a week (the old end-of-Monday rule said yes)')
    assert.equal(clearsOutMonday({ expires_at: at('23:59') }, now), false, 'Mon 23:59 waits a week (the old end-of-Monday rule said yes)')
    assert.equal(clearsOutMonday({ expires_at: '2026-10-11T12:00:00Z' }, now), true, 'Sunday goes on Monday')
    assert.equal(clearsOutMonday({ expires_at: '2026-10-13T00:00:00Z' }, now), false, 'Tuesday waits')
  })
}

test('on Monday afternoon, after the run, an evening expiry is next week\'s', () => {
  const now = new Date(at('15:00'))
  assert.equal(clearsOutMonday({ expires_at: at('23:59') }, now), true, 'goes in next Monday\'s run')
  assert.equal(clearsOutMonday({ expires_at: '2026-10-19T14:01:00Z' }, now), false)
})

test('no expiry, or an unreadable one, never clears out', () => {
  assert.equal(clearsOutMonday({ expires_at: null }, THU), false)
  assert.equal(clearsAtNextPurge('not a date', THU), false)
})

test('the badge and the server read one boundary', () => {
  // A piece ingested this week is stamped with purgeBoundary; the badge must
  // say it clears out at that same run.
  for (const d of [THU, SUN_LATE, new Date(at('13:59'))]) {
    assert.equal(serverBoundary(d).toISOString(), purgeBoundary(d).toISOString())
  }
  assert.equal(serverBoundary(THU).toISOString(), '2026-10-12T14:00:00.000Z')
  assert.equal(clearOutEnd(THU), serverBoundary(THU).getTime())
  assert.equal(clearsOutMonday({ expires_at: serverBoundary(THU).toISOString() }, THU), true)
})
