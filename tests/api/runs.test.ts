import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyRun, countsFrom } from '../../api/_runs.ts'
import { CONTENT_ENGINE_JOBS, contentEngineAttention } from '../../src/lib/contentEngineSchedule.ts'

// The run ledger's two pure halves: how a finished handler is classified, and
// how the dashboard turns the ledger into attention lines.

test('a quiet skip is a skip, an ok:false is a failure, a throw is a failure', () => {
  assert.deepEqual(classifyRun(200, { ok: true, inserted: 4 }, null), { status: 'ok', reason: null })
  assert.deepEqual(classifyRun(200, { ok: true, skipped: 'corpus too thin' }, null), { status: 'skipped', reason: 'corpus too thin' })
  assert.deepEqual(classifyRun(200, { ok: false, error: 'pool not configured' }, null), { status: 'failed', reason: 'pool not configured' })
  assert.deepEqual(classifyRun(500, { ok: false, error: 'boom' }, null), { status: 'failed', reason: 'boom' })
  assert.deepEqual(classifyRun(503, {}, null), { status: 'failed', reason: 'http_503' })
  assert.deepEqual(classifyRun(500, null, new Error('threw')), { status: 'failed', reason: 'threw' })
})

test('counts keep numbers and drop everything else', () => {
  assert.deepEqual(countsFrom({ ok: true, inserted: 3, days: 2, sample: [1, 2], nested: { n: 1 }, schema_version: 1 }), { inserted: 3, days: 2 })
  assert.deepEqual(countsFrom(null), {})
})

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
