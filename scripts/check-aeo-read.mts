// check-aeo-read: the sentences the Signals section says, held to fixtures.
//
// src/lib/aeo.ts turns the AEO engine's rows into the portfolio sentence,
// the movements since last week and the per-subject read. None of it is
// stored, so nothing in the database can be checked against it; this guard
// is the check. Each assertion is a way the surface could start lying:
//
//   the never-run read     says the machine has not run, never a made-up rate
//   the first week         no movements, said in words by the caller
//   a first citation       named with the question and the engine
//   a two-tier jump        carries the before and after numbers
//   a new competitor       named with the count and last week's domain
//   no em dash             in any sentence, ever
//
//   npx tsx scripts/check-aeo-read.mts
import assert from 'node:assert/strict'
import {
  commandCaption, digestsBySubject, isFirstWeek, movements, portfolioRead, readLine, topHosts, weekShares,
  type AeoDigestRow, type AeoQueryRow, type AeoSubjectRow,
} from '../src/lib/aeo.ts'
import type { GeoProbeRow } from '../src/lib/growth.ts'

const now = new Date('2026-09-15T09:00:00.000Z') // a Tuesday; this week's Monday is 2026-09-14
const CTRL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ACME = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const subjects: AeoSubjectRow[] = [
  { id: CTRL, kind: 'venture', slug: 'ctrl', name: 'CTRL', domains: ['ctrl.mindmake.co'], competitor_domains: [], icp_line: null, seed_topics: [], never_say: [], product_slug: 'ctrl', room_target_id: null, active: true, notes: null, created_at: '', updated_at: '' },
  { id: ACME, kind: 'prospect', slug: 'acme-media', name: 'Acme Media', domains: ['acme.example'], competitor_domains: [], icp_line: null, seed_topics: [], never_say: [], product_slug: null, room_target_id: null, active: true, notes: null, created_at: '', updated_at: '' },
]

const probe = (o: Partial<GeoProbeRow> & { run_at: string }): GeoProbeRow => ({
  id: Math.random().toString(36).slice(2), product_slug: 'ctrl', question: 'What is an AI chief of staff for CEOs?', engine: 'perplexity',
  answer_snapshot: null, we_cited: false, competitors_cited: ['https://www.get-alfred.ai/x', 'https://linkedin.com/y'], touchpoint_id: null, subject_id: CTRL, subject_kind: 'venture', ...o,
})

const digest = (o: Partial<AeoDigestRow> & { subject_id: string; week_start: string }): AeoDigestRow => ({
  id: `${o.subject_id}:${o.week_start}`, run_id: 'r', themes: [], themes_status: 'no_calls', strongest_signal: null, recommendations: [],
  watch_list: [], competitor_gap: {}, playbook: null, approach_hook: null, stats: {}, created_at: `${o.week_start}T04:00:00.000Z`, updated_at: '', ...o,
})

const query = (o: Partial<AeoQueryRow> & { subject_id: string; week_start: string; query_id: string; demand_score: number }): AeoQueryRow => ({
  id: `${o.query_id}:${o.week_start}`, run_id: 'r', query: 'best AI decision tools for founders', source: 'seed', demand_basis: {}, call_evidence: [], gap: {},
  trend: 'flat', status: 'watch', touchpoint_id: null, created_at: '', ...o,
})

// ── Never run ────────────────────────────────────────────────────────────────
const neverRun = portfolioRead({ subjects, digests: [], probes: [probe({ run_at: '2026-09-07T06:00:00.000Z' })], now })
assert.equal(neverRun.never_run, true)
assert.match(neverRun.sentence, /has not run yet/)
assert.match(neverRun.sentence, /1 venture, 1 company you want to sell to/)
assert.match(neverRun.sentence, /older probe says 0% of 1 answers/)

