import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  classifyGaError, shortGaError, cleanCopy,
  hostFilter, snapshotRequests, insightBatchA, insightBatchB,
  reportMeta, gaDate, parseDaily, parseDatedBreakdown, parseTotals, parseSeries, parseRows, parsePages28,
  parseHosts, lifetimeEventCount, parseEvents, aiRows, sourcePhrase,
  adminStateFromError, propertiesInSummaries, streamsFromList, streamMatches, readProbe, newestLastmod,
  classifyHealth, planRestate, detectorFired, normaliseSlotText,
  buildFindings, actionForFinding, insightLine, healthLine, ladder, mergeShared,
  allowedDetectors, webActionRules, WEB_ACTION_SCHEMA, webActionUser, evidenceHash, pickAction, fallbackGrowthAction,
  toView, nextRunAt, crosscheckOf, doneTextsSince, isPlainLandingPath, cutAtSentence, canonRuledFor,
  PROVISIONAL_HOURS, QUIET_MAX_SESSIONS_7D, LLM_RETRY_HOURS, GROWTH_ACTION_TTL_DAYS,
  type PropertyRead, type OsFacts, type DetectorFacts, type Health, type WebInsightRow, type AdminFacts, type ProbeFacts,
} from '../../api/_webInsightsCore.js'
import {
  webProperty, DONE_HINT, canonChoices, canonRulingKey, parseCanonRuling, withCanonRuling,
  type WebProperty, type WebPrefix, type WebWindow, type KrishAction, type Finding, type HealthVerdict, type HealthFlag, type DetectorKind,
} from '../../src/lib/webProperties.ts'

// The pure core of the site-visits check. Every verdict and flag is reached
// from a crafted read, every threshold is pinned at its boundary and one step
// below, and every probe and detector is shown both firing and not firing: a
// rule that has never been seen to fail is a comment, not a test.
//
// No network, no supabase, no key material. The SA email below is a made-up
// address on the service-account domain, never a real one.

const EM = '\u2014'
const EN = '\u2013'
const SA = 'reader@cc-analytics.iam.gserviceaccount.com'
const HOUR = 3_600_000
const DAY = 24 * HOUR

const P = (prefix: WebPrefix): WebProperty => webProperty(prefix) as WebProperty
// SITE is the not-yet-ruled shape (no Plausible decision), so the rung-3 cases stay
// covered after Krish ruled "GA is enough" for mindmake.co on 2026-10-02.
const SITE: WebProperty = { ...P('site'), plausible: undefined }
const MYMU = P('mymu'), FULLTIME = P('fulltime'), LEGIBILITY = P('legibility')

/** Well past every tag's first 48 hours. */
const LATER = '2026-10-10T13:20:00Z'
/** The first run after merge: fulltime.fm and legibility.io are still inside their 48 hours. */
const TODAY = '2026-09-28T13:20:00Z'

const iso = (ms: number) => new Date(ms).toISOString()
const plus = (base: string, ms: number) => iso(Date.parse(base) + ms)

function win(sessions: number, pageviews = sessions * 2): WebWindow {
  return { sessions, users: sessions, newUsers: sessions, engagedSessions: Math.floor(sessions / 2), pageviews, keyEvents: 0, eventCount: pageviews * 3 }
}

function admin(p: WebProperty, over: Partial<AdminFacts> = {}): AdminFacts {
  return {
    state: 'ok', visible: true, accountId: '1', timeZone: 'Europe/London',
    streams: [{ measurementId: p.measurementId, defaultUri: `https://${p.host}` }], keyEvents: null, activationUrl: null, ...over,
  }
}

function probe(over: Partial<ProbeFacts> = {}): ProbeFacts {
  return {
    fetched: true, status: 200, hasTag: true, consentGated: false, consentDefaultDenied: true, title: 'Home',
    notFound: null, sitemapNewest: null, deadPages: [], ...over,
  }
}

function read(p: WebProperty, over: Partial<PropertyRead> = {}): PropertyRead {
  return {
    p, now: LATER, propertyId: '123456', idSource: 'env', tz: 'Europe/London', tzSource: 'admin', asOf: '2026-10-09',
    dataRead: { ok: true, status: 200, kind: null, error: null }, hostFilter: 'on',
    meta: { timeZone: 'Europe/London', emptyReason: null, subjectToThresholding: false, rowCount: 1, tokensConsumed: 10, tokensRemaining: 1000 },
    totals: { cur: win(30), prev: win(28) },
    series: Array.from({ length: 28 }, (_, i) => ({ date: iso(Date.parse('2026-09-12T00:00:00Z') + i * DAY).slice(0, 10), sessions: 1 })),
    top: { sources: [{ name: 'google / organic', sessions: 20 }, { name: '(direct) / (none)', sessions: 10 }], pages: [{ name: '/', sessions: 30 }], ai: [], channels: [{ name: 'Organic Search', sessions: 20 }] },
    pages28: [{ name: '/', sessions: 100 }], organic28: [],
    hosts: [{ host: p.host, pageviews: 60, events: 180 }],
    lifetime: 5000, events: null,
    admin: admin(p), probe: probe(),
    posthog: null, plausible: null, previous: null, discoveredFrom: null,
    ...over,
  }
}

function os(over: Partial<OsFacts> = {}): OsFacts {
  return {
    saEmail: SA, saProject: 'cc-analytics', adminActivationUrl: null,
    pilot: { drafted: 1, oldestDraftedAt: '2026-09-14T10:00:00Z', maxRank: 1 },
    substackLastPost: '2026-03-16T09:00:00Z', rssItems: 0,
    reviewIdeas: ['Same agent, opposite answers'], substackCountPresent: true,
    ventureActive: { mindmake: true, publication: true, full_time: true, legibility: false },
    plausibleKeySet: true, snapshotGa: null, ...over,
  }
}

function facts(over: Partial<DetectorFacts> = {}): DetectorFacts {
  return {
    now: LATER, gaReadOk: {}, adminOk: false, streamMatch: {}, tagPresent: {}, lifetimeHits: {},
    plausibleOk: false, plausibleGoals: false, consentDefaultDenied: {}, canonRuled: {}, keyEventsConfigured: {},
    substackCountPresent: false, substackLastPost: null, rssItems: null, pilotMaxRank: 1, todayDoneTexts: [], openFindingIds: {},
    ...over,
  }
}

const H = (health: HealthVerdict, flags: HealthFlag[] = [], detail = ''): Health => ({ health, flags, detail })
const ids = (fs: Finding[]) => fs.map(f => f.id)
const find = (fs: Finding[], id: string) => fs.find(f => f.id === id)
const failed = (kind: any, status: number, error = `GA4 ${status} as ${SA} (GA4_SERVICE_ACCOUNT_*): nope`) =>
  ({ ok: false, status, kind, error })

function action(over: Partial<KrishAction> = {}): KrishAction {
  return {
    id: 'site:no_access', prefix: 'site', rung: 1, kind: 'setup', title: 'Give Control Center read access to mindmake.co',
    why: 'w', first_step: 'f', job: 'keep_honest', minutes: 3, link: null, detector: { kind: 'ga_read_ok' },
    issued_at: '2026-10-01T13:20:00Z', expires_at: null, members: [], hero_line: null, alternate: null, writer: 'ladder', ...over,
  }
}

function growth(over: Partial<KrishAction> = {}): KrishAction {
  return action({
    id: 'mymu:growth:2026-10-01', prefix: 'mymu', rung: 5, kind: 'growth', title: 'Publish one makeyourmindup post this week',
    job: 'feed_demand', minutes: 90, detector: { kind: 'substack_new_post', baseline: '2026-03-16T09:00:00Z' },
    issued_at: '2026-10-01T13:20:00Z', expires_at: plus('2026-10-01T13:20:00Z', 14 * DAY), writer: 'claude', ...over,
  })
}

// ------------------------------------------------------------------ 1. errors and the cleaner

test('classifyGaError names every shape', () => {
  assert.equal(classifyGaError({ status: 0, reason: 'CREDENTIALS', error: 'GA4_SERVICE_ACCOUNT_EMAIL is unset' }), 'credentials')
  assert.equal(classifyGaError({ status: 403, reason: 'SERVICE_DISABLED', error: 'x' }), 'service_disabled')
  assert.equal(classifyGaError({ status: 403, reason: '', error: 'Google Analytics Data API has not been used in project 123 before' }), 'service_disabled')
  assert.equal(classifyGaError({ status: 403, reason: 'PERMISSION_DENIED', error: 'API is disabled for this project' }), 'service_disabled')
  assert.equal(classifyGaError({ status: 403, reason: 'PERMISSION_DENIED', error: 'User does not have sufficient permissions' }), 'permission_denied')
  assert.equal(classifyGaError({ status: 404, reason: 'NOT_FOUND', error: 'x' }), 'not_found')
  assert.equal(classifyGaError({ status: 400, reason: 'INVALID_ARGUMENT', error: 'x' }), 'invalid_argument')
  assert.equal(classifyGaError({ status: 429, reason: 'RESOURCE_EXHAUSTED', error: 'x' }), 'quota')
  assert.equal(classifyGaError({ status: 0, reason: 'NETWORK', error: 'fetch failed' }), 'network')
  assert.equal(classifyGaError({ status: 500, reason: 'INTERNAL', error: 'x' }), 'other')
})

test('shortGaError strips the service-account identity and caps at 160', () => {
  const s = shortGaError(`GA4 403 as ${SA} (GA4_SERVICE_ACCOUNT_*): User does not have sufficient permissions for this property.`)
  assert.equal(s, 'GA4 403: User does not have sufficient permissions for this property.')
  assert.ok(!s.includes('@'))
  const token = shortGaError(`no token for ${SA} (GA4_SERVICE_ACCOUNT_*): invalid_grant`)
  assert.equal(token, 'no token: invalid_grant')
  const quoted = shortGaError(`GA4_SERVICE_ACCOUNT_EMAIL "${SA}" is not a service-account address`)
  assert.ok(!quoted.includes('@'))
  assert.equal(shortGaError('x'.repeat(400)).length, 160)
  assert.equal(shortGaError('GA4 429: quota'), 'GA4 429: quota')
})

test('cleanCopy is the council cleaner: dashes and their stand-ins go, word hyphens stay', () => {
  assert.equal(cleanCopy(`Visits fell ${EM} sharply`, 200), 'Visits fell, sharply')
  assert.equal(cleanCopy(`Visits fell${EN}sharply`, 200), 'Visits fell,sharply')
  assert.equal(cleanCopy('Visits fell -- sharply', 200), 'Visits fell, sharply')
  assert.equal(cleanCopy('Visits fell--sharply', 200), 'Visits fell, sharply')
  assert.equal(cleanCopy('Visits fell - sharply', 200), 'Visits fell, sharply')
  assert.equal(cleanCopy('An AI-native full-time lane', 200), 'An AI-native full-time lane')
  assert.equal(cleanCopy(`one ${EM} -- two`, 200), 'one, two')
  assert.equal(cleanCopy('  spaced   out  . ', 200), 'spaced out.')
  assert.equal(cleanCopy(null, 10), '')
  assert.equal(cleanCopy('abcdefghijkl', 5), 'abcde')
})

// ------------------------------------------------------------------ 2. request builders

test('snapshot is one batch of three over the last 3 days, filtered only when asked', () => {
  const on = snapshotRequests(FULLTIME, { hostFilter: true })
  assert.equal(on.length, 3)
  for (const r of on) {
    assert.deepEqual(r.dateRanges, [{ startDate: '3daysAgo', endDate: 'yesterday' }])
    assert.deepEqual(r.dimensionFilter, hostFilter(FULLTIME))
  }
  assert.deepEqual((on[0].dimensions as any[]).map(d => d.name), ['date'])
  assert.deepEqual((on[0].metrics as any[]).map(m => m.name), ['sessions', 'activeUsers', 'screenPageViews', 'keyEvents'])
  assert.equal(on[0].keepEmptyRows, true)
  assert.deepEqual((on[1].dimensions as any[]).map(d => d.name), ['date', 'sessionSourceMedium'])
  assert.deepEqual((on[2].dimensions as any[]).map(d => d.name), ['date', 'landingPage'])
  for (const r of on.slice(1)) {
    assert.deepEqual((r.metrics as any[]).map(m => m.name), ['sessions', 'activeUsers', 'keyEvents'])
    assert.equal(r.limit, 150)
    assert.deepEqual(r.orderBys, [{ metric: { metricName: 'sessions' }, desc: true }])
  }
  for (const r of snapshotRequests(FULLTIME, { hostFilter: false })) assert.equal('dimensionFilter' in r, false)
  assert.deepEqual(hostFilter(FULLTIME), { filter: { fieldName: 'hostName', inListFilter: { values: ['fulltime.fm', 'www.fulltime.fm'] } } })
  assert.deepEqual(hostFilter(MYMU), { filter: { fieldName: 'hostName', inListFilter: { values: ['mindmakerlive.substack.com'] } } })
})

test('insight batch A is five requests, quota on the totals', () => {
  const a = insightBatchA(SITE, { hostFilter: true })
  assert.equal(a.length, 5)
  for (const r of a) assert.deepEqual(r.dimensionFilter, hostFilter(SITE))
  assert.deepEqual(a[0].dateRanges, [
    { startDate: '7daysAgo', endDate: 'yesterday', name: 'cur' },
    { startDate: '14daysAgo', endDate: '8daysAgo', name: 'prev' },
  ])
  assert.deepEqual((a[0].metrics as any[]).map(m => m.name),
    ['sessions', 'activeUsers', 'newUsers', 'engagedSessions', 'screenPageViews', 'keyEvents', 'eventCount'])
  assert.equal(a[0].returnPropertyQuota, true)
  assert.equal(a[1].keepEmptyRows, true)
  assert.equal(a[1].limit, 40)
  assert.deepEqual(a[1].dateRanges, [{ startDate: '27daysAgo', endDate: 'yesterday' }])
  assert.deepEqual(a[1].orderBys, [{ dimension: { dimensionName: 'date' }, desc: false }])
  assert.deepEqual((a[2].dimensions as any[]).map(d => d.name), ['landingPage'])
  assert.equal(a[2].limit, 25)
  assert.deepEqual((a[3].dimensions as any[]).map(d => d.name), ['sessionDefaultChannelGroup', 'sessionSourceMedium'])
  assert.deepEqual((a[4].dimensions as any[]).map(d => d.name), ['landingPage', 'sessionDefaultChannelGroup'])
  assert.equal(a[4].limit, 100)
  for (const r of a.slice(1)) assert.equal('returnPropertyQuota' in r, false)
  for (const r of insightBatchA(SITE, { hostFilter: false })) assert.equal('dimensionFilter' in r, false)
})

test('insight batch B never filters hosts or lifetime', () => {
  for (const on of [true, false]) {
    const b = insightBatchB(LEGIBILITY, { hostFilter: on })
    assert.equal(b.length, 3)
    assert.equal('dimensionFilter' in b[0], false)
    assert.equal('dimensionFilter' in b[1], false)
    assert.equal('dimensionFilter' in b[2], on)
    assert.deepEqual((b[0].dimensions as any[]).map(d => d.name), ['hostName'])
    assert.equal(b[0].limit, 10)
    assert.deepEqual(b[1].dateRanges, [{ startDate: '2015-08-14', endDate: 'today' }])
    assert.deepEqual((b[2].dimensions as any[]).map(d => d.name), ['eventName', 'isKeyEvent'])
    assert.equal(b[2].limit, 50)
  }
})

// ------------------------------------------------------------------ 3. parsers

const row = (d: string[], m: Array<number | string>) => ({ dimensionValues: d.map(value => ({ value })), metricValues: m.map(v => ({ value: String(v) })) })

