// What the Content Engine is allowed to shout about.
//
// This function decides which of seventeen crons reach Krish as a problem, and
// it had no test at all. On 2026-09-17 five "errors" were on his screen and
// three of them were this function's fault: it counted only `status='ok'`
// toward recency, so a job that ran, correctly found nothing to do and wrote
// `status='skipped'` had its clock frozen, crossed its staleness allowance, and
// was reported as stale — with the skip reason, a sentence explaining a
// deliberate no-op, appended so it read as a fault diagnosis.
//
// Each case below is one way the panel can start crying wolf again.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  contentEngineAttention, CONTENT_ENGINE_JOBS, type ContentEngineRunRow,
} from '../../src/lib/contentEngineSchedule.ts'

const NOW = new Date('2026-09-17T12:00:00.000Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

/** Every job reporting a healthy run just now, so a case under test is the only
 *  thing that can speak. */
function allHealthy(over: Partial<Record<string, ContentEngineRunRow>> = {}): ContentEngineRunRow[] {
  return CONTENT_ENGINE_JOBS.map(j =>
    over[j.job] ?? { job: j.job, status: 'ok' as const, reason: null, finished_at: daysAgo(0) })
}
const linesFor = (rows: ContentEngineRunRow[], job: string) =>
  contentEngineAttention(rows, NOW).attention.filter(a => a.job === job)

test('a job that skips forever is silent — skipping is working', () => {
  // The learning compiler, exactly as it shipped broken: ran 9 days ago, judged
  // the corpus too thin, said so, and has skipped since.
  const rows = allHealthy({
    learning_compile: {
      job: 'learning_compile', status: 'skipped', finished_at: daysAgo(0),
      reason: 'only 1 edit events in 28 days: too thin to propose anything',
    },
  })
  assert.deepEqual(linesFor(rows, 'learning_compile'), [])
})

test('a skip keeps the clock running even when the last real success is ancient', () => {
  // The Drive scan: input starvation is its normal state for weeks at a time.
  // Its allowance is 36h, so without this it goes stale on any quiet fortnight.
  const rows = allHealthy({
    inspiration_scan: {
      job: 'inspiration_scan', status: 'skipped', finished_at: daysAgo(0),
      reason: 'nothing modified in the folder in the last 14 days',
    },
  })
  assert.deepEqual(linesFor(rows, 'inspiration_scan'), [])
})

test('a skip reason never reaches a surface', () => {
  // The specific defect: a no-op explanation rendered as "(last run: …)".
  const rows = allHealthy({
    inspiration_scan: {
      job: 'inspiration_scan', status: 'skipped', finished_at: daysAgo(30),
      reason: 'nothing modified in the folder in the last 14 days',
    },
  })
  const all = contentEngineAttention(rows, NOW).attention.map(a => a.line).join(' ')
  assert.ok(!all.includes('nothing modified'), `skip reason leaked: ${all}`)
})

test('a genuine failure is still loud, and still carries its reason', () => {
  const rows = allHealthy({
    arcs_surface: {
      job: 'arcs_surface', status: 'failed', finished_at: daysAgo(0),
      reason: 'arc_cards write failed',
    },
  })
  const [hit] = linesFor(rows, 'arcs_surface')
  assert.equal(hit.kind, 'failed')
  assert.match(hit.line, /Weekly surfacing failed on its last run: arc_cards write failed\./)
})

test('a job that has genuinely stopped running is still caught', () => {
  // Not skipping, not failing — simply absent. Feed ingest allows 36h.
  const rows = allHealthy({
    feed_ingest: { job: 'feed_ingest', status: 'ok', reason: null, finished_at: daysAgo(6) },
  })
  const [hit] = linesFor(rows, 'feed_ingest')
  assert.equal(hit.kind, 'stale')
  // "succeeded", because feed_ingest is judged on succeeding: a feed with
  // nothing new for days may well be broken, which runs.test.ts pins.
  assert.match(hit.line, /Feed ingest has not succeeded in 6 days\./)
})

test('a starvation-normal lane that stops firing is still caught, worded honestly', () => {
  // The flag buys a lane the right to skip, never the right to go silent. The
  // Drive scan allows 36h; nothing at all for 6 days is a real problem, and the
  // word is "run" because succeeding was never what was being asked of it.
  const rows = allHealthy({
    inspiration_scan: {
      job: 'inspiration_scan', status: 'skipped', finished_at: daysAgo(6),
      reason: 'nothing modified in the folder in the last 14 days',
    },
  })
  const [hit] = linesFor(rows, 'inspiration_scan')
  assert.equal(hit.kind, 'stale')
  assert.match(hit.line, /Drive inspiration scan has not run in 6 days\./)
  assert.ok(!hit.line.includes('nothing modified'), 'skip reason leaked into a staleness line')
})

test('a job with no rows is counted, and never becomes its own card', () => {
  // Seventeen crons that have never reported is a new deployment, not seventeen
  // emergencies — `tests/api/runs.test.ts` pins that and is right to. The bug
  // was that `unrecorded` was returned and rendered by nothing, so a cron that
  // genuinely stopped firing was invisible. The count is the signal; the caller
  // says it once.
  const out = contentEngineAttention(allHealthy().filter(r => r.job !== 'purge'), NOW)
  assert.equal(out.unrecorded, 1)
  assert.deepEqual(out.attention.filter(a => a.job === 'purge'), [])
})

test('a fully healthy engine says nothing whatsoever', () => {
  assert.deepEqual(contentEngineAttention(allHealthy(), NOW).attention, [])
})

// ── The reason string itself ────────────────────────────────────────────────
// `http_200` is what an unexplained refusal used to be turned into: the status
// code of a SUCCESSFUL transport, offered as the reason something failed.
import { apiErrorMessage } from '../../src/lib/apiFetch.ts'

test('a route that says what is wrong is quoted', () => {
  assert.equal(apiErrorMessage(500, false, { error: 'pool not configured' }), 'pool not configured')
})

test('a real transport failure keeps its status, which is the useful fact', () => {
  assert.equal(apiErrorMessage(502, false, {}), 'http_502')
})

test('a 200 that refuses without a reason never becomes http_200', () => {
  const msg = apiErrorMessage(200, true, { ok: false })
  assert.ok(!/^http_/.test(msg), `still a status code: ${msg}`)
  assert.equal(msg, 'the request was refused without a reason')
})

test('a blank error field does not count as a reason', () => {
  assert.equal(apiErrorMessage(200, true, { ok: false, error: '   ' }), 'the request was refused without a reason')
})
