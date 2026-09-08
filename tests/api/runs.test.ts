import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CONTENT_ENGINE_JOBS, contentEngineAttention } from '../../src/lib/contentEngineSchedule.ts'

// How the dashboard turns the run ledger into attention lines.
//
// The other half of this file, classifyRun and countsFrom, moved to the engine
// with api/_runs.ts in the 2026-09 unification: the wrapper that writes the
// ledger now runs there. This side keeps what the dashboard does with what it
// reads, which is the half that can still break a screen Krish looks at.

const now = new Date('2026-09-10T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()

test('a job with no history is counted, not shouted about', () => {
  const { attention, unrecorded } = contentEngineAttention([], now)
  assert.equal(attention.length, 0)
  assert.equal(unrecorded, CONTENT_ENGINE_JOBS.length)
})

test('a daily job is stale after its allowance and named when it fails', () => {
  const fresh = contentEngineAttention([{ job: 'feed_ingest', status: 'ok', reason: null, finished_at: hoursAgo(20) }], now)
  assert.equal(fresh.attention.length, 0)
  const stale = contentEngineAttention([{ job: 'feed_ingest', status: 'skipped', reason: 'nothing new', finished_at: hoursAgo(1) }, { job: 'feed_ingest', status: 'ok', reason: null, finished_at: hoursAgo(40) }], now)
  assert.equal(stale.attention.length, 1)
  assert.equal(stale.attention[0].kind, 'stale')
  assert.match(stale.attention[0].line, /Feed ingest has not succeeded in 1 day/)
  const failed = contentEngineAttention([{ job: 'feed_ingest', status: 'failed', reason: 'pool not configured', finished_at: hoursAgo(1) }], now)
  assert.equal(failed.attention[0].kind, 'failed')
  assert.match(failed.attention[0].line, /pool not configured/)
})

test('a weekly job gets a week plus a day before it is stale', () => {
  const rows = [{ job: 'briefs_assemble', status: 'ok' as const, reason: null, finished_at: hoursAgo(24 * 7 + 12) }]
  assert.equal(contentEngineAttention(rows, now).attention.length, 0)
  const older = [{ job: 'briefs_assemble', status: 'ok' as const, reason: null, finished_at: hoursAgo(24 * 9) }]
  assert.equal(contentEngineAttention(older, now).attention.length, 1)
})