test('gaDate and reportMeta', () => {
  assert.equal(gaDate('20260926'), '2026-09-26')
  assert.equal(gaDate('2026-09-26'), '2026-09-26')
  const full = reportMeta({
    rowCount: 3, rows: [], metadata: { timeZone: 'Europe/London', emptyReason: 'NO_DATA', subjectToThresholding: true },
    propertyQuota: { tokensPerDay: { consumed: 12, remaining: 199988 } },
  })
  assert.deepEqual(full, { timeZone: 'Europe/London', emptyReason: 'NO_DATA', subjectToThresholding: true, rowCount: 3, tokensConsumed: 12, tokensRemaining: 199988 })
  assert.deepEqual(reportMeta({ rows: [row(['20260926'], [1])] }),
    { timeZone: null, emptyReason: null, subjectToThresholding: false, rowCount: 1, tokensConsumed: null, tokensRemaining: null })
  assert.deepEqual(reportMeta(undefined),
    { timeZone: null, emptyReason: null, subjectToThresholding: false, rowCount: 0, tokensConsumed: null, tokensRemaining: null })
})

test('parseDaily keeps only returned rows, oldest first', () => {
  const rows = parseDaily({ rows: [row(['20260926'], [3, 2, 5, 1]), row(['20260924'], [0, 0, 0, 0])] })
  assert.deepEqual(rows, [
    { date: '2026-09-24', sessions: 0, users: 0, pageviews: 0, keyEvents: 0 },
    { date: '2026-09-26', sessions: 3, users: 2, pageviews: 5, keyEvents: 1 },
  ])
  assert.deepEqual(parseDaily({}), [])
})

test('parseDatedBreakdown shapes web_analytics_daily rows', () => {
  const out = parseDatedBreakdown({ rows: [row(['20260926', 'google / organic'], [4, 3, 1])] }, 'site', 'source_medium')
  assert.deepEqual(out, [{ property: 'site', metric_date: '2026-09-26', dim_type: 'source_medium', dim_value: 'google / organic', sessions: 4, users: 3, key_events: 1 }])
})

test('parseTotals keys by dateRange name, and a missing range is zeros', () => {
  const report = {
    dimensionHeaders: [{ name: 'dateRange' }],
    rows: [row(['cur'], [10, 9, 8, 7, 20, 1, 60]), row(['prev'], [5, 4, 3, 2, 10, 0, 30])],
  }
  const t = parseTotals(report)
  assert.deepEqual(t.cur, { sessions: 10, users: 9, newUsers: 8, engagedSessions: 7, pageviews: 20, keyEvents: 1, eventCount: 60 })
  assert.deepEqual(t.prev, { sessions: 5, users: 4, newUsers: 3, engagedSessions: 2, pageviews: 10, keyEvents: 0, eventCount: 30 })
  const onlyCur = parseTotals({ dimensionHeaders: [{ name: 'dateRange' }], rowCount: 1, rows: [row(['cur'], [3, 3, 3, 1, 5, 0, 19])] })
  assert.equal(onlyCur.cur.sessions, 3)
  assert.deepEqual(onlyCur.prev, { sessions: 0, users: 0, newUsers: 0, engagedSessions: 0, pageviews: 0, keyEvents: 0, eventCount: 0 })
  const none = parseTotals({})
  assert.equal(none.cur.sessions + none.prev.sessions, 0)
  // Order does not matter: prev first still lands in prev.
  assert.equal(parseTotals({ rows: [row(['prev'], [7]), row(['cur'], [9])] }).prev.sessions, 7)
})

test('parseSeries fills a missing day with null, never 0', () => {
  const s = parseSeries({ rows: [row(['20260925'], [2]), row(['20260927'], [0])] }, ['2026-09-25', '2026-09-26', '2026-09-27'])
  assert.deepEqual(s, [{ date: '2026-09-25', sessions: 2 }, { date: '2026-09-26', sessions: null }, { date: '2026-09-27', sessions: 0 }])
})

test('parseRows sums per name; parsePages28 splits out organic; hosts, lifetime and events', () => {
  const sources = { rows: [row(['Organic Search', 'google / organic'], [5]), row(['Direct', '(direct) / (none)'], [3]), row(['Organic Search', 'bing / organic'], [2])] }
  assert.deepEqual(parseRows(sources, 0), [{ name: 'Organic Search', sessions: 7 }, { name: 'Direct', sessions: 3 }])
  assert.deepEqual(parseRows(sources, 1).map(r => r.name), ['google / organic', '(direct) / (none)', 'bing / organic'])
  const p28 = parsePages28({ rows: [row(['/', 'Direct'], [5]), row(['/', 'Organic Search'], [2]), row(['/pilot', 'Organic Search'], [4])] })
  assert.deepEqual(p28.pages, [{ name: '/', sessions: 7 }, { name: '/pilot', sessions: 4 }])
  assert.deepEqual(p28.organic, [{ name: '/pilot', sessions: 4 }, { name: '/', sessions: 2 }])
  assert.deepEqual(parseHosts({ rows: [row(['fulltime.fm'], [5, 19])] }), [{ host: 'fulltime.fm', pageviews: 5, events: 19 }])
  assert.equal(lifetimeEventCount({ rows: [row([], [42])] }), 42)
  assert.equal(lifetimeEventCount({}), 0)
  assert.deepEqual(parseEvents({ rows: [row(['page_view', 'false'], [10]), row(['sign_up', 'true'], [2])] }),
    [{ name: 'page_view', count: 10, isKey: false }, { name: 'sign_up', count: 2, isKey: true }])
})

test('aiRows picks the answer engines and nothing else', () => {
  const rows = [
    { name: 'chatgpt.com / referral', sessions: 2 }, { name: 'perplexity.ai / referral', sessions: 1 },
    { name: 'www.perplexity.ai / referral', sessions: 1 }, { name: 'google / organic', sessions: 9 },
    { name: 'notclaude.ai / referral', sessions: 4 },
  ]
  assert.deepEqual(aiRows(rows).map(r => r.name), ['chatgpt.com / referral', 'perplexity.ai / referral', 'www.perplexity.ai / referral'])
  assert.deepEqual(aiRows([]), [])
})

test('sourcePhrase covers every branch', () => {
  assert.equal(sourcePhrase('(direct) / (none)'), 'a typed address or a bookmark')
  assert.equal(sourcePhrase('google / organic'), 'Google search')
  assert.equal(sourcePhrase('bing / organic'), 'Bing search')
  assert.equal(sourcePhrase('linkedin.com / referral'), 'links on linkedin.com')
  assert.equal(sourcePhrase('substack / email'), 'email')
  assert.equal(sourcePhrase('newsletter / cpc'), 'newsletter (cpc)')
  assert.equal(sourcePhrase('odd'), 'odd')
})

// ------------------------------------------------------------------ 4. admin and the page probe

test('adminStateFromError tells off from denied from broken', () => {
  assert.deepEqual(adminStateFromError({ status: 403, reason: 'SERVICE_DISABLED', error: 'x', activationUrl: 'https://console.cloud.google.com/a' }),
    { state: 'disabled', activationUrl: 'https://console.cloud.google.com/a' })
  assert.equal(adminStateFromError({ status: 403, reason: '', error: 'Google Analytics Admin API has not been used in project 1', activationUrl: null }).state, 'disabled')
  assert.deepEqual(adminStateFromError({ status: 403, reason: 'PERMISSION_DENIED', error: 'no', activationUrl: 'u' }), { state: 'denied', activationUrl: null })
  assert.equal(adminStateFromError({ status: 500, reason: '', error: 'boom', activationUrl: null }).state, 'error')
  assert.equal(adminStateFromError({ status: 0, reason: 'CREDENTIALS', error: 'unset', activationUrl: null }).state, 'error')
})

test('account summaries and streams', () => {
  const summaries = { accountSummaries: [{ account: 'accounts/9', propertySummaries: [{ property: 'properties/556143202', displayName: 'Full Time' }] }] }
  assert.deepEqual(propertiesInSummaries(summaries), [{ propertyId: '556143202', accountId: '9', displayName: 'Full Time' }])
  assert.deepEqual(propertiesInSummaries({}), [])
  const streams = streamsFromList({ dataStreams: [
    { type: 'WEB_DATA_STREAM', webStreamData: { measurementId: 'G-W2QL8RKFJ1', defaultUri: 'https://fulltime.fm' } },
    { type: 'IOS_APP_DATA_STREAM', iosAppStreamData: {} },
  ] })
  assert.deepEqual(streams, [{ measurementId: 'G-W2QL8RKFJ1', defaultUri: 'https://fulltime.fm' }])
  assert.deepEqual(streamsFromList({}), [])
  assert.equal(streamsFromList(null), null)
  assert.equal(streamMatches(streams, 'G-W2QL8RKFJ1'), true)
  assert.equal(streamMatches(streams, 'G-J5173WPD98'), false)
  assert.equal(streamMatches([], 'G-J5173WPD98'), false)
  assert.equal(streamMatches(null, 'G-W2QL8RKFJ1'), null)
})

const STATIC_GTAG_HTML = `<!doctype html><html><head><title>Full Time</title>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-W2QL8RKFJ1"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-W2QL8RKFJ1');</script>
</head><body></body></html>`
const CONSENT_LOADER_HTML = `<!doctype html><html><head><title>mind/make</title>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', analytics_storage: 'denied' });
window.mmLoadGoogleTag=function(){var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=G-SMXQH8E4CM';document.head.appendChild(s);gtag('js',new Date());gtag('config','G-SMXQH8E4CM')};
if(localStorage.getItem('mindmake_consent')==='analytics'){window.mmLoadGoogleTag()}</script>
<script defer data-domain="mindmake.co" src="https://plausible.io/js/script.js"></script></head></html>`
const SUBSTACK_HTML = `<html><head><title>makeyourmind/up | Krish Raja | Substack</title></head><body>
<script>window._preloads = JSON.parse("{\\"pub\\":{\\"googleAnalytics4Token\\":\\"G-VC5V9LDE17\\",\\"always_show_cookie_banner\\":false}}")</script></body></html>`

test('readProbe finds a static tag, a consent loader and a Substack token, and misses what is not there', () => {
  const ft = readProbe(STATIC_GTAG_HTML, 'G-W2QL8RKFJ1')
  assert.deepEqual(ft, { hasTag: true, consentGated: false, consentDefaultDenied: false, title: 'Full Time' })
  assert.equal(readProbe(STATIC_GTAG_HTML, 'G-J5173WPD98').hasTag, false)

  const mm = readProbe(CONSENT_LOADER_HTML, 'G-SMXQH8E4CM')
  assert.deepEqual(mm, { hasTag: true, consentGated: true, consentDefaultDenied: true, title: 'mind/make' })
  // Consent defaults to denied but gtag.js is a static tag: denied by default, not gated.
  const both = readProbe(CONSENT_LOADER_HTML + '<script async src="https://www.googletagmanager.com/gtag/js?id=G-SMXQH8E4CM"></script>', 'G-SMXQH8E4CM')
  assert.equal(both.consentDefaultDenied, true)
  assert.equal(both.consentGated, false)

  const ss = readProbe(SUBSTACK_HTML, 'G-VC5V9LDE17')
  assert.deepEqual(ss, { hasTag: true, consentGated: false, consentDefaultDenied: false, title: 'makeyourmind/up | Krish Raja | Substack' })
  assert.equal(readProbe(SUBSTACK_HTML, 'G-SMXQH8E4CM').hasTag, false)

  assert.deepEqual(readProbe('<html>not found</html>', 'G-SMXQH8E4CM'), { hasTag: false, consentGated: false, consentDefaultDenied: false, title: null })
})

test('newestLastmod reads the newest date, or null', () => {
  const xml = '<urlset><url><lastmod>2026-07-06</lastmod></url><url><lastmod>2026-05-01T10:00:00Z</lastmod></url><url><lastmod>junk</lastmod></url></urlset>'
  assert.equal(newestLastmod(xml), '2026-07-06')
  assert.equal(newestLastmod('<urlset></urlset>'), null)
})

// ------------------------------------------------------------------ 5. classifyHealth: every verdict, every flag, and precedence

test('no_access: no id, a bad key, a 403 and a 404, and it beats everything', () => {
  assert.deepEqual(classifyHealth(read(FULLTIME, { idSource: 'none', propertyId: null })).health, 'no_access')
  assert.equal(classifyHealth(read(FULLTIME, { idSource: 'none' })).detail, 'none')
  for (const kind of ['credentials', 'permission_denied', 'not_found'] as const) {
    const h = classifyHealth(read(FULLTIME, { dataRead: failed(kind, kind === 'not_found' ? 404 : 403) }))
    assert.equal(h.health, 'no_access', kind)
    assert.equal(h.detail, kind)
  }
  const worst = classifyHealth(read(FULLTIME, {
    dataRead: failed('permission_denied', 403), probe: probe({ hasTag: false }), lifetime: 0,
    admin: admin(FULLTIME, { streams: [{ measurementId: 'G-OTHER00000', defaultUri: 'https://elsewhere.io' }] }),
  }))
  assert.equal(worst.health, 'no_access')
})

test('api_disabled: the Data API off; the Admin API off only matters when nothing was ever recorded', () => {
  const data = classifyHealth(read(MYMU, { dataRead: failed('service_disabled', 403) }))
  assert.deepEqual([data.health, data.detail], ['api_disabled', 'data'])

  const offButLive = classifyHealth(read(MYMU, { admin: admin(MYMU, { state: 'disabled', streams: null }) }))
  assert.equal(offButLive.health, 'ok')
  assert.ok(offButLive.flags.includes('admin_unverified'))

  const offAndEmpty = classifyHealth(read(MYMU, { lifetime: 0, admin: admin(MYMU, { state: 'disabled', streams: null }) }))
  assert.deepEqual([offAndEmpty.health, offAndEmpty.detail], ['api_disabled', 'admin'])
  assert.ok(!offAndEmpty.flags.includes('admin_unverified'), 'the verdict already says it')
})

test('a transient failure keeps the previous verdict and flags it', () => {
  const prev = { health: 'ok' as HealthVerdict, property_tz: 'Europe/London', as_of: '2026-09-27', run_at: '2026-09-28T13:20:00Z', action: null, llm: null }
  for (const [kind, status] of [['quota', 429], ['network', 0], ['other', 500], ['invalid_argument', 400]] as const) {
    const h = classifyHealth(read(MYMU, { dataRead: failed(kind, status), previous: prev }))
    assert.equal(h.health, 'ok', kind)
    assert.ok(h.flags.includes('read_failed'))
  }
  const first = classifyHealth(read(MYMU, { dataRead: failed('quota', 429) }))
  assert.equal(first.health, 'provisional')
  assert.ok(first.flags.includes('read_failed'))
})

test('tag_missing only on a fetched 200 without the tag', () => {
  assert.equal(classifyHealth(read(FULLTIME, { probe: probe({ hasTag: false }) })).health, 'tag_missing')
  assert.notEqual(classifyHealth(read(FULLTIME, { probe: probe({ hasTag: false, status: 503 }) })).health, 'tag_missing')
  assert.notEqual(classifyHealth(read(FULLTIME, { probe: probe({ hasTag: null, fetched: false, status: null }) })).health, 'tag_missing')
})

test('wrong_stream needs the Admin API to prove it, and discovery overrides it', () => {
  const other = admin(LEGIBILITY, { streams: [{ measurementId: 'G-OTHER00000', defaultUri: 'https://elsewhere.io' }] })
  const h = classifyHealth(read(LEGIBILITY, { admin: other }))
  assert.deepEqual([h.health, h.detail], ['wrong_stream', 'https://elsewhere.io'])
  assert.notEqual(classifyHealth(read(LEGIBILITY, { admin: other, idSource: 'discovered', discoveredFrom: '556114272' })).health, 'wrong_stream')
  assert.notEqual(classifyHealth(read(LEGIBILITY, { admin: admin(LEGIBILITY, { state: 'disabled', streams: null }) })).health, 'wrong_stream')
  assert.equal(classifyHealth(read(LEGIBILITY)).health, 'ok')
})

test('first 48 hours are provisional; 47 h vs 49 h with nothing recorded', () => {
  const at47 = plus(FULLTIME.tagLiveAt, 47 * HOUR)
  const at49 = plus(FULLTIME.tagLiveAt, 49 * HOUR)
  assert.equal(PROVISIONAL_HOURS, 48)
  assert.equal(classifyHealth(read(FULLTIME, { now: at47, lifetime: 0 })).health, 'provisional')
  assert.equal(classifyHealth(read(FULLTIME, { now: at49, lifetime: 0 })).health, 'never_received')
  assert.equal(classifyHealth(read(FULLTIME, { now: at47, lifetime: 40 })).health, 'provisional')
  assert.equal(classifyHealth(read(FULLTIME, { now: at49, lifetime: 40 })).health, 'ok')
})

