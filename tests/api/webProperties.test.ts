import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  WEB_PROPERTIES, WEB_METRIC_SUFFIXES, webProperty, webMetricKeys, ga4PropertyId,
  HEALTH_LINE, HEALTH_CHIP, FLAG_LINE, DONE_HINT, WEB_JOBS as REGISTRY_JOBS, isWebJob,
  type HealthVerdict, type HealthFlag, type DetectorKind, type WebJob,
} from '../../src/lib/webProperties.ts'
import { isJob, JOBS } from '../../api/_mission.js'
import { JOB_OPTIONS } from '../../src/content/jobs.ts'
import { ventureLabel } from '../../src/lib/ventureOptions.ts'

// The registry every GA reader shares. These are the ways it goes wrong
// quietly: a job id the OS does not know, a card titled with a slug, a
// property id silently read from a blank env var, a verdict with no words.

// Compile-time exhaustiveness: each list below fails to typecheck if a member
// of its union is missing, so "covers every member" means every member.
const every = <T extends string>() => <A extends T[]>(...a: A & ([T] extends [A[number]] ? unknown : never)) => a
const VERDICTS = every<HealthVerdict>()('no_access', 'api_disabled', 'wrong_stream', 'tag_missing', 'never_received', 'provisional', 'quiet', 'ok')
const FLAGS = every<HealthFlag>()('consent_gated', 'thresholded', 'admin_unverified', 'undercounting', 'host_filter_off', 'read_failed')
const DETECTORS = every<DetectorKind>()(
  'ga_read_ok', 'admin_api_ok', 'stream_match', 'tag_present', 'lifetime_hits',
  'plausible_ok', 'plausible_goals', 'canon_ruled', 'metric_present', 'key_events_configured',
  'consent_default_denied', 'substack_new_post', 'rss_items_up', 'pilot_state_advanced',
  'today_slot_done', 'condition_cleared',
)
const WEB_JOBS = every<WebJob>()('fill_pilots', 'keep_honest', 'run_pilots', 'feed_demand', 'keep_edge')

const EM_DASH = '—'

test('four properties with unique prefixes, in registry order', () => {
  assert.deepEqual(WEB_PROPERTIES.map(p => p.prefix), ['site', 'mymu', 'fulltime', 'legibility'])
  assert.equal(new Set(WEB_PROPERTIES.map(p => p.prefix)).size, WEB_PROPERTIES.length)
})

test('every measurement id is a G- id', () => {
  for (const p of WEB_PROPERTIES) assert.match(p.measurementId, /^G-[A-Z0-9]{10}$/, p.prefix)
})

test('a code default exists for fulltime and legibility only, and is numeric', () => {
  const withDefault = WEB_PROPERTIES.filter(p => p.defaultId !== undefined).map(p => p.prefix)
  assert.deepEqual(withDefault, ['fulltime', 'legibility'])
  for (const p of WEB_PROPERTIES) if (p.defaultId !== undefined) assert.match(p.defaultId, /^\d+$/, p.prefix)
})

test('an env override beats the code default', () => {
  const ft = webProperty('fulltime')!
  assert.deepEqual(ga4PropertyId(ft, { GA4_PROPERTY_FULLTIME: ' 123456789 ' }), { id: '123456789', from: 'env' })
})

test('a blank or whitespace env falls back to the code default', () => {
  const ft = webProperty('fulltime')!
  assert.deepEqual(ga4PropertyId(ft, {}), { id: '556143202', from: 'default' })
  assert.deepEqual(ga4PropertyId(ft, { GA4_PROPERTY_FULLTIME: '' }), { id: '556143202', from: 'default' })
  assert.deepEqual(ga4PropertyId(ft, { GA4_PROPERTY_FULLTIME: '   ' }), { id: '556143202', from: 'default' })
})

test('no env and no default gives none, never a guessed id', () => {
  const site = webProperty('site')!
  const r = ga4PropertyId(site, { GA4_PROPERTY_MINDMAKE_SITE: '  ' })
  assert.equal(r.from, 'none')
  assert.equal(r.id, '')
  assert.deepEqual(ga4PropertyId(site, { GA4_PROPERTY_MINDMAKE_SITE: '987' }), { id: '987', from: 'env' })
})