// ── First week: digests exist, no prior ─────────────────────────────────────
const wk1 = [digest({ subject_id: CTRL, week_start: '2026-09-07', competitor_gap: { domain: 'get-alfred.ai', times_cited: 9, questions: [] }, stats: { generated_at: '2026-09-13T04:10:00.000Z' } })]
assert.equal(isFirstWeek(wk1), true)
assert.equal(movements({ subjects, digests: wk1, queries: [], probes: [] }).length, 0, 'the first week has nothing to compare')
const firstRead = portfolioRead({ subjects, digests: wk1, probes: [probe({ run_at: '2026-09-14T06:00:00.000Z' }), probe({ run_at: '2026-09-14T06:00:00.000Z', we_cited: true })], now })
assert.equal(firstRead.never_run, false)
assert.match(firstRead.sentence, /50% of 2 answers mentioned you this week/)
assert.match(firstRead.sentence, /Biggest gap: get-alfred.ai, cited 9 times instead of mm-ctrl/)
assert.match(firstRead.sentence, /Last run/)

// ── Second week: a first citation, a tier jump, a new competitor, a new theme ──
const wk2 = [
  ...wk1,
  digest({ subject_id: CTRL, week_start: '2026-09-14', competitor_gap: { domain: 'linkedin.com', times_cited: 4, questions: [] }, themes_status: 'ok', themes: [{ theme: 'Founders want the decision to stay theirs', calls: 2, evidence: [] }] }),
]
const probes2 = [
  probe({ run_at: '2026-09-07T06:00:00.000Z' }),
  probe({ run_at: '2026-09-14T04:10:00.000Z', we_cited: true, engine: 'chatgpt', query_id: 'q1' }),
]
const queries2 = [
  query({ subject_id: CTRL, week_start: '2026-09-07', query_id: 'q1', demand_score: 20 }),
  query({ subject_id: CTRL, week_start: '2026-09-14', query_id: 'q1', demand_score: 76, trend: 'up', status: 'recommend' }),
]
const moved = movements({ subjects, digests: wk2, queries: queries2, probes: probes2 })
const kinds = moved.map(m => m.kind)
assert.deepEqual(kinds, ['first_citation', 'new_competitor', 'query_up', 'new_theme'], `movement order: ${kinds.join(',')}`)
assert.match(moved[0].line, /First time an engine mentioned mm-ctrl, on "What is an AI chief of staff for CEOs\?" \(chatgpt\)/)
assert.match(moved[1].line, /linkedin.com is now cited instead of mm-ctrl on 4 answers \(last week it was get-alfred.ai\)/)
assert.match(moved[2].line, /rose from 20 to 76 demand for mm-ctrl/)
assert.match(moved[3].line, /A new theme from mm-ctrl's calls: Founders want the decision to stay theirs \(2 calls\)/)
assert.equal(isFirstWeek(wk2), false)
const by = digestsBySubject(wk2)
assert.equal(by.get(CTRL)?.latest.week_start, '2026-09-14')
assert.equal(by.get(CTRL)?.prior?.week_start, '2026-09-07')

// ── Shares, hosts, the citation read ────────────────────────────────────────
const shares = weekShares(probes2, 3, now)
assert.deepEqual(shares.map(s => s.week_start), ['2026-08-31', '2026-09-07', '2026-09-14'])
assert.equal(shares[2].rate, 1)
assert.equal(shares[1].rate, 0)
assert.equal(shares[0].rate, null)
assert.deepEqual(topHosts(probes2, 1), [{ host: 'get-alfred.ai', times: 2 }])
assert.match(readLine(0, 18, 1, '7 Sep'), /Not one answer mentioned you/)
assert.match(readLine(8, 9, 1, ''), /8 answers mentioned you/)

// ── The Run-now caption is honest ───────────────────────────────────────────
assert.match(commandCaption(null, false, 'github 404: not found'), /Queued but could not start: github 404: not found/)
assert.match(commandCaption({ id: 1, subject_id: null, state: 'queued', requested_at: '2026-09-15T08:00:00Z', started_at: null, finished_at: null, result: null, error: null }, true), /Started/)
assert.match(commandCaption({ id: 1, subject_id: null, state: 'failed', requested_at: '2026-09-15T08:00:00Z', started_at: null, finished_at: '2026-09-15T08:30:00Z', result: null, error: 'cap reached' }), /failed: cap reached/)

// ── No em dash anywhere in what the surface says ─────────────────────────────
for (const s of [neverRun.sentence, firstRead.sentence, ...moved.map(m => m.line)]) assert.doesNotMatch(s, /[—–]/, `em dash in: ${s}`)

console.log('PASS  the AEO read says the never-run, first-week, movement and caption states in words, from rows')