test('consent by design with nothing recorded is never_received plus consent_gated, even with the Admin API off', () => {
  const h = classifyHealth(read(SITE, { lifetime: 0, admin: admin(SITE, { state: 'disabled', streams: null }) }))
  assert.equal(h.health, 'never_received')
  assert.ok(h.flags.includes('consent_gated'))
})

test('quiet is under 5 sessions: 4 is quiet, 5 is ok', () => {
  assert.equal(QUIET_MAX_SESSIONS_7D, 5)
  assert.equal(classifyHealth(read(MYMU, { totals: { cur: win(4), prev: win(0) } })).health, 'quiet')
  assert.equal(classifyHealth(read(MYMU, { totals: { cur: win(5), prev: win(0) } })).health, 'ok')
})

test('every flag, each shown on and off', () => {
  const flagsOf = (r: PropertyRead) => classifyHealth(r).flags
  assert.ok(flagsOf(read(SITE)).includes('consent_gated'))
  assert.ok(flagsOf(read(MYMU, { probe: probe({ consentGated: true }) })).includes('consent_gated'))
  assert.ok(!flagsOf(read(MYMU)).includes('consent_gated'))

  const meta = { timeZone: 'UTC', emptyReason: null, subjectToThresholding: true, rowCount: 1, tokensConsumed: null, tokensRemaining: null }
  assert.ok(flagsOf(read(MYMU, { meta })).includes('thresholded'))
  assert.ok(!flagsOf(read(MYMU)).includes('thresholded'))

  assert.ok(flagsOf(read(MYMU, { admin: admin(MYMU, { state: 'denied', streams: null }) })).includes('admin_unverified'))
  assert.ok(!flagsOf(read(MYMU)).includes('admin_unverified'))

  const ph = (pv: number) => ({ pageviews7d: pv, users7d: 4, date: '2026-10-09' })
  assert.ok(flagsOf(read(FULLTIME, { totals: { cur: win(2, 4), prev: win(0) }, posthog: ph(10) })).includes('undercounting'))
  assert.ok(!flagsOf(read(FULLTIME, { totals: { cur: win(2, 0), prev: win(0) }, posthog: ph(9) })).includes('undercounting'), 'PostHog 9 is under the floor')
  assert.ok(!flagsOf(read(FULLTIME, { totals: { cur: win(2, 5), prev: win(0) }, posthog: ph(10) })).includes('undercounting'), 'half is not less than half')

  assert.ok(flagsOf(read(MYMU, { hostFilter: 'off' })).includes('host_filter_off'))
  assert.ok(!flagsOf(read(MYMU)).includes('host_filter_off'))

  assert.ok(flagsOf(read(MYMU, { dataRead: failed('network', 0) })).includes('read_failed'))
  assert.ok(!flagsOf(read(MYMU)).includes('read_failed'))
})

// ------------------------------------------------------------------ 6. planRestate

const D3 = ['2026-09-24', '2026-09-25', '2026-09-26']

test('all empty with no proof: held, the stored ga4 zero is deleted and a manual zero is not', () => {
  const plan = planRestate({
    prefix: 'fulltime', expectedDates: D3, rows: [], lastHealth: null,
    stored: [
      { metric_key: 'fulltime_sessions_1d', metric_date: '2026-09-26', value: 0, source: 'ga4' },
      { metric_key: 'fulltime_users_1d', metric_date: '2026-09-26', value: 0, source: 'manual' },
      { metric_key: 'fulltime_pageviews_1d', metric_date: '2026-09-25', value: 3, source: 'ga4' },
    ],
  })
  assert.equal(plan.writes.length, 0)
  assert.deepEqual(plan.holds.map(h => h.metric_date), D3)
  assert.deepEqual(plan.deletes, [{ metric_key: 'fulltime_sessions_1d', metric_date: '2026-09-26' }])
  assert.deepEqual(plan.corrections, [])
  const provisionalStill = planRestate({ prefix: 'fulltime', expectedDates: D3, rows: [], lastHealth: 'provisional', stored: [] })
  assert.equal(provisionalStill.holds.length, 3)
})

test('an empty day beside a nonzero day in the same read is a real zero', () => {
  const plan = planRestate({
    prefix: 'mymu', expectedDates: D3, lastHealth: null, stored: [],
    rows: [{ date: '2026-09-25', sessions: 2, users: 2, pageviews: 3, keyEvents: 0 }],
  })
  assert.equal(plan.holds.length, 0)
  assert.equal(plan.writes.length, 12)
  const s24 = plan.writes.find(w => w.metric_key === 'mymu_sessions_1d' && w.metric_date === '2026-09-24')
  assert.equal(s24?.value, 0)
  assert.equal(plan.writes.find(w => w.metric_key === 'mymu_pageviews_1d' && w.metric_date === '2026-09-25')?.value, 3)
})

test('last verdict quiet or ok writes zeros, including a date Google did not return', () => {
  for (const lastHealth of ['quiet', 'ok'] as const) {
    const plan = planRestate({ prefix: 'site', expectedDates: D3, rows: [], lastHealth, stored: [] })
    assert.equal(plan.holds.length, 0, lastHealth)
    assert.equal(plan.writes.length, 12)
    assert.ok(plan.writes.every(w => w.value === 0))
  }
})

test('a changed value is a correction, and only the last two dates are provisional', () => {
  const plan = planRestate({
    prefix: 'site', expectedDates: D3, lastHealth: 'ok',
    rows: [{ date: '2026-09-24', sessions: 5, users: 4, pageviews: 9, keyEvents: 0 }],
    stored: [
      { metric_key: 'site_sessions_1d', metric_date: '2026-09-24', value: 3, source: 'ga4' },
      { metric_key: 'site_users_1d', metric_date: '2026-09-24', value: 4, source: 'ga4' },
    ],
  })
  assert.deepEqual(plan.corrections, [{ metric_key: 'site_sessions_1d', metric_date: '2026-09-24', from: 3, to: 5 }])
  const prov = (d: string) => plan.writes.filter(w => w.metric_date === d).every(w => w.provisional)
  assert.equal(prov('2026-09-24'), false)
  assert.equal(prov('2026-09-25'), true)
  assert.equal(prov('2026-09-26'), true)
  assert.deepEqual(plan.writes.filter(w => w.metric_date === '2026-09-24').map(w => w.metric_key),
    ['site_sessions_1d', 'site_users_1d', 'site_pageviews_1d', 'site_key_events_1d'])
})

// ------------------------------------------------------------------ 7. buildFindings: every catalog entry, every threshold at the boundary

function findingsFor(r: PropertyRead, o: OsFacts = os()): Finding[] {
  return buildFindings(r, classifyHealth(r), o)
}

test('ladder findings: each raised by its verdict and absent otherwise', () => {
  const na = findingsFor(read(FULLTIME, { dataRead: failed('permission_denied', 403) }))
  assert.equal(find(na, 'no_access')?.rung, 1)
  assert.equal(find(na, 'no_access')?.line, 'Control Center cannot read fulltime.fm. Google refused the read.')
  assert.equal(find(findingsFor(read(FULLTIME, { idSource: 'none' })), 'no_access')?.line, 'Control Center cannot read fulltime.fm. No property id is set.')
  const cred = find(findingsFor(read(FULLTIME, { dataRead: failed('credentials', 0, 'GA4_SERVICE_ACCOUNT_PRIVATE_KEY is unset') })), 'no_access')
  assert.equal(cred?.line, 'Control Center cannot read fulltime.fm. The service account key is not usable: GA4_SERVICE_ACCOUNT_PRIVATE_KEY is unset.')

  const off = findingsFor(read(MYMU, { dataRead: failed('service_disabled', 403) }))
  assert.equal(find(off, 'data_api_off')?.rung, 1)

  const adminOff = findingsFor(read(MYMU, { lifetime: 0, admin: admin(MYMU, { state: 'disabled', streams: null }) }))
  assert.equal(find(adminOff, 'admin_api_needed')?.rung, 2)
  assert.equal(find(adminOff, 'admin_api_needed')?.detector.kind, 'admin_api_ok')

  const ws = findingsFor(read(LEGIBILITY, { admin: admin(LEGIBILITY, { streams: [{ measurementId: 'G-OTHER00000', defaultUri: 'https://elsewhere.io' }] }) }))
  assert.equal(find(ws, 'wrong_stream')?.line,
    'The property Control Center reads for legibility.io has no web stream with G-J5173WPD98. Its stream points at https://elsewhere.io.')

  const tm = findingsFor(read(FULLTIME, { probe: probe({ hasTag: false }) }))
  assert.equal(find(tm, 'tag_missing')?.line, 'fulltime.fm is live but does not load its tag G-W2QL8RKFJ1, so visits are not being counted.')

  const nr = findingsFor(read(MYMU, { lifetime: 0 }))
  assert.equal(find(nr, 'never_received')?.line,
    'mindmakerlive.substack.com has its tag and the right property, but Google Analytics has never recorded a visit.')
  const nrPh = findingsFor(read(FULLTIME, { lifetime: 0, posthog: { pageviews7d: 6, users7d: 4, date: '2026-10-09' } }))
  assert.match(find(nrPh, 'never_received')?.line ?? '', /, while PostHog counted 6 page views this week\.$/)
  assert.equal(find(findingsFor(read(SITE, { lifetime: 0 })), 'never_received'), undefined, 'consent by design never raises rung 2')

  const clean = findingsFor(read(MYMU))
  for (const id of ['no_access', 'data_api_off', 'admin_api_needed', 'wrong_stream', 'tag_missing', 'never_received', 'plausible_key', 'canon_ruling']) {
    assert.equal(find(clean, id), undefined, id)
  }
})

test('provisional properties cannot raise never_received or admin_api_needed', () => {
  const r = read(FULLTIME, { now: plus(FULLTIME.tagLiveAt, 24 * HOUR), lifetime: 0, admin: admin(FULLTIME, { state: 'disabled', streams: null }) })
  const fs = findingsFor(r)
  assert.equal(find(fs, 'never_received'), undefined)
  assert.equal(find(fs, 'admin_api_needed'), undefined)
})

test('plausible_key: no key, or a key Plausible refuses; never once declined', () => {
  assert.equal(find(findingsFor(read(SITE), os({ plausibleKeySet: false })), 'plausible_key')?.rung, 3)
  const refused = { ok: false, status: 401, error: 'unauthorized', visits7d: 0, visitsPrev7d: null, visitors7d: 0, pageviews7d: 0, topSource: null, topPage: null, goals: null }
  assert.ok(find(findingsFor(read(SITE, { plausible: refused })), 'plausible_key'))
  assert.equal(find(findingsFor(read(SITE)), 'plausible_key'), undefined)
  assert.equal(find(findingsFor(read({ ...SITE, plausible: 'declined' }), os({ plausibleKeySet: false })), 'plausible_key'), undefined)
  assert.equal(find(findingsFor(read(MYMU), os({ plausibleKeySet: false })), 'plausible_key'), undefined, 'no Plausible site id')
})

test('canon_ruling: owed on fulltime and legibility, cleared on legibility by an active venture', () => {
  const ft = find(findingsFor(read(FULLTIME)), 'canon_ruling')
  assert.equal(ft?.rung, 4)
  assert.equal(ft?.line, `${(FULLTIME.canon as any).conflict} Until you decide, no growth action can name a job.`)
  assert.ok(find(findingsFor(read(LEGIBILITY)), 'canon_ruling'))
  assert.equal(find(findingsFor(read(LEGIBILITY), os({ ventureActive: { legibility: true } })), 'canon_ruling'), undefined)
  assert.ok(find(findingsFor(read(FULLTIME), os({ ventureActive: { full_time: true } })), 'canon_ruling'), 'only legibility clears that way')
  assert.equal(find(findingsFor(read(SITE)), 'canon_ruling'), undefined)
})

test('site_fixes: each item, and the sitemap at 59 vs 60 days', () => {
  const nf = { status: 404, hasTag: false, title: 'Home' }
  const fs = findingsFor(read(FULLTIME, { probe: probe({ notFound: nf, title: 'Home' }) }))
  assert.equal(find(fs, 'site_fixes')?.line,
    "2 small fixes for fulltime.fm are ready to draft: the not-found page has no tag and the not-found page has the home page's title. Say yes in chat and one PR on krishanraja/full-time carries them.")
  assert.equal(find(findingsFor(read(FULLTIME, { probe: probe({ notFound: { status: 404, hasTag: true, title: 'Not found' } }) })), 'site_fixes'), undefined)

  const at60 = iso(Date.parse(LATER) - 60 * DAY)
  const at59 = iso(Date.parse(LATER) - 59 * DAY)
  const stale = find(findingsFor(read(FULLTIME, { probe: probe({ sitemapNewest: at60 }) })), 'site_fixes')
  assert.equal(stale?.line, '1 small fix for fulltime.fm is ready to draft: the sitemap was last updated 11 August. Say yes in chat and one PR on krishanraja/full-time carries them.')
  assert.equal(find(findingsFor(read(FULLTIME, { probe: probe({ sitemapNewest: at59 }) })), 'site_fixes'), undefined)
  assert.equal(find(findingsFor(read(MYMU, { probe: probe({ notFound: nf }) })), 'site_fixes'), undefined, 'no repo to draft on')
})

test('consent_missing: a tag loaded before asking, except by design, when retired, or with consent default denied', () => {
  const noConsent = probe({ consentDefaultDenied: false })
  assert.equal(find(findingsFor(read(FULLTIME, { probe: noConsent })), 'consent_missing')?.line,
    'fulltime.fm loads Google Analytics before asking visitors. UK rules want consent first.')
  assert.equal(find(findingsFor(read(FULLTIME)), 'consent_missing'), undefined)
  assert.equal(find(findingsFor(read(SITE, { probe: noConsent })), 'consent_missing'), undefined)
  assert.equal(find(findingsFor(read({ ...FULLTIME, canon: { status: 'retired' } }, { probe: noConsent })), 'consent_missing'), undefined)
  assert.equal(find(findingsFor(read(FULLTIME, { probe: probe({ consentDefaultDenied: false, hasTag: null }) })), 'consent_missing'), undefined)
})

test('no_key_events: from Admin or from events, only where another tool holds sign-ups', () => {
  assert.equal(find(findingsFor(read(LEGIBILITY, { admin: admin(LEGIBILITY, { keyEvents: [] }) })), 'no_key_events')?.line,
    'Google Analytics counts no sign-ups on legibility.io: they go to PostHog only.')
  assert.equal(find(findingsFor(read(SITE, { events: [{ name: 'page_view', count: 9, isKey: false }] })), 'no_key_events')?.line,
    'Google Analytics counts no sign-ups on mindmake.co: they go to Plausible only.')
  assert.equal(find(findingsFor(read(LEGIBILITY, { events: [{ name: 'sign_up', count: 1, isKey: true }] })), 'no_key_events'), undefined)
  assert.equal(find(findingsFor(read(LEGIBILITY, { events: [] })), 'no_key_events'), undefined, 'no events at all proves nothing')
  assert.equal(find(findingsFor(read(MYMU, { admin: admin(MYMU, { keyEvents: [] }) })), 'no_key_events'), undefined)
})

test('substack_count_missing and plausible_goals_missing', () => {
  assert.ok(find(findingsFor(read(MYMU), os({ substackCountPresent: false })), 'substack_count_missing'))
  assert.equal(find(findingsFor(read(MYMU)), 'substack_count_missing'), undefined)
  assert.equal(find(findingsFor(read(SITE), os({ substackCountPresent: false })), 'substack_count_missing'), undefined)
  const pl = (goals: any) => ({ ok: true, status: 200, error: null, visits7d: 40, visitsPrev7d: 30, visitors7d: 30, pageviews7d: 60, topSource: 'Google', topPage: '/', goals })
  const g = find(findingsFor(read(SITE, { plausible: pl([]) })), 'plausible_goals_missing')
  assert.equal(g?.job, 'fill_pilots')
  assert.equal(g?.detector.kind, 'plausible_goals')
  assert.equal(find(findingsFor(read(SITE, { plausible: pl([{ name: 'door_click', events: 3 }]) })), 'plausible_goals_missing'), undefined)
  assert.equal(find(findingsFor(read(SITE, { plausible: pl(null) })), 'plausible_goals_missing'), undefined)
})