test('webProperty finds by prefix and misses unknowns', () => {
  assert.equal(webProperty('legibility')?.label, 'legibility.io')
  assert.equal(webProperty('mindmake'), undefined)
})

test('metric keys are prefix_suffix in suffix order', () => {
  assert.deepEqual(webMetricKeys(webProperty('site')!), ['site_sessions_1d', 'site_users_1d', 'site_pageviews_1d', 'site_key_events_1d'])
  for (const p of WEB_PROPERTIES) assert.deepEqual(webMetricKeys(p), WEB_METRIC_SUFFIXES.map(s => `${p.prefix}_${s}`))
})

test('every registry job is a job the OS knows', () => {
  for (const p of WEB_PROPERTIES) for (const j of p.jobs) assert.ok(isJob(j), `${p.prefix}: ${j}`)
})

test('WebJob ids equal the jobs the UI offers and the API owns', () => {
  const ui = JOB_OPTIONS.map(o => o.value).sort()
  assert.deepEqual([...WEB_JOBS].sort(), ui)
  assert.deepEqual([...WEB_JOBS].sort(), JOBS.map(j => j.id).sort())
  // The runtime list an answered ruling is validated against is the same set, in the UI's order.
  assert.deepEqual([...REGISTRY_JOBS], JOB_OPTIONS.map(o => o.value))
  assert.equal(isWebJob('feed_demand'), true)
  assert.equal(isWebJob('sell_more'), false)
})

test('only a live canon carries jobs', () => {
  for (const p of WEB_PROPERTIES) {
    if (p.canon.status === 'live') assert.ok(p.jobs.length > 0, `${p.prefix} is live with no job`)
    else assert.deepEqual(p.jobs, [], `${p.prefix} is ${p.canon.status} but carries jobs`)
  }
})

test('no label, goal or conflict carries an em dash', () => {
  for (const p of WEB_PROPERTIES) {
    const texts = [p.label, p.about, p.goal]
    if (p.canon.status === 'ruling_owed') texts.push(p.canon.question, p.canon.conflict, ...p.canon.options)
    for (const t of texts) assert.ok(!t.includes(EM_DASH), `${p.prefix}: ${t}`)
  }
})

test('every verdict, flag and detector has its words', () => {
  for (const v of VERDICTS) {
    assert.ok(HEALTH_LINE[v]?.trim(), `HEALTH_LINE.${v}`)
    assert.ok(HEALTH_CHIP[v]?.trim(), `HEALTH_CHIP.${v}`)
  }
  for (const f of FLAGS) assert.ok(FLAG_LINE[f]?.trim(), `FLAG_LINE.${f}`)
  for (const d of DETECTORS) assert.ok(DONE_HINT[d]?.trim(), `DONE_HINT.${d}`)
  // And nothing extra that the unions do not name.
  assert.deepEqual(Object.keys(HEALTH_LINE).sort(), [...VERDICTS].sort())
  assert.deepEqual(Object.keys(HEALTH_CHIP).sort(), [...VERDICTS].sort())
  assert.deepEqual(Object.keys(FLAG_LINE).sort(), [...FLAGS].sort())
  assert.deepEqual(Object.keys(DONE_HINT).sort(), [...DETECTORS].sort())
  const words = [...Object.values(HEALTH_LINE), ...Object.values(HEALTH_CHIP), ...Object.values(FLAG_LINE), ...Object.values(DONE_HINT)]
  for (const w of words) assert.ok(!w.includes(EM_DASH), w)
})

test('a card is titled with its domain, never a venture label', () => {
  const labels = WEB_PROPERTIES.flatMap(p => [p.prefix, p.venture]).map(s => ventureLabel(s))
  for (const p of WEB_PROPERTIES) {
    assert.notEqual(p.label, ventureLabel(p.prefix), p.prefix)
    assert.ok(!labels.includes(p.label), `${p.prefix}: ${p.label} reads as a venture label`)
  }
})