test('agent findings: dead pages, search traction at 2 vs 3, AI referrals; unrouted unless canon live', () => {
  const dead = findingsFor(read(SITE, { probe: probe({ deadPages: [{ path: '/old', status: 404 }, { path: '/gone', status: 410 }] }) }))
  const d = find(dead, 'dead_landing')
  assert.equal(d?.line, '2 pages people land on return not found: /old, /gone.')
  assert.deepEqual([d?.cls, d?.owner, d?.routed], ['agent', 'maya', 'touchpoint'])
  assert.equal(find(findingsFor(read(SITE)), 'dead_landing'), undefined)
  const ftDead = find(findingsFor(read(FULLTIME, { probe: probe({ deadPages: [{ path: '/x', status: 404 }] }) })), 'dead_landing')
  assert.equal(ftDead?.line, '1 page people land on returns not found: /x.')
  assert.equal(ftDead?.routed, 'unrouted', 'fulltime is unruled')
  assert.equal(find(findingsFor(read(LEGIBILITY, { probe: probe({ deadPages: [{ path: '/x', status: 404 }] }) })), 'dead_landing')?.routed, 'unrouted')

  assert.equal(find(findingsFor(read(SITE, { organic28: [{ name: '/brief', sessions: 2 }] })), 'search_traction'), undefined)
  const st = find(findingsFor(read(SITE, { organic28: [{ name: '/brief', sessions: 3 }] })), 'search_traction')
  assert.equal(st?.line, '/brief got 3 visits from Google search in 4 weeks. Check how it ranks and whether its title matches the search.')
  assert.equal(st?.job, 'fill_pilots')
  assert.equal(find(findingsFor(read(FULLTIME, { organic28: [{ name: '/', sessions: 9 }] })), 'search_traction'), undefined, 'no job, not raised')

  const ai = [{ name: 'chatgpt.com / referral', sessions: 2 }, { name: 'perplexity.ai / referral', sessions: 1 }]
  const ar = find(findingsFor(read(MYMU, { top: { ...read(MYMU).top, ai } })), 'ai_referral')
  assert.equal(ar?.line, '3 visits came from chatgpt.com and perplexity.ai this week. The page they cite is worth keeping current.')
  assert.equal(ar?.job, 'feed_demand')
  assert.equal(find(findingsFor(read(MYMU)), 'ai_referral'), undefined)
  assert.equal(find(findingsFor(read(LEGIBILITY, { top: { ...read(LEGIBILITY).top, ai } })), 'ai_referral'), undefined)
})

test('auto findings: restated, held, removed, discovered, timezone, recovered, undercounting', () => {
  const snap = { writes: 12, holds: ['2026-09-26', '2026-09-25'], deletes: 1,
    corrections: [{ metric_key: 'mymu_sessions_1d', metric_date: '2026-09-24', from: 3, to: 5 }, { metric_key: 'mymu_users_1d', metric_date: '2026-09-24', from: 2, to: 4 }] }
  const fs = findingsFor(read(MYMU), os({ snapshotGa: { mymu: snap } }))
  assert.equal(find(fs, 'restated')?.line, 'Corrected 1 earlier day for mindmakerlive.substack.com once Google finished counting.')
  assert.equal(find(fs, 'zero_held')?.line, 'Held back 2 empty days for mindmakerlive.substack.com instead of writing them as zero.')
  assert.equal(find(fs, 'zero_removed')?.line, 'Removed 1 zero reading for mindmakerlive.substack.com that Google had not confirmed.')
  assert.ok(fs.filter(f => ['restated', 'zero_held', 'zero_removed'].includes(f.id)).every(f => f.cls === 'auto'))
  const none = findingsFor(read(MYMU), os({ snapshotGa: { mymu: { writes: 12, holds: [], deletes: 0, corrections: [] } } }))
  for (const id of ['restated', 'zero_held', 'zero_removed']) assert.equal(find(none, id), undefined, id)

  assert.equal(find(findingsFor(read(LEGIBILITY, { idSource: 'discovered', discoveredFrom: '556114272' })), 'property_discovered')?.line,
    'Found the property that owns G-J5173WPD98 and read that one instead of 556114272.')
  assert.equal(find(findingsFor(read(LEGIBILITY, { idSource: 'discovered', discoveredFrom: null })), 'property_discovered'), undefined, 'discovered on an earlier run')

  const prevOk = { health: 'ok' as HealthVerdict, property_tz: 'Europe/London', as_of: '2026-10-08', run_at: '2026-10-09T13:20:00Z', action: null, llm: null }
  assert.equal(find(findingsFor(read(MYMU)), 'timezone_learned')?.line, 'Learned that mindmakerlive.substack.com counts days in Europe/London.')
  assert.equal(find(findingsFor(read(MYMU, { previous: prevOk })), 'timezone_learned'), undefined)
  assert.ok(find(findingsFor(read(MYMU, { previous: { ...prevOk, property_tz: 'UTC' } })), 'timezone_learned'))

  assert.equal(find(findingsFor(read(MYMU, { previous: { ...prevOk, health: 'no_access' } })), 'recovered')?.line, 'mindmakerlive.substack.com is readable again.')
  assert.equal(find(findingsFor(read(MYMU, { previous: prevOk })), 'recovered'), undefined)

  const under = find(findingsFor(read(FULLTIME, { totals: { cur: win(2, 4), prev: win(0) }, posthog: { pageviews7d: 12, users7d: 5, date: '2026-10-09' } })), 'undercounting')
  assert.equal(under?.line, "Google Analytics saw 4 page views to PostHog's 12 this week, so this card reads PostHog for traffic.")
  assert.equal(find(findingsFor(read(FULLTIME)), 'undercounting'), undefined)
})

test('hosts_excluded: 2 vs 3 hits and 4.9% vs 5% of host events, only with the filter on', () => {
  const own = (events: number) => ({ host: 'mindmake.co', pageviews: 100, events })
  const f = (hosts: PropertyRead['hosts'], hostFilter: 'on' | 'off' = 'on') => find(findingsFor(read(SITE, { hosts, hostFilter })), 'hosts_excluded')
  assert.equal(f([own(19), { host: 'mindmake-co.translate.goog', pageviews: 1, events: 1 }]), undefined, '2 hits')
  assert.equal(f([own(19), { host: 'mindmake-co.translate.goog', pageviews: 2, events: 1 }])?.line,
    'Left out 2 page views from mindmake-co.translate.goog, which are not mindmake.co.')
  assert.equal(f([own(951), { host: 'staging.mindmake.co', pageviews: 5, events: 49 }]), undefined, '4.9%')
  assert.ok(f([own(950), { host: 'staging.mindmake.co', pageviews: 5, events: 50 }]), '5%')
  assert.equal(f([own(950), { host: 'staging.mindmake.co', pageviews: 5, events: 50 }], 'off'), undefined)
  assert.equal(f([own(950), { host: 'www.mindmake.co', pageviews: 5, events: 50 }]), undefined, 'an alias is not foreign')
})

// ------------------------------------------------------------------ 8. insightLine

function insight(r: PropertyRead): string {
  return insightLine(r, classifyHealth(r))
}
const tot = (cur: number, prev: number) => ({ totals: { cur: win(cur), prev: win(prev) } })
const oneSource = { top: { sources: [{ name: 'google / organic', sessions: 0 }], pages: [], ai: [], channels: [] } }
function withTop(cur: number, prev: number, topSessions: number, name = 'google / organic') {
  return { ...tot(cur, prev), top: { sources: [{ name, sessions: topSessions }], pages: [], ai: [], channels: [] } }
}

test('no percentage unless both weeks reach 20: 19 vs 20', () => {
  assert.equal(insight(read(MYMU, withTop(25, 19, 20))), '25 visits this week, against 19 the week before. Most came from Google search.')
  assert.equal(insight(read(MYMU, withTop(25, 20, 20))), 'Visits up 25% on last week, 25 against 20. Most came from Google search.')
  assert.ok(!insight(read(MYMU, withTop(19, 40, 10))).includes('%'))
})

test('trend at 24% vs 25%, up, down and halved', () => {
  assert.equal(insight(read(MYMU, withTop(124, 100, 70))), '124 visits this week, about the same as last week. Most came from Google search.')
  assert.equal(insight(read(MYMU, withTop(125, 100, 70))), 'Visits up 25% on last week, 125 against 100. Most came from Google search.')
  assert.equal(insight(read(MYMU, withTop(75, 100, 70))), 'Visits down 25% on last week, 75 against 100. Most came from Google search.')
  assert.equal(insight(read(MYMU, withTop(63, 100, 40))), 'Visits down 35% on last week, 63 against 100. Most came from Google search.')
  assert.equal(insight(read(MYMU, withTop(50, 100, 40))), 'Visits halved on last week, 50 against 100. Most came from Google search.')
  assert.equal(insight(read(MYMU, withTop(55, 100, 40))), 'Visits halved on last week, 55 against 100. Most came from Google search.')
  assert.equal(insight(read(MYMU, withTop(44, 100, 40))), 'Visits down 55% on last week, 44 against 100. Most came from Google search.')
  assert.equal(insight(read(MYMU, withTop(125, 100, 50))), 'Visits up 25% on last week, 125 against 100. The largest share came from Google search.')
})

test('few visits, no visits, and the AI suffix', () => {
  assert.equal(insight(read(MYMU, withTop(3, 1, 2, '(direct) / (none)'))), '3 visits this week, 2 of them from a typed address or a bookmark. Too few to call a trend.')
  assert.equal(insight(read(MYMU, withTop(1, 0, 1, 'linkedin.com / referral'))), '1 visit this week, 1 of them from links on linkedin.com. Too few to call a trend.')
  assert.equal(insight(read(MYMU, { ...tot(0, 0), ...oneSource })), 'No visits this week.')
  const ai = { top: { sources: [{ name: 'chatgpt.com / referral', sessions: 2 }], pages: [], ai: [{ name: 'chatgpt.com / referral', sessions: 2 }], channels: [] } }
  assert.equal(insight(read(MYMU, { ...tot(3, 0), ...ai })), '3 visits this week, 2 of them from links on chatgpt.com. Too few to call a trend. 2 came from AI answers (chatgpt.com).')
})

test('Plausible and undercounting lines take over for the sites they describe', () => {
  const pl = { ok: true, status: 200, error: null, visits7d: 41, visitsPrev7d: 30, visitors7d: 30, pageviews7d: 70, topSource: 'Google', topPage: '/', goals: [] }
  assert.equal(insight(read(SITE, { ...tot(3, 1), plausible: pl })), 'Plausible counted 41 visits this week. Google saw 3, the visitors who pressed Allow.')
  assert.equal(insight(read(FULLTIME, { totals: { cur: win(2, 4), prev: win(0) }, posthog: { pageviews7d: 12, users7d: 5, date: '2026-10-09' } })),
    'PostHog counted 12 page views this week and Google saw 4, so read PostHog for traffic here.')
})

test('bad verdicts read as their finding line; consent by design has its own words', () => {
  assert.equal(insight(read(FULLTIME, { probe: probe({ hasTag: false }) })), 'fulltime.fm is live but does not load its tag G-W2QL8RKFJ1, so visits are not being counted.')
  assert.equal(insight(read(SITE, { lifetime: 0 })),
    'Google Analytics has recorded nothing from mindmake.co since the tag went live on 25 September. It only counts visitors who press Allow, so this is not a visit count.')
  assert.equal(insight(read(LEGIBILITY, { dataRead: failed('permission_denied', 403), posthog: { pageviews7d: 5, users7d: 5, date: '2026-10-09' } })),
    'Control Center cannot read legibility.io. Google refused the read. PostHog counted 5 page views this week, so the site has visitors Google cannot show yet.')
  assert.equal(insight(read(MYMU, { dataRead: failed('service_disabled', 403) })), "The Google Analytics Data API is off in the service account's Google project.")
})

test('a failed read says so and dates the verdict it kept', () => {
  const prev = { health: 'quiet' as HealthVerdict, property_tz: 'UTC', as_of: '2026-09-27', run_at: '2026-09-28T13:20:00Z', action: null, llm: null }
  assert.equal(insight(read(MYMU, { dataRead: failed('quota', 429, 'GA4 429: Exhausted property tokens.'), previous: prev })),
    'The last read failed (GA4 429: Exhausted property tokens). The verdict above is from 27 September.')
})

test('provisional wording with and without totals', () => {
  const at = plus(FULLTIME.tagLiveAt, 20 * HOUR)
  assert.equal(insight(read(FULLTIME, { now: at, ...tot(3, 0) })), 'Counting started 27 September. 3 visits so far.')
  assert.equal(insight(read(FULLTIME, { now: at, ...tot(0, 0) })), 'Counting started 27 September. The first full day is 28 September.')
  assert.equal(insight(read(FULLTIME, { now: at, totals: null })), 'Counting started 27 September. The first full day is 28 September.')
})

test('"0 visits" never appears unless the verdict is ok or quiet', () => {
  const zero = { ...tot(0, 0), lifetime: 0 }
  const cases: PropertyRead[] = [
    read(FULLTIME, { ...zero, dataRead: failed('permission_denied', 403) }),
    read(FULLTIME, { ...zero, idSource: 'none' }),
    read(MYMU, { ...zero, dataRead: failed('service_disabled', 403) }),
    read(MYMU, { ...zero, admin: admin(MYMU, { state: 'disabled', streams: null }) }),
    read(LEGIBILITY, { ...zero, admin: admin(LEGIBILITY, { streams: [] }) }),
    read(FULLTIME, { ...zero, probe: probe({ hasTag: false }) }),
    read(MYMU, zero),
    read(SITE, zero),
    read(FULLTIME, { ...zero, now: plus(FULLTIME.tagLiveAt, 10 * HOUR) }),
    read(MYMU, { ...zero, dataRead: failed('network', 0) }),
  ]
  const seen = new Set<string>()
  for (const r of cases) {
    const h = classifyHealth(r)
    seen.add(h.health)
    assert.ok(!['ok', 'quiet'].includes(h.health), h.health)
    assert.doesNotMatch(insightLine(r, h), /\b0 visits/, h.health)
    assert.doesNotMatch(healthLine(r, h), /\b0 visits/, h.health)
  }
  assert.deepEqual([...seen].sort(), ['api_disabled', 'never_received', 'no_access', 'provisional', 'tag_missing', 'wrong_stream'])
})

test('healthLine starts with the shared words and adds the reason', () => {
  const r = read(LEGIBILITY, { admin: admin(LEGIBILITY, { streams: [{ measurementId: 'G-OTHER00000', defaultUri: 'https://elsewhere.io' }] }) })
  assert.equal(healthLine(r, classifyHealth(r)), 'The property id points at a different site. Its stream points at https://elsewhere.io.')
  assert.equal(healthLine(read(MYMU), classifyHealth(read(MYMU))), 'Reading fine.')
})

// ------------------------------------------------------------------ 9. ladder, with today's facts as fixtures

function runLadder(r: PropertyRead, o: OsFacts = os(), f: DetectorFacts = facts(), hash = 'h1') {
  const h = classifyHealth(r)
  const fs = buildFindings(r, h, o)
  return ladder({ r, h, findings: fs, facts: f, os: o, evidenceHash: hash, now: r.now })
}

// What the four cards look like on the first run, per spec 5.4.
const siteToday = () => read(SITE, { now: TODAY, ...tot(3, 2) })
const mymuToday = () => read(MYMU, { now: TODAY, ...tot(8, 6) })
const fulltimeToday = () => read(FULLTIME, { now: TODAY, ...tot(3, 0) })
const legibilityToday = () => read(LEGIBILITY, { now: TODAY, ...tot(4, 0) })
const osToday = () => os({ plausibleKeySet: false })

test('site today: rung 3, the Plausible key', () => {
  const l = runLadder(siteToday(), osToday())
  assert.equal(l.action?.id, 'site:plausible_key')
  assert.equal(l.action?.rung, 3)
  assert.equal(l.action?.kind, 'data')
  assert.equal(l.action?.title, 'Give Control Center your Plausible key for mindmake.co')
  assert.match(l.action?.why ?? '', /\. Google saw 3 sessions this week\.$/)
  assert.equal(l.action?.link?.href, 'https://plausible.io/settings/api-keys')
  assert.equal(l.needsLlm, false)
})

test('site with never_received plus consent is still rung 3, not 2', () => {
  const r = read(SITE, { now: TODAY, lifetime: 0, ...tot(0, 0) })
  assert.equal(classifyHealth(r).health, 'never_received')
  const l = runLadder(r, osToday())
  assert.equal(l.action?.rung, 3)
  assert.equal(l.action?.id, 'site:plausible_key')
  assert.equal(l.action?.why.includes('Google saw'), false, 'no GA number from an unproven read')
})

test('the ladder itself skips rung 2 never_received for consent by design, even if handed one', () => {
  const r = read(SITE, { now: TODAY, lifetime: 0, ...tot(0, 0) })
  const h = classifyHealth(r)
  const handed: Finding[] = [{ id: 'never_received', prefix: 'site', cls: 'krish', line: 'x', job: 'keep_honest', detector: { kind: 'lifetime_hits' }, evidence: {}, rung: 2 }]
  const l = ladder({ r, h, findings: handed, facts: facts(), os: os(), evidenceHash: 'x', now: TODAY })
  assert.equal(l.action, null)
})

test('mymu ok: nothing on rungs 1 to 4, so the model is asked', () => {
  const l = runLadder(mymuToday(), osToday())
  assert.equal(l.action, null)
  assert.equal(l.needsLlm, true)
  assert.equal(l.waitLine, null)
})

test('fulltime 403: rung 1 asks for the account-level grant', () => {
  const l = runLadder(read(FULLTIME, { now: TODAY, dataRead: failed('permission_denied', 403) }), osToday())
  assert.equal(l.action?.id, 'fulltime:no_access')
  assert.equal(l.action?.rung, 1)
  assert.equal(l.action?.title, 'Give Control Center read access to fulltime.fm')
  assert.equal(l.action?.why, 'Google refused the read of property 123456: GA4 403: nope.')
  assert.match(l.action?.first_step ?? '', /account/)
  assert.ok(l.action?.first_step.includes(SA))
  assert.equal(l.action?.hero_line, 'Let Control Center read fulltime.fm')
  assert.equal(l.action?.detector.kind, 'ga_read_ok')
})

test('rung 1 variants: no id, a bad key, the Data API off', () => {
  const none = runLadder(read(LEGIBILITY, { idSource: 'none', propertyId: null }))
  assert.equal(none.action?.title, 'Tell Control Center which property is legibility.io')
  assert.equal(none.action?.why, 'GA4_PROPERTY_LEGIBILITY is not set in Vercel and the site has no id in the code.')
  const key = runLadder(read(MYMU, { dataRead: failed('credentials', 0, 'GA4_SERVICE_ACCOUNT_PRIVATE_KEY is unset') }))
  assert.equal(key.action?.title, 'Fix the Google Analytics key in Vercel')
  assert.equal(key.action?.why, 'GA4_SERVICE_ACCOUNT_PRIVATE_KEY is unset')
  assert.equal(key.action?.hero_line, 'Fix the Google Analytics key')
  const data = runLadder(read(MYMU, { dataRead: failed('service_disabled', 403) }))
  assert.equal(data.action?.title, 'Turn on the Google Analytics Data API')
  assert.equal(data.action?.why, 'Every read of mindmakerlive.substack.com is refused because the Data API is off in project cc-analytics.')
  assert.equal(data.action?.link?.href, 'https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com?project=cc-analytics')
})

test('rung 2 variants: wrong stream, tag missing, never received', () => {
  const ws = runLadder(read(LEGIBILITY, { admin: admin(LEGIBILITY, { streams: [{ measurementId: 'G-OTHER00000', defaultUri: 'https://elsewhere.io' }] }) }))
  assert.equal(ws.action?.title, 'Check which property is legibility.io')
  assert.equal(ws.action?.why, 'The property Control Center reads has a web stream for https://elsewhere.io, not legibility.io, and none of the properties it can see carries G-J5173WPD98.')
  const tm = runLadder(read(FULLTIME, { probe: probe({ hasTag: false }) }))
  assert.equal(tm.action?.title, 'Put the Google tag back on fulltime.fm')
  assert.equal(tm.action?.first_step, 'Say yes in chat and I will open a PR on krishanraja/full-time that restores it.')
  const nr = runLadder(read(FULLTIME, { lifetime: 0, posthog: { pageviews7d: 6, users7d: 4, date: '2026-10-09' } }))
  assert.equal(nr.action?.title, 'Check Google Analytics is not filtering out every visit to fulltime.fm')
  assert.equal(nr.action?.why, 'The tag is on the page and PostHog counted 6 page views this week, but Google has never recorded one since 27 September.')
  assert.equal(nr.action?.hero_line, 'Find out why fulltime.fm records nothing')
})

test('fulltime provisional: rung 4, decide what it is for', () => {
  const l = runLadder(fulltimeToday(), osToday())
  assert.equal(classifyHealth(fulltimeToday()).health, 'provisional')
  assert.equal(l.action?.id, 'fulltime:canon_ruling')
  assert.equal(l.action?.title, 'Decide what fulltime.fm is for')
  assert.equal(l.action?.why, 'The registry calls it a career lane, the rebrand note calls it an experiment, and its own repo calls it a proof piece that is not sold. Until you pick, no growth action can name a job.')
  assert.equal(l.action?.kind, 'ruling')
  assert.equal(l.action?.hero_line, null)
  assert.equal(l.action?.minutes, 2)
})

test('legibility: rung 4, decide whether it is live; an active venture clears it', () => {
  const l = runLadder(legibilityToday(), osToday())
  assert.equal(l.action?.title, 'Decide whether legibility.io is live')
  assert.equal(l.action?.why, 'It has been retired in the registry since 11 August, yet this month it got 17 commits, paid plans and a Google tag. The dashboard calls it retired until you say otherwise.')
  const later = runLadder(read(LEGIBILITY, tot(4, 0)), os({ ventureActive: { legibility: true } }))
  assert.equal(later.action, null)
  assert.equal(later.needsLlm, false)
  assert.equal(later.waitLine, 'Nothing only you can do on legibility.io this week.')
})

test('wait lines: measure only, retired, provisional, a failed read', () => {
  const measure = runLadder(read({ ...FULLTIME, canon: { status: 'measure_only' } }))
  assert.equal(measure.waitLine, 'Measure only, by your ruling.')
  assert.equal(measure.action, null)
  assert.equal(runLadder(read({ ...LEGIBILITY, canon: { status: 'retired' } })).waitLine, 'Retired by your ruling. Only visits are read.')
  const prov = runLadder(read({ ...FULLTIME, canon: { status: 'live' }, jobs: ['feed_demand'] }, { now: TODAY }))
  assert.equal(prov.waitLine, 'Nothing to do yet. The first full day of data lands on 29 September.')
  const prev = { health: 'ok' as HealthVerdict, property_tz: 'UTC', as_of: '2026-10-08', run_at: '2026-10-09T13:20:00Z', action: null, llm: null }
  assert.equal(runLadder(read(MYMU, { dataRead: failed('quota', 429), previous: prev })).waitLine, 'Nothing to do until the next check reads it.')
})

test('stickiness keeps issued_at while the id is unchanged', () => {
  const prev = { health: 'no_access' as HealthVerdict, property_tz: null, as_of: '2026-10-08', run_at: '2026-10-09T13:20:00Z',
    action: action({ id: 'fulltime:no_access', prefix: 'fulltime', issued_at: '2026-10-02T13:20:00Z' }), llm: null }
  const l = runLadder(read(FULLTIME, { dataRead: failed('permission_denied', 403), previous: prev }))
  assert.equal(l.action?.issued_at, '2026-10-02T13:20:00Z')
  const fresh = runLadder(read(FULLTIME, { dataRead: failed('permission_denied', 403) }))
  assert.equal(fresh.action?.issued_at, LATER)
})

test('a detector firing closes the action and surfaces the next rung in the same call', () => {
  const prev = { health: 'no_access' as HealthVerdict, property_tz: null, as_of: '2026-09-27', run_at: '2026-09-27T13:20:00Z',
    action: action({ id: 'fulltime:no_access', prefix: 'fulltime', title: 'Give Control Center read access to fulltime.fm' }), llm: null }
  const l = runLadder(read(FULLTIME, { now: TODAY, ...tot(3, 0), previous: prev }), osToday(), facts({ gaReadOk: { fulltime: true } }))
  assert.deepEqual(l.closed, [{ title: 'Give Control Center read access to fulltime.fm', detector: 'ga_read_ok', how: 'done', closed_at: TODAY }])
  assert.equal(l.action?.id, 'fulltime:canon_ruling')
  const notYet = runLadder(read(FULLTIME, { now: TODAY, ...tot(3, 0), previous: prev }), osToday(), facts())
  assert.deepEqual(notYet.closed, [])
})

test('rung 5: reused while open, retired at 14 days', () => {
  const issued = '2026-09-26T13:20:00Z'
  const g = growth({ issued_at: issued, expires_at: plus(issued, GROWTH_ACTION_TTL_DAYS * DAY) })
  const prev = (llm: any = { evidence_hash: 'h1', attempted_at: issued, writer: 'claude' }) =>
    ({ health: 'ok' as HealthVerdict, property_tz: 'Europe/London', as_of: '2026-10-08', run_at: '2026-10-09T13:20:00Z', action: g, llm })
  const at13 = plus(issued, 13 * DAY)
  const reuse = runLadder(read(MYMU, { now: at13, previous: prev() }))
  assert.equal(reuse.action, g)
  assert.equal(reuse.needsLlm, false)
  assert.deepEqual(reuse.closed, [])
  const at14 = plus(issued, 14 * DAY)
  const expired = runLadder(read(MYMU, { now: at14, previous: prev() }))
  assert.equal(expired.action, null)
  assert.equal(expired.needsLlm, true)
  assert.deepEqual(expired.closed, [{ title: g.title, detector: 'substack_new_post', how: 'expired', closed_at: at14 }])
})

test('the needsLlm matrix: hash change at 2 vs 3 days, fallback retry at 19 vs 21 hours', () => {
  const issued = '2026-10-01T13:20:00Z'
  const run = (now: string, llm: any, writer: KrishAction['writer'] = 'claude', hash = 'h1') => {
    const prev = { health: 'ok' as HealthVerdict, property_tz: 'Europe/London', as_of: '2026-10-01', run_at: issued,
      action: growth({ issued_at: issued, expires_at: plus(issued, 14 * DAY), writer }), llm }
    return runLadder(read(MYMU, { now, previous: prev }), os(), facts(), hash).needsLlm
  }
  const llm = { evidence_hash: 'h1', attempted_at: issued, writer: 'claude' }
  assert.equal(run(plus(issued, 5 * DAY), llm), false, 'same evidence: reuse')
  assert.equal(run(plus(issued, 2 * DAY), llm, 'claude', 'h2'), false, 'changed, but only 2 days old')
  assert.equal(run(plus(issued, 3 * DAY), llm, 'claude', 'h2'), true, 'changed and 3 days old')
  assert.equal(run(plus(issued, 5 * DAY), { ...llm, attempted_at: plus(issued, 5 * DAY - 10 * HOUR) }, 'claude', 'h2'), false, 'asked 10 h ago: never again so soon')
  const fb = { evidence_hash: 'h1', attempted_at: issued, writer: 'fallback' }
  assert.equal(LLM_RETRY_HOURS, 20)
  assert.equal(run(plus(issued, 19 * HOUR), fb, 'fallback'), false, 'fallback retried after 19 h: too soon')
  assert.equal(run(plus(issued, 21 * HOUR), fb, 'fallback'), true, 'fallback retried after 21 h')
  assert.equal(runLadder(read(MYMU)).needsLlm, true, 'no previous growth action')
})

// ------------------------------------------------------------------ 10. mergeShared

function itemFor(r: PropertyRead, o: OsFacts = os()) {
  const h = classifyHealth(r)
  const findings = buildFindings(r, h, o)
  const l = ladder({ r, h, findings, facts: facts(), os: o, evidenceHash: 'x', now: r.now })
  return { prefix: r.p.prefix, action: l.action, findings }
}

test('two 403s become one account grant; members wait', () => {
  const items = [
    itemFor(read(FULLTIME, { now: TODAY, dataRead: failed('permission_denied', 403) })),
    itemFor(read(LEGIBILITY, { now: TODAY, dataRead: failed('permission_denied', 403) })),
    itemFor(mymuToday()),
  ]
  const m = mergeShared(items, null, os(), facts(), TODAY)
  assert.equal(m.shared?.id, 'shared:ga_grant')
  assert.equal(m.shared?.prefix, 'shared')
  assert.deepEqual(m.shared?.members, ['fulltime', 'legibility'])
  assert.equal(m.shared?.title, 'Give Control Center read access to your whole Google Analytics account')
  assert.equal(m.shared?.why, 'fulltime.fm and legibility.io refuse to be read. One grant on the account covers all four sites and any you add later.')
  assert.equal(m.shared?.first_step, `In Google Analytics open Admin, then Account access management, press the plus, add ${SA} as Viewer, and save.`)
  assert.equal(m.shared?.hero_line, 'Let Control Center read your Google Analytics')
  assert.equal(m.shared?.minutes, 3)
  assert.equal(m.perProperty.fulltime, null)
  assert.equal(m.perProperty.legibility, null)
  assert.deepEqual(m.waitLines, { fulltime: 'Waiting on the step at the top.', legibility: 'Waiting on the step at the top.' })
  assert.equal(m.perProperty.site, null, 'not in items')
})

test('one 403 stays on its own card; a 404 never joins the grant', () => {
  const one = mergeShared([itemFor(read(FULLTIME, { dataRead: failed('permission_denied', 403) })), itemFor(read(MYMU))], null, os(), facts(), LATER)
  assert.equal(one.shared, null)
  assert.equal(one.perProperty.fulltime?.id, 'fulltime:no_access')
  const mixed = mergeShared([
    itemFor(read(FULLTIME, { dataRead: failed('permission_denied', 403) })),
    itemFor(read(LEGIBILITY, { dataRead: failed('not_found', 404) })),
  ], null, os(), facts(), LATER)
  assert.equal(mixed.shared, null)
})

test('the Admin API is shared even for one property, and the grant outranks it', () => {
  const adminOff = () => itemFor(read(MYMU, { lifetime: 0, admin: admin(MYMU, { state: 'disabled', streams: null }) }))
  const one = mergeShared([adminOff(), itemFor(read(FULLTIME))], null, os({ adminActivationUrl: 'https://console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=1' }), facts(), LATER)
  assert.equal(one.shared?.id, 'shared:admin_api')
  assert.equal(one.shared?.rung, 2)
  assert.deepEqual(one.shared?.members, ['mymu'])
  assert.equal(one.shared?.why, 'mindmakerlive.substack.com has recorded nothing, and without this API Control Center cannot tell a wrong property id from a quiet site.')
  assert.equal(one.shared?.hero_line, 'Turn on one Google setting so the sites can be checked')
  assert.equal(one.shared?.link?.label, 'Open Google Cloud')
  assert.match(one.shared?.link?.href ?? '', /overview\?project=1$/)
  assert.equal(one.waitLines.mymu, 'Waiting on the step at the top.')
  assert.ok(one.perProperty.fulltime, 'others keep their own action')

  const both = mergeShared([
    adminOff(),
    itemFor(read(FULLTIME, { dataRead: failed('permission_denied', 403) })),
    itemFor(read(LEGIBILITY, { dataRead: failed('permission_denied', 403) })),
  ], null, os(), facts(), LATER)
  assert.equal(both.shared?.id, 'shared:ga_grant')
  assert.equal(both.perProperty.mymu, null)
})

test('a shared action closes when every member fires, and keeps issued_at while open', () => {
  const items = [
    itemFor(read(FULLTIME, { dataRead: failed('permission_denied', 403) })),
    itemFor(read(LEGIBILITY, { dataRead: failed('permission_denied', 403) })),
  ]
  const prev = action({ id: 'shared:ga_grant', prefix: 'shared', members: ['fulltime', 'legibility'], issued_at: '2026-10-03T13:20:00Z', title: 'Give Control Center read access to your whole Google Analytics account' })
  const open = mergeShared(items, prev, os(), facts({ gaReadOk: { fulltime: true } }), LATER)
  assert.deepEqual(open.sharedClosed, [])
  assert.equal(open.shared?.issued_at, '2026-10-03T13:20:00Z')
  const done = mergeShared([itemFor(read(FULLTIME)), itemFor(read(LEGIBILITY))], prev, os(), facts({ gaReadOk: { fulltime: true, legibility: true } }), LATER)
  assert.deepEqual(done.sharedClosed.map(c => [c.title, c.how]), [['Give Control Center read access to your whole Google Analytics account', 'done']])
  assert.equal(done.shared, null)
})

// ------------------------------------------------------------------ 11. detectorFired: every kind, firing, not firing, and unknown never firing

test('every detector kind fires on its fact and not on an unknown', () => {
  const on = (kind: DetectorKind, f: Partial<DetectorFacts>, over: Partial<KrishAction> = {}) =>
    detectorFired(action({ id: 'fulltime:x', prefix: 'fulltime', detector: { kind }, ...over }), facts(f))
  const perProperty: Array<[DetectorKind, keyof DetectorFacts]> = [
    ['ga_read_ok', 'gaReadOk'], ['stream_match', 'streamMatch'], ['tag_present', 'tagPresent'], ['lifetime_hits', 'lifetimeHits'],
    ['canon_ruled', 'canonRuled'], ['key_events_configured', 'keyEventsConfigured'], ['consent_default_denied', 'consentDefaultDenied'],
  ]
  for (const [kind, key] of perProperty) {
    assert.equal(on(kind, { [key]: { fulltime: true } } as any), true, kind)
    assert.equal(on(kind, { [key]: { fulltime: false } } as any), false, kind)
    assert.equal(on(kind, { [key]: { fulltime: null } } as any), false, `${kind} null`)
    assert.equal(on(kind, { [key]: {} } as any), false, `${kind} undefined`)
    assert.equal(on(kind, { [key]: { legibility: true } } as any), false, `${kind} other property`)
  }
  assert.equal(on('admin_api_ok', { adminOk: true }), true)
  assert.equal(on('admin_api_ok', { adminOk: false }), false)
  assert.equal(on('plausible_ok', { plausibleOk: true }), true)
  assert.equal(on('plausible_ok', { plausibleOk: false }), false)
  assert.equal(on('plausible_goals', { plausibleGoals: true }), true)
  assert.equal(on('plausible_goals', { plausibleGoals: false }), false)
  assert.equal(on('metric_present', { substackCountPresent: true }), true)
  assert.equal(on('metric_present', { substackCountPresent: false }), false)

  const post = { detector: { kind: 'substack_new_post' as DetectorKind, baseline: '2026-03-16T09:00:00Z' } }
  assert.equal(on('substack_new_post', { substackLastPost: '2026-10-01T09:00:00Z' }, post), true)
  assert.equal(on('substack_new_post', { substackLastPost: '2026-03-16T09:00:00Z' }, post), false)
  assert.equal(on('substack_new_post', { substackLastPost: null }, post), false)
  assert.equal(on('substack_new_post', { substackLastPost: '2026-10-01T09:00:00Z' }, { detector: { kind: 'substack_new_post', baseline: null } }), false)

  const rss = { detector: { kind: 'rss_items_up' as DetectorKind, baseline: 0 } }
  assert.equal(on('rss_items_up', { rssItems: 1 }, rss), true)
  assert.equal(on('rss_items_up', { rssItems: 0 }, rss), false)
  assert.equal(on('rss_items_up', { rssItems: null }, rss), false)
  assert.equal(on('rss_items_up', { rssItems: 3 }, { detector: { kind: 'rss_items_up', baseline: null } }), false)

  const pilot = { detector: { kind: 'pilot_state_advanced' as DetectorKind, baseline: 1 } }
  assert.equal(on('pilot_state_advanced', { pilotMaxRank: 2 }, pilot), true)
  assert.equal(on('pilot_state_advanced', { pilotMaxRank: 1 }, pilot), false)
  assert.equal(on('pilot_state_advanced', { pilotMaxRank: 5 }, { detector: { kind: 'pilot_state_advanced', baseline: null } }), false)

  const slot = { title: '  Publish one  makeyourmindup post this week ' }
  assert.equal(on('today_slot_done', { todayDoneTexts: ['publish one makeyourmindup post this week'] }, slot), true)
  assert.equal(on('today_slot_done', { todayDoneTexts: ['publish one makeyourmindup post'] }, slot), false, 'exact, not a substring')
  assert.equal(on('today_slot_done', { todayDoneTexts: [] }, slot), false)

  const cond = { id: 'fulltime:dead_landing' }
  assert.equal(on('condition_cleared', { openFindingIds: { fulltime: ['consent_missing'] } }, cond), true)
  assert.equal(on('condition_cleared', { openFindingIds: { fulltime: ['dead_landing'] } }, cond), false)
  assert.equal(on('condition_cleared', { openFindingIds: {} }, cond), false, 'unknown never fires')
})

test('plausible_ok also fires once the registry says declined', () => {
  const live = P('site')
  assert.equal(live.plausible, 'declined', 'Ruling (Krish, 2026-10-02): GA is enough for mindmake.co')
  assert.equal(detectorFired(action({ detector: { kind: 'plausible_ok' } }), facts()), true)
  try {
    ;(live as any).plausible = undefined
    assert.equal(detectorFired(action({ detector: { kind: 'plausible_ok' } }), facts()), false)
  } finally {
    ;(live as any).plausible = 'declined'
  }
})

test('shared actions fire only when every member fires', () => {
  const shared = action({ id: 'shared:ga_grant', prefix: 'shared', members: ['fulltime', 'legibility'] })
  assert.equal(detectorFired(shared, facts({ gaReadOk: { fulltime: true } })), false)
  assert.equal(detectorFired(shared, facts({ gaReadOk: { fulltime: true, legibility: true } })), true)
  assert.equal(detectorFired({ ...shared, members: [] }, facts({ gaReadOk: { fulltime: true } })), false)
})

test('normaliseSlotText', () => {
  assert.equal(normaliseSlotText('  Send   The Pilot\nApproach '), 'send the pilot approach')
  assert.equal(normaliseSlotText('x'.repeat(300)).length, 240)
})

// ------------------------------------------------------------------ 12. pickAction and the fallbacks

const cand = (over: Record<string, unknown> = {}) => ({
  title: 'Publish the review idea this week', why: 'The last post was 16 March.', first_step: 'Open Content and publish it.',
  job: 'feed_demand', minutes: 90, done_signal: 'substack_new_post', play: false, ...over,
})

test('a valid set: the first non-play is the action, the play the alternate', () => {
  const raw = { candidates: [cand({ play: true, title: 'Record a voice note for readers' }), cand(), cand({ title: 'Reply to three readers today' })] }
  const out = pickAction(raw, MYMU, LATER, os())
  assert.equal(out.action?.title, 'Publish the review idea this week')
  assert.equal(out.action?.id, 'mymu:growth:2026-10-10')
  assert.deepEqual([out.action?.rung, out.action?.kind, out.action?.writer], [5, 'growth', 'claude'])
  assert.equal(out.action?.expires_at, plus(LATER, 14 * DAY))
  assert.deepEqual(out.action?.detector, { kind: 'substack_new_post', baseline: '2026-03-16T09:00:00Z' })
  assert.deepEqual(out.alternate, { title: 'Record a voice note for readers', why: 'The last post was 16 March.', job: 'feed_demand' })
  assert.deepEqual(out.action?.alternate, out.alternate)
  assert.equal(out.candidates.length, 3)
  assert.deepEqual(out.rejected, [])
  assert.equal(pickAction(raw, MYMU, LATER).action?.detector.baseline, null, 'no OS facts, no baseline')
})

test('two plays: the second is demoted and can become the action', () => {
  const out = pickAction({ candidates: [cand({ play: true, title: 'First wildcard swing here' }), cand({ play: true, title: 'Second wildcard swing here' })] }, MYMU, LATER)
  assert.equal(out.alternate?.title, 'First wildcard swing here')
  assert.equal(out.action?.title, 'Second wildcard swing here')
})

test('invalid candidates are dropped with a reason', () => {
  const out = pickAction({ candidates: [
    cand({ job: 'fill_pilots' }), cand({ done_signal: 'pilot_state_advanced' }), cand({ minutes: 0 }), cand({ minutes: 121 }),
  ] }, MYMU, LATER)
  assert.equal(out.candidates.length, 3, 'only three are read')
  assert.equal(out.action, null)
  assert.equal(out.rejected.length, 3)
  assert.match(out.rejected[0].reason, /job/)
  assert.match(out.rejected[1].reason, /done signal/)
  assert.match(out.rejected[2].reason, /minutes/)
  assert.match(pickAction({ candidates: [cand({ minutes: 121 })] }, MYMU, LATER).rejected[0].reason, /minutes/)
  assert.match(pickAction({ candidates: [cand({ minutes: 2.5 })] }, MYMU, LATER).rejected[0].reason, /minutes/)
  assert.match(pickAction({ candidates: [cand({ title: 'Post it' })] }, MYMU, LATER).rejected[0].reason, /12/)
  assert.match(pickAction({ candidates: [cand({ job: 'not_a_job' })] }, MYMU, LATER).rejected[0].reason, /job/)
})

test('all invalid, or nothing parseable, gives no action', () => {
  assert.equal(pickAction({ candidates: [cand({ job: 'keep_edge' })] }, MYMU, LATER).action, null)
  assert.equal(pickAction(null, MYMU, LATER).action, null)
  assert.equal(pickAction('garbage', MYMU, LATER).action, null)
  assert.equal(pickAction({ candidates: [cand({ play: true })] }, MYMU, LATER).action, null, 'a lone play is not an action')
})

test('the copy is cleaned', () => {
  const out = pickAction({ candidates: [cand({ title: `Publish ${EM} the review idea`, why: 'Last post -- 16 March', first_step: 'Open Content - publish it' })] }, MYMU, LATER)
  assert.equal(out.action?.title, 'Publish, the review idea')
  assert.equal(out.action?.why, 'Last post, 16 March')
  assert.equal(out.action?.first_step, 'Open Content, publish it')
})

test('fallbackGrowthAction for each property', () => {
  const r = read(SITE)
  const site = fallbackGrowthAction(SITE, r, os(), TODAY)
  assert.equal(site?.title, 'Send the pilot approach drafted on 14 September')
  assert.equal(site?.why, 'mindmake.co is there to book pilots, and the one drafted approach has sat unsent for 14 days. Visits cannot book a call; you can.')
  assert.deepEqual(site?.detector, { kind: 'pilot_state_advanced', baseline: 1 })
  assert.deepEqual(site?.link, { label: 'Open Advisory', href: '#/people?lane=pilots' })
  assert.deepEqual([site?.minutes, site?.job, site?.writer, site?.rung], [15, 'fill_pilots', 'fallback', 5])
  assert.equal(site?.expires_at, plus(TODAY, 14 * DAY))

  const noDraft = fallbackGrowthAction(SITE, r, os({ pilot: { drafted: 0, oldestDraftedAt: null, maxRank: 0 } }), TODAY)
  assert.equal(noDraft?.title, 'Name one leader who fits the face and ask for the approach to be drafted')
  assert.equal(noDraft?.detector.kind, 'today_slot_done')

  const mymu = fallbackGrowthAction(MYMU, read(MYMU), os(), TODAY)
  assert.equal(mymu?.title, 'Publish one makeyourmindup post this week')
  assert.equal(mymu?.why, 'The last public post was 16 March, 196 days ago, so there is nothing new for anyone to find. One idea is waiting in review: "Same agent, opposite answers".')
  assert.deepEqual(mymu?.detector, { kind: 'substack_new_post', baseline: '2026-03-16T09:00:00Z' })
  assert.deepEqual([mymu?.minutes, mymu?.job, mymu?.link?.href], [90, 'feed_demand', '#/content'])
  assert.equal(fallbackGrowthAction(MYMU, read(MYMU), os({ substackLastPost: null }), TODAY), null, 'unknown last post: not offered')

  assert.equal(fallbackGrowthAction(FULLTIME, read(FULLTIME), os(), TODAY), null, 'unruled')
  const proof = { ...FULLTIME, canon: { status: 'live' as const }, jobs: ['feed_demand' as const] }
  const ft = fallbackGrowthAction(proof, read(proof), os({ rssItems: 0 }), TODAY)
  assert.equal(ft?.title, 'Run the listening test on the latest edition and say go or no go')
  assert.equal(ft?.why, 'The feed has 0 episodes, so directories have nothing to list.')
  assert.deepEqual(ft?.detector, { kind: 'rss_items_up', baseline: 0 })
  assert.ok(!`${ft?.title} ${ft?.why} ${ft?.first_step}`.match(/Full Time|fulltime\.fm/i), 'never names Full Time')
  assert.equal(fallbackGrowthAction(proof, read(proof), os({ rssItems: null }), TODAY), null)

  assert.equal(fallbackGrowthAction(LEGIBILITY, read(LEGIBILITY), os(), TODAY), null, 'unruled')
  const live = { ...LEGIBILITY, canon: { status: 'live' as const }, jobs: ['fill_pilots' as const] }
  const lg = fallbackGrowthAction(live, read(live), os(), TODAY)
  assert.equal(lg?.title, 'Check Stripe card payments are on for legibility.io')
  assert.deepEqual([lg?.minutes, lg?.job, lg?.detector.kind], [10, 'fill_pilots', 'today_slot_done'])
})

// ------------------------------------------------------------------ 13. the model's rules and evidence

test('webActionRules: the jobs, the done signals, and the site-specific lines', () => {
  const site = webActionRules(SITE, allowedDetectors(SITE))
  assert.ok(site.startsWith('YOU ARE CHOOSING ONE ACTION FOR KRISH ON mindmake.co.'))
  assert.ok(site.includes('Find pilot customers (fill_pilots)'))
  for (const k of allowedDetectors(SITE)) assert.ok(site.includes(`${k} (${DONE_HINT[k]})`), k)
  assert.ok(site.includes('Never propose changing the cookie consent on mindmake.co.'))
  assert.ok(!site.includes('must not name Full Time'))
  const mymu = webActionRules(MYMU, allowedDetectors(MYMU))
  assert.ok(mymu.includes('Feed the demand engine (feed_demand)'))
  assert.ok(!mymu.includes('cookie consent'))
  assert.ok(!mymu.includes('must not name Full Time'))
  const ft = webActionRules(FULLTIME, allowedDetectors(FULLTIME))
  assert.ok(ft.includes('Anything public must not name Full Time or fulltime.fm.'))
  assert.ok(!ft.includes('cookie consent'))
  for (const s of [site, mymu, ft, WEB_ACTION_SCHEMA]) assert.ok(!s.includes(EM))
  assert.deepEqual(allowedDetectors(MYMU), ['substack_new_post', 'today_slot_done'])
  assert.deepEqual(allowedDetectors(FULLTIME), ['rss_items_up', 'today_slot_done'])
  assert.deepEqual(allowedDetectors(LEGIBILITY), ['key_events_configured', 'today_slot_done'])
  assert.ok(WEB_ACTION_SCHEMA.includes('Exactly 3 candidates, exactly one with "play": true.'))
})

function evidenceOf(s: string): any {
  assert.ok(s.startsWith('EVIDENCE:\n'))
  const body = s.slice('EVIDENCE:\n'.length).split('\n\n')[0]
  return JSON.parse(body)
}

test('webActionUser parses, carries no email or id, and leaves unknown sources out', () => {
  const r = read(MYMU, { dataRead: { ok: true, status: 200, kind: null, error: null } })
  const h = classifyHealth(r)
  const o = os()
  const s = webActionUser(r, h, buildFindings(r, h, o), o)
  assert.ok(!s.includes('@'))
  assert.ok(!s.includes('123456'), 'no property id')
  const e = evidenceOf(s)
  assert.equal(e.site, 'mindmakerlive.substack.com')
  assert.equal(e.visits.cur.sessions, 30)
  assert.equal(e.series_7d.length, 7)
  assert.equal('posthog' in e, false)
  assert.equal('plausible' in e, false)
  assert.equal(e.os.last_substack_post, '2026-03-16T09:00:00Z')
  assert.equal(e.previous_action, null)

  const unknown = os({ substackLastPost: null, rssItems: null, reviewIdeas: [] })
  const bare = evidenceOf(webActionUser(r, h, [], unknown))
  assert.equal('last_substack_post' in bare.os, false)
  assert.equal('rss_items' in bare.os, false)
  assert.equal('review_ideas' in bare.os, false)

  const failedRead = read(MYMU, { dataRead: failed('permission_denied', 403) })
  const fh = classifyHealth(failedRead)
  const fe = webActionUser(failedRead, fh, buildFindings(failedRead, fh, o), o)
  assert.ok(!fe.includes('@'))
  const fj = evidenceOf(fe)
  assert.equal('visits' in fj, false, 'an unread property has no visits, not zero')
  assert.equal('top_sources' in fj, false)
})

test('webActionUser tells the model when the last action went unacted', () => {
  const issued = '2026-09-20T13:20:00Z'
  const g = growth({ issued_at: issued, expires_at: plus(issued, 14 * DAY) })
  const r = read(MYMU, { previous: { health: 'ok', property_tz: 'UTC', as_of: '2026-10-03', run_at: '2026-10-04T13:20:00Z', action: g, llm: null } })
  const h = classifyHealth(r)
  const s = webActionUser(r, h, [], os())
  assert.match(s, /PREVIOUS ACTION NOT ACTED ON IN 20 DAYS: propose something smaller or different\.$/)
  assert.deepEqual(evidenceOf(s).previous_action, { title: g.title, issued_at: issued, days_open: 20, outcome: 'expired' })
})

test('evidenceHash is stable, hex, and moves with the evidence', () => {
  const r = read(MYMU)
  const h = classifyHealth(r)
  const a = evidenceHash(r, h, os())
  assert.match(a, /^[0-9a-f]{8}$/)
  assert.equal(evidenceHash(read(MYMU), classifyHealth(read(MYMU)), os()), a)
  assert.notEqual(evidenceHash(read(MYMU, tot(31, 28)), classifyHealth(read(MYMU, tot(31, 28))), os()), a)
  assert.notEqual(evidenceHash(r, h, os({ reviewIdeas: ['Something else'] })), a)
  // The previous action's age changes every day and must not force a re-ask.
  const withPrev = read(MYMU, { previous: { health: 'ok', property_tz: 'UTC', as_of: '2026-10-08', run_at: '2026-10-09T13:20:00Z', action: growth(), llm: null } })
  assert.equal(evidenceHash(withPrev, classifyHealth(withPrev), os()), a)
})

// ------------------------------------------------------------------ 14. toView and nextRunAt

function row0(over: Partial<WebInsightRow> = {}): WebInsightRow {
  return {
    property: 'mymu', as_of: '2026-10-09', run_at: '2026-10-10T13:20:00Z', trigger: 'cron', property_id: '1', id_source: 'env',
    property_tz: 'Europe/London', health: 'ok', health_flags: [], health_detail: null, checks: { dataRead: { ok: true } },
    totals: { cur: win(30), prev: win(28) }, series: [{ date: '2026-10-09', sessions: 4 }],
    top: { sources: [{ name: 'google / organic', sessions: 20 }], pages: [], ai: [], channels: [], hosts: [] },
    crosscheck: { posthog: null, plausible: null }, insight: '30 visits this week.', findings: [], fixed: [], action: null, closed: [],
    llm: null, meta: {}, ...over,
  }
}

test('toView with no row: not read yet', () => {
  const v = toView(FULLTIME, null, [])
  assert.equal(v.health, null)
  assert.equal(v.health_line, 'Not checked yet.')
  assert.equal(v.insight, 'Not read yet. The first check runs at 13:20 UTC, or now if you press Check now.')
  assert.deepEqual([v.action, v.wait_line, v.totals, v.series], [null, null, null, null])
  assert.equal(v.label, 'fulltime.fm')
  assert.equal(v.venture, 'full_time')
  assert.equal(v.canon, 'ruling_owed')
})

test('toView shows numbers only for a successful read that is ok, quiet or provisional', () => {
  for (const health of ['ok', 'quiet', 'provisional'] as const) {
    const v = toView(MYMU, row0({ health }), [])
    assert.ok(v.totals, health)
    assert.ok(v.series, health)
  }
  for (const health of ['no_access', 'api_disabled', 'wrong_stream', 'tag_missing', 'never_received'] as const) {
    const v = toView(MYMU, row0({ health }), [])
    assert.equal(v.totals, null, health)
    assert.equal(v.series, null, health)
  }
  assert.equal(toView(MYMU, row0({ health_flags: ['read_failed'] }), []).totals, null)
  assert.equal(toView(MYMU, row0({ checks: { dataRead: { ok: false } } }), []).totals, null)
})

test('toView unions fixed and closed across the window, deduped, newest first, max 5 fixed', () => {
  const fx = (id: string, at: string) => ({ id, line: `line ${id}`, at })
  const older = row0({ run_at: '2026-10-06T13:20:00Z', as_of: '2026-10-05',
    fixed: [fx('a', '2026-10-06T13:20:00Z'), fx('b', '2026-10-06T13:20:00Z'), fx('c', '2026-10-05T13:20:00Z'), fx('d', '2026-10-04T13:20:00Z')],
    closed: [{ title: 'Old', detector: 'substack_new_post', how: 'done', closed_at: '2026-10-06T13:20:00Z' }] })
  const newest = row0({ fixed: [fx('a', '2026-10-10T13:20:00Z'), fx('e', '2026-10-10T13:20:00Z'), fx('f', '2026-10-09T13:20:00Z')],
    closed: [{ title: 'New', detector: 'today_slot_done', how: 'expired', closed_at: '2026-10-10T13:20:00Z' },
      { title: 'Old', detector: 'substack_new_post', how: 'done', closed_at: '2026-10-06T13:20:00Z' }] })
  const other = row0({ property: 'site', fixed: [fx('z', '2026-10-10T13:20:00Z')] })
  const v = toView(MYMU, newest, [newest, older, other])
  assert.equal(v.fixed.length, 5)
  assert.deepEqual(v.fixed.map(f => f.id), ['a', 'e', 'f', 'b', 'c'])
  assert.equal(v.fixed[0].at, '2026-10-10T13:20:00Z', 'the newest copy of a repeated fix')
  assert.deepEqual(v.closed.map(c => c.title), ['New', 'Old'])
})

test('toView: shared actions wait, later and drafted come from the findings, lines from the row', () => {
  const shared = action({ id: 'shared:admin_api', prefix: 'shared', rung: 2, members: ['mymu'] })
  const findings: Finding[] = [
    { id: 'consent_missing', prefix: 'mymu', cls: 'krish', line: 'later line', job: 'keep_honest', detector: { kind: 'consent_default_denied' }, evidence: {} },
    { id: 'plausible_key', prefix: 'mymu', cls: 'krish', line: 'ladder line', job: 'keep_honest', detector: { kind: 'plausible_ok' }, evidence: {}, rung: 3 },
    { id: 'dead_landing', prefix: 'mymu', cls: 'agent', line: 'agent line', job: 'keep_honest', detector: { kind: 'condition_cleared' }, evidence: {}, owner: 'maya', routed: 'unrouted' },
    { id: 'timezone_learned', prefix: 'mymu', cls: 'auto', line: 'auto line', job: 'keep_honest', detector: { kind: 'condition_cleared' }, evidence: {} },
  ]
  const v = toView(MYMU, row0({ health: 'api_disabled', action: shared, findings, health_detail: 'Cannot be checked until one Google setting is on. The Admin API is off.' }), [])
  assert.equal(v.action, null)
  assert.equal(v.wait_line, 'Waiting on the step at the top.')
  assert.deepEqual(v.later, [{ id: 'consent_missing', line: 'later line', job: 'keep_honest' }])
  assert.deepEqual(v.drafted, [{ id: 'dead_landing', line: 'agent line', job: 'keep_honest', routed: 'unrouted' }])
  assert.equal(v.health_line, 'Cannot be checked until one Google setting is on. The Admin API is off.')
  assert.equal(toView(MYMU, row0({ health_detail: 'admin' }), []).health_line, 'Reading fine.', 'a detail code is not a line')

  const own = action({ id: 'mymu:growth:2026-10-10', prefix: 'mymu', rung: 5 })
  assert.equal(toView(MYMU, row0({ action: own }), []).action, own)
  assert.equal(toView(MYMU, row0({ meta: { wait_line: 'Nothing only you can do on mindmakerlive.substack.com this week.' } }), []).wait_line,
    'Nothing only you can do on mindmakerlive.substack.com this week.')
  assert.equal(toView({ ...FULLTIME, canon: { status: 'measure_only' } }, row0({ property: 'fulltime' }), []).wait_line, 'Measure only, by your ruling.')
})

test('toView reads the crosscheck the run stores', () => {
  const r = read(FULLTIME, { posthog: { pageviews7d: 5, users7d: 4, date: '2026-09-27' } })
  const v = toView(FULLTIME, row0({ property: 'fulltime', crosscheck: crosscheckOf(r) as any }), [])
  assert.deepEqual(v.crosscheck, { posthog: { pageviews_7d: 5, users_7d: 4, date: '2026-09-27' }, plausible: null })
  const pl = { ok: true, status: 200, error: null, visits7d: 40, visitsPrev7d: 31, visitors7d: 30, pageviews7d: 60, topSource: null, topPage: null, goals: [] }
  const sv = toView(SITE, row0({ property: 'site', crosscheck: crosscheckOf(read(SITE, { plausible: pl })) as any }), [])
  assert.deepEqual(sv.crosscheck.plausible, { visits_7d: 40, visits_prev_7d: 31, goals: [] })
})

test('nextRunAt: the next 13:20 UTC strictly after now', () => {
  assert.equal(nextRunAt('2026-09-28T13:19:59Z'), '2026-09-28T13:20:00Z')
  assert.equal(nextRunAt('2026-09-28T13:20:00Z'), '2026-09-29T13:20:00Z')
  assert.equal(nextRunAt('2026-09-28T14:02:11Z'), '2026-09-29T13:20:00Z')
  assert.equal(nextRunAt('2026-09-30T23:59:00Z'), '2026-10-01T13:20:00Z')
})

// ------------------------------------------------------------------ the whole card set, and the house copy rules

test('no line the core writes carries an em dash, an ellipsis or an email', () => {
  const reads = [
    read(SITE, { lifetime: 0, probe: probe({ deadPages: [{ path: '/x', status: 404 }], notFound: { status: 404, hasTag: false, title: 'Home' } }) }),
    read(MYMU, { dataRead: failed('permission_denied', 403) }),
    read(FULLTIME, { now: TODAY, probe: probe({ consentDefaultDenied: false }) }),
    read(LEGIBILITY, { admin: admin(LEGIBILITY, { state: 'disabled', streams: null, keyEvents: [] }), lifetime: 0 }),
  ]
  const o = os({ plausibleKeySet: false, substackCountPresent: false })
  for (const r of reads) {
    const h = classifyHealth(r)
    const fs = buildFindings(r, h, o)
    const texts = [insightLine(r, h), healthLine(r, h), ...fs.map(f => f.line)]
    for (const f of fs.filter(f => f.rung)) {
      const a = actionForFinding(f, r, h, o, r.now)
      texts.push(a.title, a.why)
      assert.ok(a.title.length <= 90, a.title)
      assert.ok(a.why.length <= 240, a.why)
      assert.ok(a.first_step.length <= 240, a.first_step)
      assert.ok(a.minutes >= 1 && a.minutes <= 120)
      if (a.hero_line) assert.ok(a.hero_line.length <= 60, a.hero_line)
    }
    for (const s of texts) {
      assert.ok(!s.includes(EM) && !s.includes('\u2026') && !s.includes('...'), s)
      assert.ok(!s.includes('@'), s)
    }
  }
})

// ------------------------------------------------------------------ 15. review fixes (2026-09-27)

test('today_slot_done: a slot ticked off before the action was issued never closes it', () => {
  const done = [
    { text: 'Name one leader who fits the face and ask for the approach to be drafted', at: '2026-10-05T09:00:00Z' },
    { text: 'Something else', at: '2026-10-07T09:00:00Z' },
  ]
  // Monday's completion against Tuesday's reissue of the same title: nothing.
  assert.deepEqual(doneTextsSince(done, '2026-10-06T13:20:00Z'), ['something else'])
  // Against the action it was really for, issued before the tick: it counts.
  assert.deepEqual(doneTextsSince(done, '2026-10-04T13:20:00Z'),
    ['name one leader who fits the face and ask for the approach to be drafted', 'something else'])
  assert.deepEqual(doneTextsSince(done, '2026-10-05T09:00:00Z').length, 1, 'strictly after, not at')
  assert.deepEqual(doneTextsSince(done, null), [], 'no issued_at, nothing closes')
  assert.deepEqual(doneTextsSince([{ text: 'x', at: null }], '2026-10-01T00:00:00Z'), [], 'an unknown completion time never counts')

  // Through the ladder: the reissued fallback is not closed by the old tick.
  const fb = fallbackGrowthAction(SITE, read(SITE), os({ pilot: { drafted: 0, oldestDraftedAt: null, maxRank: 1 } }), '2026-10-06T13:20:00Z') as KrishAction
  const r = read({ ...SITE, plausibleSiteId: null }, { now: '2026-10-07T13:20:00Z', ...tot(3, 1),
    previous: { health: 'quiet', property_tz: 'UTC', as_of: '2026-10-06', run_at: '2026-10-06T13:20:00Z', action: fb, llm: null } })
  const stale = runLadder(r, os(), facts({ todayDoneTexts: doneTextsSince(done, fb.issued_at) }))
  assert.deepEqual(stale.closed, [])
  assert.equal(stale.action, fb)
  const real = runLadder(r, os(), facts({ todayDoneTexts: doneTextsSince([{ text: fb.title, at: '2026-10-07T08:00:00Z' }], fb.issued_at) }))
  assert.equal(real.closed[0]?.how, 'done')
})

test('a failed read carries the previous verdict with its own detail, never the error kind', () => {
  const prevOf = (health: HealthVerdict, detail: string | null, act: KrishAction | null = null) =>
    ({ health, property_tz: 'UTC', as_of: '2026-10-08', run_at: '2026-10-09T13:20:00Z', action: act, llm: null, detail })

  const ws = read(MYMU, { dataRead: failed('quota', 429), previous: prevOf('wrong_stream', 'https://elsewhere.example.org') })
  const wh = classifyHealth(ws)
  assert.deepEqual([wh.health, wh.detail], ['wrong_stream', 'https://elsewhere.example.org'])
  assert.ok(!healthLine(ws, wh).includes('quota'))
  assert.ok(healthLine(ws, wh).includes('https://elsewhere.example.org'))

  const na = read(FULLTIME, { dataRead: failed('network', 0, 'fetch failed'), previous: prevOf('no_access', 'permission_denied') })
  const nh = classifyHealth(na)
  const nf = buildFindings(na, nh, os())
  assert.equal(find(nf, 'no_access')?.evidence.kind, 'permission_denied', 'the verdict kind, so the shared grant keeps this site')
  const fresh = actionForFinding(find(nf, 'no_access') as Finding, na, nh, os(), LATER)
  assert.ok(!fresh.why.includes('fetch failed'), fresh.why)
  assert.match(fresh.why, /on 8 October\. The check since then failed before Google answered/)

  // Shared membership survives the blip: fulltime 403 today, legibility carried from a 403.
  const leg = read(LEGIBILITY, { dataRead: failed('network', 0, 'fetch failed'), previous: prevOf('no_access', 'permission_denied') })
  const m = mergeShared([itemFor(read(FULLTIME, { dataRead: failed('permission_denied', 403) })), itemFor(leg)], null, os(), facts(), LATER)
  assert.equal(m.shared?.id, 'shared:ga_grant')
  assert.deepEqual(m.shared?.members, ['fulltime', 'legibility'])

  // A carried admin verdict still raises the Admin API step, so shared:admin_api holds.
  const ad = read(MYMU, { dataRead: failed('quota', 429), previous: prevOf('api_disabled', 'admin') })
  const ah = classifyHealth(ad)
  assert.ok(ids(buildFindings(ad, ah, os())).includes('admin_api_needed'))

  // The previous per-site action is kept word for word, with its issued_at.
  const kept = action({ id: 'fulltime:no_access', prefix: 'fulltime', why: 'Google refused the read of property 556143202: PERMISSION_DENIED.', issued_at: '2026-10-02T13:20:00Z' })
  const l = runLadder(read(FULLTIME, { dataRead: failed('network', 0, 'fetch failed'), previous: prevOf('no_access', 'permission_denied', kept) }))
  assert.equal(l.action, kept)
})

test('a carried credentials verdict does not quote the blip as the key problem', () => {
  const r = read(FULLTIME, { dataRead: failed('network', 0, 'fetch failed'),
    previous: { health: 'no_access', property_tz: 'UTC', as_of: '2026-10-08', run_at: '2026-10-09T13:20:00Z', action: null, llm: null, detail: 'credentials' } })
  const h = classifyHealth(r)
  const f = find(buildFindings(r, h, os()), 'no_access') as Finding
  assert.ok(!f.line.includes('fetch failed'), f.line)
  assert.ok(!actionForFinding(f, r, h, os(), LATER).why.includes('fetch failed'))
})

test('an unknown lifetime count never makes an unproven property quiet', () => {
  const zero = { totals: { cur: win(0), prev: win(0) } }
  const never = { health: 'never_received' as HealthVerdict, property_tz: 'UTC', as_of: '2026-10-08', run_at: '2026-10-09T13:20:00Z', action: null, llm: null, detail: '' }
  const r = read(LEGIBILITY, { ...zero, lifetime: null, previous: never })
  const h = classifyHealth(r)
  assert.equal(h.health, 'never_received')
  assert.ok(h.flags.includes('read_failed'))
  assert.ok(!/No visits|\b0 visits/.test(insightLine(r, h)), insightLine(r, h))
  assert.match(insightLine(r, h), /all-time count could not be read/)
  assert.equal(find(buildFindings(r, h, os()), 'recovered'), undefined)
  // No previous row at all: provisional with read_failed, still no zero.
  const first = classifyHealth(read(LEGIBILITY, { ...zero, lifetime: null }))
  assert.deepEqual([first.health, first.flags.includes('read_failed')], ['provisional', true])
  // Proven earlier (quiet), a zero week is a real zero.
  const quietPrev = { ...never, health: 'quiet' as HealthVerdict }
  assert.equal(classifyHealth(read(LEGIBILITY, { ...zero, lifetime: null, previous: quietPrev })).health, 'quiet')
  // Sessions this week prove data arrives, whatever the lifetime read did.
  assert.equal(classifyHealth(read(LEGIBILITY, { ...tot(3, 0), lifetime: null, previous: never })).health, 'quiet')
})

test('timezone_learned only for a zone Google stated', () => {
  const failedRead = read(FULLTIME, { dataRead: failed('permission_denied', 403), meta: null, tz: 'UTC', tzSource: 'default',
    admin: admin(FULLTIME, { state: 'disabled', timeZone: null, streams: null }) })
  assert.equal(find(buildFindings(failedRead, classifyHealth(failedRead), os()), 'timezone_learned'), undefined)
  const carried = read(MYMU, { tz: 'Europe/London', tzSource: 'previous' })
  assert.equal(find(buildFindings(carried, classifyHealth(carried), os()), 'timezone_learned'), undefined)
  const report = read(MYMU, { tz: 'Europe/London', tzSource: 'report' })
  assert.ok(find(buildFindings(report, classifyHealth(report), os()), 'timezone_learned'))
})

test('a failed read keeps an open growth action instead of dropping it', () => {
  const issued = '2026-10-07T13:20:00Z'
  const g = growth({ issued_at: issued, expires_at: plus(issued, 14 * DAY), detector: { kind: 'substack_new_post', baseline: '2026-03-16T09:00:00Z' } })
  const prev = { health: 'ok' as HealthVerdict, property_tz: 'UTC', as_of: '2026-10-08', run_at: '2026-10-09T13:20:00Z', action: g,
    llm: { evidence_hash: 'h1', attempted_at: issued, writer: 'claude' } }
  const l = runLadder(read(MYMU, { dataRead: failed('quota', 429), previous: prev }))
  assert.equal(l.action, g)
  assert.equal(l.needsLlm, false)
  assert.equal(l.waitLine, null)
})

test('the Data API link prefers the activationUrl Google sent', () => {
  const url = 'https://console.developers.google.com/apis/api/analyticsdata.googleapis.com/overview?project=42'
  const r = read(MYMU, { dataRead: { ok: false, status: 403, kind: 'service_disabled', error: 'x', activationUrl: url } })
  const h = classifyHealth(r)
  const f = find(buildFindings(r, h, os()), 'data_api_off') as Finding
  assert.equal(actionForFinding(f, r, h, os(), LATER).link?.href, url)
  const noUrl = read(MYMU, { dataRead: { ok: false, status: 403, kind: 'service_disabled', error: 'x' } })
  assert.match(actionForFinding(f, noUrl, classifyHealth(noUrl), os(), LATER).link?.href ?? '', /analyticsdata\.googleapis\.com\?project=cc-analytics$/)
})

test('webActionUser reports a previous action its detector just closed as done', () => {
  const g = growth()
  const r = read(MYMU, { previous: { health: 'ok', property_tz: 'UTC', as_of: '2026-10-08', run_at: '2026-10-09T13:20:00Z', action: g, llm: null } })
  const h = classifyHealth(r)
  const closed = [{ title: g.title, detector: 'substack_new_post' as DetectorKind, how: 'done' as const, closed_at: LATER }]
  assert.equal(evidenceOf(webActionUser(r, h, [], os(), closed)).previous_action.outcome, 'done')
  assert.equal(evidenceOf(webActionUser(r, h, [], os())).previous_action.outcome, null)
})

test('landing paths: only plain URL paths are probed or quoted', () => {
  assert.equal(isPlainLandingPath('/'), true)
  assert.equal(isPlainLandingPath('/p/why-ai-pilots-stall'), true)
  assert.equal(isPlainLandingPath('/a%20b/c.html'), true)
  assert.equal(isPlainLandingPath('//evil.example.org/x'), false)
  assert.equal(isPlainLandingPath('/<script>'), false)
  assert.equal(isPlainLandingPath('/ignore previous instructions'), false)
  assert.equal(isPlainLandingPath(`/${'a'.repeat(200)}`), false)
  assert.equal(isPlainLandingPath('relative'), false)
  const r = read(MYMU, { probe: probe({ deadPages: [{ path: '/gone', status: 404 }, { path: '/<b>made up</b>', status: 404 }] }) })
  const dead = find(buildFindings(r, classifyHealth(r), os()), 'dead_landing')
  assert.equal(dead?.line, '1 page people land on returns not found: /gone.')
})

test('cutAtSentence never cuts a word in half', () => {
  assert.equal(cutAtSentence('Short.', 240), 'Short.')
  assert.equal(cutAtSentence('One sentence here. Another sentence that runs long.', 30), 'One sentence here.')
  const cut = cutAtSentence('alpha beta gamma delta epsilon', 14)
  assert.equal(cut, 'alpha beta.')
  assert.ok(cut.length <= 14)
})

// ------------------------------------------------------------------ answering a ruling from the dashboard
//
// The rung-4 ruling used to close only when a PR changed the registry, so the
// card asked for a reply in chat that nothing could answer. An answer stored in
// system_config is applied by withCanonRuling before the check reads the site;
// these show the detector reading it, both firing and not firing.

const ANSWERED_AT = '2026-10-04T12:00:00Z'
const canonAction = (prefix: 'fulltime' | 'legibility') => action({
  id: `${prefix}:canon_ruling`, prefix, rung: 4, kind: 'ruling',
  title: prefix === 'fulltime' ? 'Decide what fulltime.fm is for' : 'Decide whether legibility.io is live',
  detector: { kind: 'canon_ruled' }, minutes: 2, issued_at: '2026-09-28T13:20:00Z',
})
const prevWith = (a: KrishAction) => ({ health: 'quiet' as HealthVerdict, property_tz: 'UTC', as_of: '2026-10-09', run_at: '2026-10-09T13:20:00Z', action: a, llm: null })

test('parseCanonRuling: only an answer the site accepts, stored whole', () => {
  assert.deepEqual(parseCanonRuling(FULLTIME, JSON.stringify({ choice: 'park', at: ANSWERED_AT })), { choice: 'park', job: null, at: ANSWERED_AT })
  assert.deepEqual(parseCanonRuling(FULLTIME, { choice: 'proof', at: ANSWERED_AT, job: 'keep_edge' }), { choice: 'proof', job: 'keep_edge', at: ANSWERED_AT })
  assert.equal(parseCanonRuling(FULLTIME, JSON.stringify({ choice: 'retire', at: ANSWERED_AT })), null, 'retire is a legibility answer')
  assert.equal(parseCanonRuling(FULLTIME, JSON.stringify({ choice: 'park' })), null, 'no time, no ruling')
  assert.equal(parseCanonRuling(FULLTIME, '{not json'), null)
  assert.equal(parseCanonRuling(FULLTIME, null), null)
  assert.equal(parseCanonRuling(LEGIBILITY, JSON.stringify({ choice: 'live', at: ANSWERED_AT })), null, 'live needs the job it serves')
  assert.deepEqual(parseCanonRuling(LEGIBILITY, JSON.stringify({ choice: 'live', job: 'fill_pilots', at: ANSWERED_AT })), { choice: 'live', job: 'fill_pilots', at: ANSWERED_AT })
  assert.equal(parseCanonRuling(LEGIBILITY, JSON.stringify({ choice: 'live', job: 'sell_more', at: ANSWERED_AT })), null, 'an unknown job is no job')
  assert.equal(parseCanonRuling(MYMU, JSON.stringify({ choice: 'measure', at: ANSWERED_AT })), null, 'a live site owes no ruling')
  assert.equal(canonRulingKey('fulltime'), 'web_canon_ruling_fulltime')
})

test('withCanonRuling: what each answer makes of the site, and code still wins', () => {
  const at = ANSWERED_AT
  assert.deepEqual(withCanonRuling(FULLTIME, { choice: 'measure', job: null, at }).canon, { status: 'measure_only' })
  assert.deepEqual(withCanonRuling(FULLTIME, { choice: 'park', job: null, at }).canon, { status: 'retired' })
  const proof = withCanonRuling(FULLTIME, { choice: 'proof', job: null, at })
  assert.deepEqual([proof.canon, proof.jobs], [{ status: 'live' }, ['feed_demand']])
  const live = withCanonRuling(LEGIBILITY, { choice: 'live', job: 'fill_pilots', at })
  assert.deepEqual([live.canon, live.jobs], [{ status: 'live' }, ['fill_pilots']])
  assert.deepEqual(withCanonRuling(LEGIBILITY, { choice: 'retire', job: null, at }).canon, { status: 'retired' })
  assert.equal(withCanonRuling(FULLTIME, null), FULLTIME)
  // A PR that has already written the canon into the registry is not overridden.
  const merged: WebProperty = { ...FULLTIME, canon: { status: 'live' }, jobs: ['feed_demand'] }
  assert.equal(withCanonRuling(merged, { choice: 'park', job: null, at }), merged)
  assert.deepEqual(canonChoices(FULLTIME), ['proof', 'measure', 'park'])
  assert.deepEqual(canonChoices(MYMU), [])
})

test('canonRuledFor is the one rule: false while owed, true once answered or ruled', () => {
  const o = os()
  assert.equal(canonRuledFor(FULLTIME, o), false)
  assert.equal(canonRuledFor(withCanonRuling(FULLTIME, { choice: 'measure', job: null, at: ANSWERED_AT }), o), true)
  assert.equal(canonRuledFor(LEGIBILITY, o), false)
  assert.equal(canonRuledFor(LEGIBILITY, os({ ventureActive: { legibility: true } })), true, 'an active venture still rules legibility')
  assert.equal(canonRuledFor(MYMU, o), true)
  // And the finding agrees with the fact, both ways.
  assert.ok(find(findingsFor(read(FULLTIME)), 'canon_ruling'))
  assert.equal(find(findingsFor(read(withCanonRuling(FULLTIME, { choice: 'park', job: null, at: ANSWERED_AT }))), 'canon_ruling'), undefined)
})

test('the canon_ruled detector reads a stored answer, and does not fire without one', () => {
  const a = canonAction('fulltime')
  const unanswered = facts({ canonRuled: { fulltime: canonRuledFor(FULLTIME, os()) } })
  assert.equal(detectorFired(a, unanswered), false)
  const ruled = withCanonRuling(FULLTIME, parseCanonRuling(FULLTIME, JSON.stringify({ choice: 'measure', at: ANSWERED_AT })))
  const answered = facts({ canonRuled: { fulltime: canonRuledFor(ruled, os()) } })
  assert.equal(detectorFired(a, answered), true)
})

test('an answered ruling closes the action on the next run and the site moves on', () => {
  const measure = withCanonRuling(FULLTIME, { choice: 'measure', job: null, at: ANSWERED_AT })
  const m = runLadder(read(measure, { ...tot(3, 0), previous: prevWith(canonAction('fulltime')) }), os(),
    facts({ canonRuled: { fulltime: canonRuledFor(measure, os()) } }))
  assert.deepEqual(m.closed, [{ title: 'Decide what fulltime.fm is for', detector: 'canon_ruled', how: 'done', closed_at: LATER }])
  assert.equal(m.action, null)
  assert.equal(m.waitLine, 'Measure only, by your ruling.')

  const park = withCanonRuling(FULLTIME, { choice: 'park', job: null, at: ANSWERED_AT })
  assert.equal(runLadder(read(park, { ...tot(3, 0), previous: prevWith(canonAction('fulltime')) }), os(),
    facts({ canonRuled: { fulltime: true } })).waitLine, 'Retired by your ruling. Only visits are read.')

  // Proof makes it live with a job, so the next thing is a growth action (rung 5).
  const proof = withCanonRuling(FULLTIME, { choice: 'proof', job: null, at: ANSWERED_AT })
  const p = runLadder(read(proof, { ...tot(3, 0), previous: prevWith(canonAction('fulltime')) }), os(), facts({ canonRuled: { fulltime: true } }))
  assert.equal(p.closed.length, 1)
  assert.equal(p.action, null)
  assert.equal(p.needsLlm, true)
  assert.equal(fallbackGrowthAction(proof, read(proof), os(), LATER)?.job, 'feed_demand')

  // Without the answer the same run keeps asking, with the same action.
  const still = runLadder(read(FULLTIME, { ...tot(3, 0), previous: prevWith(canonAction('fulltime')) }), os(), facts({ canonRuled: { fulltime: false } }))
  assert.deepEqual(still.closed, [])
  assert.equal(still.action?.id, 'fulltime:canon_ruling')
  assert.equal(still.action?.issued_at, '2026-09-28T13:20:00Z')
})

test('toView closes an answered ruling at once, before the next run', () => {
  const stored = canonAction('fulltime')
  const newest = row0({ property: 'fulltime', health: 'quiet', action: stored, meta: { wait_line: null } })
  const measure = withCanonRuling(FULLTIME, { choice: 'measure', job: null, at: ANSWERED_AT })
  const v = toView(measure, newest, [], ANSWERED_AT)
  assert.equal(v.action, null)
  assert.equal(v.canon, 'measure_only')
  assert.equal(v.wait_line, 'Measure only, by your ruling.')
  assert.deepEqual(v.closed[0], { title: 'Decide what fulltime.fm is for', detector: 'canon_ruled', how: 'done', closed_at: ANSWERED_AT })
  const proof = toView(withCanonRuling(FULLTIME, { choice: 'proof', job: null, at: ANSWERED_AT }), newest, [], ANSWERED_AT)
  assert.equal(proof.action, null)
  assert.equal(proof.wait_line, 'Answered. The next check picks what to do next on fulltime.fm.')
  // Unanswered, the stored action stays on the card.
  const open = toView(FULLTIME, newest, [])
  assert.equal(open.action, stored)
  assert.equal(open.closed.length, 0)
})
