import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  latestWeek, splitReviews, degradedReview, reviewHeadline, reviewMoves, parseMeasuredLine, degradedSummary,
  oldUnruled, isClearedReview, siteChoices, nextMoves, productSignals, weekLoop, citedInstead, missedQuestions,
  growthSlugOf, normaliseTaskText,
} from '../../src/lib/growthModel.ts'
import { growthWeekOf, reviewWeekFor, clipWeekFor, mondayOfUtc, addDaysIso, citationRate, recentProbes, GEO_WINDOW_DAYS } from '../../src/lib/growth.ts'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalVentureSlug, ventureLabel } from '../../src/lib/ventureOptions.ts'
import { normaliseSeoRows, newestCheck, toNumberOrNull, CLEARED_OLD_WEEK, type SeoRankRow } from '../../src/lib/growthWire.ts'

// The Growth read model. Fixtures are SYNTHETIC but shaped on the live tables
// as measured on 2026-10-04 (the repo is public): three degraded weeks on top,
// real reviews in August, four site actions, seven planned accounts with no
// handle, and Getwaitlist booked against Pulse but not connected.

const EM = '—'

/** Sunday 4 October, before the 17:00 UTC review run. */
const SUN_NOON = new Date('2026-10-04T12:00:00Z')
/** The minute the review run lands. */
const SUN_EVE = new Date('2026-10-04T17:00:00Z')
const SUN_JUST_BEFORE = new Date('2026-10-04T16:59:59Z')
const WED = new Date('2026-10-07T09:00:00Z')
const SAT = new Date('2026-10-03T10:00:00Z')

// ------------------------------------------------------------------ weeks

test('growthWeekOf turns over when Sunday\'s review lands, 17:00 UTC, not at midnight', () => {
  assert.equal(growthWeekOf(SUN_NOON), '2026-09-28')
  assert.equal(growthWeekOf(SUN_JUST_BEFORE), '2026-09-28')
  assert.equal(growthWeekOf(SUN_EVE), '2026-10-05')
  assert.equal(growthWeekOf(new Date('2026-10-05T00:00:00Z')), '2026-10-05')
  assert.equal(growthWeekOf(WED), '2026-10-05')
  assert.equal(growthWeekOf(SAT), '2026-09-28')
  assert.equal(reviewWeekFor(SUN_NOON), '2026-09-21', 'before the run, the newest review is the one written 27 September')
  assert.equal(reviewWeekFor(SUN_EVE), '2026-09-28')
  assert.equal(reviewWeekFor(WED), '2026-09-28')
  assert.equal(addDaysIso('2026-09-28', 7), '2026-10-05')
})

test('clipWeekFor: a clip made from Sunday night\'s review files into the coming week (the mondayOf bug)', () => {
  // The bug: on that Sunday the Monday that owns the day is the week ending tonight.
  assert.equal(mondayOfUtc(SUN_EVE), '2026-09-28')
  assert.equal(clipWeekFor('2026-09-28', SUN_EVE), '2026-10-05')
  assert.equal(clipWeekFor('2026-09-28', new Date('2026-10-04T21:30:00Z')), '2026-10-05')
  assert.equal(clipWeekFor('2026-09-28', WED), '2026-10-05', 'midweek it is still the coming week')
  // An old review never files a clip into a week already gone.
  assert.equal(clipWeekFor('2026-09-21', new Date('2026-10-12T10:00:00Z')), '2026-10-12')
  // A review written early (a manual Saturday run) still files into the week after it.
  assert.equal(clipWeekFor('2026-09-28', SAT), '2026-10-05')
  // No review, or a bad one, is the loop's own week.
  assert.equal(clipWeekFor(null, SUN_NOON), '2026-09-28')
  assert.equal(clipWeekFor('not a date', SUN_EVE), '2026-10-05')
})

// ------------------------------------------------------------------ reviews

const MEASURED_CIRCLE = 'landed 4 this week (live, last event 1d ago) | signups 0 this week | GEO 0/99 cited | AEO 3 recommendations, gap linkedin.com | customers table: paid 0, MRR $0, churned 8 | touchpoints 7 (unaddressed 3, retired 1, covered 2, in_progress 1)'
const MEASURED_FT = 'traffic unknown (no emitter) | signups unknown this week | GEO 0/88 cited | AEO 3 recommendations, gap podcasts.apple.com | customers table: paid 0, MRR $0, churned 0 | touchpoints 5 (unaddressed 3, in_progress 2)'
const MEASURED_CTRL = 'landed 0 this week (stale, last event 22d ago) | signups 0 this week | GEO 0/100 cited | AEO 3 recommendations, gap linkedin.com | customers table: paid 2, MRR $13.51, churned 4 | touchpoints 7 (unaddressed 4, in_progress 2, retired 1)'

function review(week: string, product: string, over: Record<string, unknown> = {}): any {
  return {
    id: `rv-${week}-${product}`, week_start: week, product_slug: product,
    findings: { headline: `${product} headline for ${week}.`, traffic: 'Real finding.', measured: MEASURED_CTRL },
    kill_list: [], double_down: [], krish_decision: null, decided_at: null, created_at: `${addDaysIso(week, 6)}T17:00:30Z`, ...over,
  }
}
function degraded(week: string, product: string, measured = MEASURED_CIRCLE): any {
  return review(week, product, {
    findings: {
      headline: `Evidence-only review: ${measured}`,
      degraded: `evidence-only ${EM} the writing pass was unavailable, so no kill or double-down calls were made`,
      measured,
      unknown_3: 'something unknown',
    },
  })
}
const PRODUCTS5 = ['ctrl', 'circle', 'pulse', 'full-time', 'mindmake']
const AUG_MOVES = ['Ship the landing page', 'Write the comparison post', 'Pitch two partners', 'Post the teardown']
const LIVE_REVIEWS = [
  ...['2026-09-21', '2026-09-14', '2026-09-07'].flatMap(w => PRODUCTS5.map(p => degraded(w, p))),
  ...['2026-08-31', '2026-08-24'].flatMap(w => PRODUCTS5.map(p => review(w, p, { double_down: AUG_MOVES }))),
]

test('latestWeek and splitReviews: one per product for the newest week, the rest is history', () => {
  assert.equal(latestWeek(LIVE_REVIEWS), '2026-09-21')
  assert.equal(latestWeek([]), null)
  const s = splitReviews([...LIVE_REVIEWS].reverse())
  assert.equal(s.latest, '2026-09-21')
  // Priority order (src/lib/portfolio.ts, Krish 2026-10-05): ranked first, then the unranked two.
  assert.deepEqual(s.thisWeek.map(r => r.product_slug), ['full-time', 'ctrl', 'pulse', 'mindmake', 'circle'], 'house product order')
  assert.equal(s.older.length, 20)
  assert.equal(s.older[0].week_start, '2026-09-14', 'newest older week first')
  assert.equal(s.older[s.older.length - 1].week_start, '2026-08-24')
  // A duplicate row for the same product and week keeps the newer one.
  const dup = review('2026-09-21', 'ctrl', { id: 'rv-dup', created_at: '2026-09-27T18:00:00Z' })
  const d = splitReviews([...LIVE_REVIEWS, dup])
  assert.equal(d.thisWeek.find(r => r.product_slug === 'ctrl')?.id, 'rv-dup')
  assert.ok(d.older.some(r => r.id === 'rv-2026-09-21-ctrl'))
  assert.deepEqual(splitReviews([]), { latest: null, thisWeek: [], older: [] })
})

test('degradedReview flags the numbers-only rows and never hands the data line out as a sentence', () => {
  const bad = degraded('2026-09-21', 'circle')
  assert.equal(degradedReview(bad), true)
  assert.equal(reviewHeadline(bad), null)
  assert.deepEqual(reviewMoves({ ...bad, double_down: ['should never show'] }), [])
  // A row from before the marker existed is caught by the headline alone.
  assert.equal(degradedReview(review('2026-09-21', 'ctrl', { findings: { headline: 'Evidence-only review: landed 0 this week' } })), true)
  const good = review('2026-08-31', 'ctrl', { double_down: AUG_MOVES })
  assert.equal(degradedReview(good), false)
  assert.equal(reviewHeadline(good), 'ctrl headline for 2026-08-31.')
  assert.deepEqual(reviewMoves(good), AUG_MOVES)
  assert.equal(degradedReview({ findings: null } as any), false)
})

test('parseMeasuredLine turns the pipe-separated line into labelled numbers and drops the unknowns', () => {
  assert.deepEqual(parseMeasuredLine(MEASURED_CIRCLE), [
    { key: 'visits', label: 'Visits this week', value: '4' },
    { key: 'signups', label: 'Sign-ups this week', value: '0' },
    { key: 'ai_answers', label: 'AI answers that name you', value: '0 of 99' },
    { key: 'article_ideas', label: 'Article ideas', value: '3' },
    { key: 'cited_instead', label: 'Cited instead of you', value: 'linkedin.com' },
    { key: 'paying', label: 'Paying customers', value: '0' },
    { key: 'mrr', label: 'MRR', value: '$0' },
    { key: 'churned', label: 'Churned', value: '8' },
    { key: 'places_covered', label: 'Places covered', value: '2 of 7' },
  ])
  const ft = parseMeasuredLine(MEASURED_FT)
  assert.equal(ft.find(p => p.key === 'visits'), undefined, 'traffic unknown is hidden, never a zero')
  assert.equal(ft.find(p => p.key === 'signups'), undefined)
  assert.equal(ft.find(p => p.key === 'places_covered')?.value, '0 of 5')
  assert.equal(parseMeasuredLine(MEASURED_CTRL).find(p => p.key === 'mrr')?.value, '$13.51')
  const web = parseMeasuredLine('web 3 visits in the 7 days to 2026-10-03 (Google Analytics on fulltime.fm) | GEO unknown (0 probes in 30d) | AEO unknown (no digest this week)')
  assert.deepEqual(web, [{ key: 'visits', label: 'Site visits in 7 days', value: '3' }])
  assert.deepEqual(parseMeasuredLine(`Evidence-only review: ${MEASURED_CIRCLE}`)[0], { key: 'visits', label: 'Visits this week', value: '4' })
  assert.deepEqual(parseMeasuredLine('nothing | here'), [])
  assert.deepEqual(parseMeasuredLine(null), [])
})

test('degradedSummary: one readable line, or null so the UI hides it', () => {
  const s = degradedSummary(degraded('2026-09-21', 'circle'))
  assert.equal(s.line, 'Visits this week: 4 · Sign-ups this week: 0 · AI answers that name you: 0 of 99 · Article ideas: 3 · Cited instead of you: linkedin.com · Paying customers: 0 · MRR: $0 · Churned: 8 · Places covered: 2 of 7')
  assert.ok(!s.line!.includes('|'))
  assert.ok(!s.line!.includes(EM))
  assert.equal(degradedSummary(review('2026-09-21', 'x', { findings: { headline: 'Evidence-only review: odd | stuff', degraded: 'yes' } })).line, null)
})

test('oldUnruled is exactly what clear_old clears: unruled, older than the newest week', () => {
  const ruled = review('2026-08-24', 'ctrl', { id: 'ruled', krish_decision: 'Stop SEO.', double_down: AUG_MOVES })
  const rows = [...LIVE_REVIEWS.filter(r => r.id !== 'rv-2026-08-24-ctrl'), ruled]
  const old = oldUnruled(rows)
  assert.equal(old.length, 19)
  assert.ok(old.every(r => r.week_start < '2026-09-21' && !r.krish_decision))
  assert.ok(!old.some(r => r.id === 'ruled'))
  assert.deepEqual(oldUnruled([]), [])
  assert.equal(isClearedReview({ krish_decision: CLEARED_OLD_WEEK } as any), true)
  assert.equal(isClearedReview({ krish_decision: 'Stop SEO.' } as any), false)
  assert.equal(CLEARED_OLD_WEEK, 'Cleared: an older week')
})

// ------------------------------------------------------------------ next moves

const FT_FIRST_STEP = 'Reply in chat with one word: proof (it feeds demand for the pilot), measure (keep reading visits, no actions) or park (take the tag off). Merging the PR that follows closes this.'
const LEG_FIRST_STEP = 'Reply in chat with live and the job it serves, measure, or retire. Merging the PR that follows closes this.'

function act(over: Record<string, unknown>): any {
  return {
    id: 'x', prefix: 'site', rung: 5, kind: 'growth', title: 't', why: 'w', first_step: 'f', job: 'fill_pilots', minutes: 10,
    link: null, detector: { kind: 'today_slot_done' }, issued_at: '2026-10-02T13:20:00Z', expires_at: null, members: [],
    hero_line: null, alternate: null, writer: 'ladder', ...over,
  }
}
function view(prefix: string, venture: string, over: Record<string, unknown> = {}): any {
  return {
    prefix, label: `${prefix}.example`, venture, goal: 'g', canon: 'live', as_of: '2026-10-03', run_at: '2026-10-04T01:01:00Z',
    health: 'quiet', flags: [], health_line: 'Reading fine. Very few visits.', property_tz: 'UTC', id_source: 'env',
    totals: null, series: null, top: { sources: [], pages: [], ai: [], channels: [] }, crosscheck: { posthog: null, plausible: null },
    insight: 'i', fixed: [], closed: [], action: null, wait_line: null, later: [], drafted: [], ...over,
  }
}
const win = (sessions: number) => ({ sessions, users: sessions, newUsers: sessions, engagedSessions: 0, pageviews: sessions, keyEvents: 0, eventCount: sessions })
const WEB = {
  shared_action: null,
  properties: [
    view('site', 'mindmake', {
      totals: { cur: win(0), prev: win(3) },
      action: act({ id: 'site:growth:2026-10-04', prefix: 'site', title: 'Move the one drafted approach from the list to sent', minutes: 20,
        link: { label: 'Open Advisory', href: '#/people?lane=pilots' }, expires_at: '2026-10-18T01:01:00Z' }),
    }),
    view('mymu', 'publication', {
      totals: { cur: win(0), prev: win(3) },
      action: act({ id: 'mymu:growth:2026-10-02', prefix: 'mymu', title: 'Publish this week\'s post to break the six and a half month silence since March 16',
        minutes: 90, link: { label: 'Open Content', href: '#/content' }, job: 'feed_demand' }),
    }),
    // Ruled 2026-10-06 (ready for pilot users), so fulltime.fm carries a
    // growth step, not a ruling.
    view('fulltime', 'full_time', {
      canon: 'live', totals: { cur: win(3), prev: win(0) },
      action: act({ id: 'fulltime:growth:2026-10-06', prefix: 'fulltime', title: 'Ask five football fans you know to be pilot listeners',
        minutes: 20, job: 'fill_pilots' }),
    }),
    view('legibility', 'legibility', {
      canon: 'ruling_owed', totals: null,
      action: act({ id: 'legibility:canon_ruling', prefix: 'legibility', rung: 4, kind: 'ruling', title: 'Decide whether legibility.io is live',
        minutes: 2, first_step: LEG_FIRST_STEP, detector: { kind: 'canon_ruled' } }),
    }),
  ],
}
const account = (product: string, platform: string, status = 'planned', handle: string | null = null): any =>
  ({ id: `acct-${product}-${platform}`, product_slug: product, platform, handle, profile_url: null, status, notes: null })
const ACCOUNTS = [
  account('circle', 'substack'), account('full-time', 'instagram'), account('full-time', 'tiktok'), account('full-time', 'x'),
  account('mindmake', 'linkedin', 'live', 'krish-raja'), account('mindmake', 'substack', 'live', null),
  account('publication', 'instagram'), account('publication', 'tiktok'), account('publication', 'youtube'),
]
const tp = (product: string, channel: string, score: number, coverage = 'unaddressed', flag: string | null = null): any => ({
  id: `tp-${product}-${channel}-${score}-${coverage}`, product_slug: product, channel, cost_efficiency_score: score, coverage_status: coverage,
  icp_trigger: 't', watering_hole: 'w', owner_agent: 'cleo', rationale: null, evidence: null, assumption_flag: flag,
  created_at: '2026-08-05T00:00:00Z', updated_at: '2026-08-05T00:00:00Z',
})
const TOUCHPOINTS = [
  tp('full-time', 'social_organic', 9, 'unaddressed', 'Gated on live ingest and on Krish creating the brand accounts'),
  tp('full-time', 'product', 9, 'unaddressed', 'Gated: needs 7 consecutive real daily drops first'),
  tp('circle', 'substack', 8, 'unaddressed', 'Krish to stand up the Substack'),
  tp('circle', 'social_organic', 3, 'retired'),
  tp('ctrl', 'social_organic', 7),
  tp('mindmake', 'substack', 9, 'covered'),
  tp('mindmake', 'geo', 8, 'in_progress'),
]
const INTEGRATIONS = [
  { tool: 'Getwaitlist', status: 'pending', lanes: ['fractionl_pulse'], monthly_usd: '15' },
  { tool: 'Affonso', status: 'gated', lanes: ['mm_ctrl'], monthly_usd: '19' },
  { tool: 'Discord', status: 'pending', lanes: ['fractionl_circle'], monthly_usd: '0' },
]
const LIVE_INPUT = { reviews: LIVE_REVIEWS, web: WEB, accounts: ACCOUNTS, touchpoints: TOUCHPOINTS, cards: [], integrations: INTEGRATIONS, todayTexts: [] }

test('nextMoves on the live shape: quick choices, short site step, long site step, accounts, clips, then the spend call', () => {
  const ids = nextMoves(LIVE_INPUT, SUN_NOON).map(m => m.id)
  assert.deepEqual(ids, [
    'site:legibility:canon_ruling',
    'site:fulltime:growth:2026-10-06',
    'site:site:growth:2026-10-04',
    'site:mymu:growth:2026-10-02',
    'account:full-time:instagram',
    'account:full-time:tiktok',
    'account:full-time:x',
    'account:circle:substack',
    'account:publication:instagram',
    'account:publication:tiktok',
    'account:publication:youtube',
    'clip:pick:2026-09-28',
    'spend:getwaitlist',
  ])
})

test('nextMoves never offers an old week: the August moves stay history and the degraded week offers nothing', () => {
  const moves = nextMoves(LIVE_INPUT, SUN_NOON)
  assert.equal(moves.filter(m => m.source === 'review').length, 0)
  assert.ok(!moves.some(m => AUG_MOVES.includes(m.title)))
  // Even if the August week were the newest data, it is not this week's review.
  const augOnly = nextMoves({ ...LIVE_INPUT, reviews: LIVE_REVIEWS.filter(r => r.week_start < '2026-09-01') }, SUN_NOON)
  assert.equal(augOnly.filter(m => m.source === 'review').length, 0)
})

test('the quick choices carry their chips, worded from the action\'s own first step', () => {
  const [leg] = nextMoves(LIVE_INPUT, SUN_NOON)
  assert.equal(leg.primary.kind, 'answer')
  assert.equal(leg.secondary?.kind, 'today')
  assert.equal(leg.property, 'legibility')
  assert.equal(leg.minutes, 2)
  assert.deepEqual(leg.choices, [
    { value: 'live', label: 'Live', hint: null, needsJob: true },
    { value: 'measure', label: 'Measure', hint: null, needsJob: false },
    { value: 'retire', label: 'Retire', hint: null, needsJob: false },
  ])
  assert.equal(leg.product, 'legibility')
  assert.deepEqual(siteChoices('site', 'anything'), [], 'a live site owes no ruling')
  // Ruling (Krish, 2026-10-06): fulltime.fm is ready for pilot users, so its
  // old question offers no chips even if a stale action still words them.
  assert.deepEqual(siteChoices('fulltime', FT_FIRST_STEP), [], 'fulltime.fm was ruled on 2026-10-06')
  // A ruling the view says is already answered is not a quick choice any more.
  const answered = { ...WEB, properties: WEB.properties.map(v => (v.prefix === 'legibility' ? { ...v, canon: 'measure_only' } : v)) }
  const m = nextMoves({ ...LIVE_INPUT, web: answered }, SUN_NOON).find(x => x.id === 'site:legibility:canon_ruling')
  assert.equal(m?.choices, undefined)
})

test('site steps keep their own words, minutes and link', () => {
  const m = nextMoves(LIVE_INPUT, SUN_NOON)
  const site = m.find(x => x.id === 'site:site:growth:2026-10-04')!
  assert.equal(site.minutes, 20)
  assert.equal(site.product, 'mindmake')
  assert.deepEqual(site.primary, { kind: 'today', label: 'Put on today' })
  assert.deepEqual(site.secondary, { kind: 'open', label: 'Open Advisory' })
  assert.deepEqual(site.link, { label: 'Open Advisory', href: '#/people?lane=pilots' })
  assert.equal(m.find(x => x.id === 'site:mymu:growth:2026-10-02')?.product, 'publication')
  // An expired growth step is gone.
  const expired = { ...WEB, properties: WEB.properties.map(v => (v.prefix === 'site' ? { ...v, action: { ...v.action, expires_at: '2026-10-04T11:00:00Z' } } : v)) }
  assert.ok(!nextMoves({ ...LIVE_INPUT, web: expired }, SUN_NOON).some(x => x.id === 'site:site:growth:2026-10-04'))
  // A shared setup step is a short site step with no site of its own.
  const shared = { ...WEB, shared_action: act({ id: 'shared:ga_grant', prefix: 'shared', rung: 1, kind: 'setup', title: 'Give Control Center read access to your whole Google Analytics account', minutes: 3, members: ['site', 'mymu'] }) }
  const withShared = nextMoves({ ...LIVE_INPUT, web: shared }, SUN_NOON)
  const s = withShared.find(x => x.id === 'site:shared:ga_grant')!
  assert.equal(s.property, undefined)
  assert.equal(s.product, null)
  assert.equal(withShared.indexOf(s), 1, 'after the 2-minute choice, before the 20-minute steps')
})

test('accounts: the one that opens the best-rated places first, with a plain why', () => {
  const m = nextMoves(LIVE_INPUT, SUN_NOON)
  const ig = m.find(x => x.id === 'account:full-time:instagram')!
  assert.equal(ig.title, 'Create the Full Time Instagram account')
  assert.equal(ig.why, 'It opens up a place your buyers already go, rated up to 9 out of 10.')
  const sub = m.find(x => x.id === 'account:circle:substack')!
  assert.equal(sub.title, 'Create the Circle Substack account')
  assert.equal(sub.why, 'It opens up a place your buyers already go, rated up to 8 out of 10.')
  const yt = m.find(x => x.id === 'account:publication:youtube')!
  assert.equal(yt.title, 'Create the Media YouTube account')
  assert.equal(yt.why, 'It is planned and has no account yet.')
  assert.ok(!m.some(x => x.id.startsWith('account:mindmake')), 'live accounts are not chores, handle or not')
})

test('clips and spend: pick 3 while under the target, then keep or drop the unconnected paid tool', () => {
  const m = nextMoves(LIVE_INPUT, SUN_NOON)
  const pick = m.find(x => x.id === 'clip:pick:2026-09-28')!
  assert.equal(pick.title, 'Pick this week\'s 3 clips')
  assert.equal(pick.why, '0 of the 3 to 5 clips for this week are picked.')
  assert.deepEqual(pick.primary, { kind: 'suggest', label: 'Suggest 3 ideas' })
  assert.equal(pick.weekStart, '2026-09-28')
  const spend = m.find(x => x.id === 'spend:getwaitlist')!
  assert.equal(spend.title, 'Keep or drop Getwaitlist')
  assert.equal(spend.why, 'It costs $15 a month against Pulse and is not connected.')
  assert.equal(spend.product, 'pulse')
  assert.deepEqual(spend.link, { label: 'Open Intel', href: '#/os?sub=intel' })
  assert.ok(!m.some(x => x.id === 'spend:affonso'), 'gated is not booked')
  assert.ok(!m.some(x => x.id === 'spend:discord'), 'free is not a spend call')
  // Two clips picked for the loop week: one more to pick, and the two in progress are listed, nearest to posted first.
  const cards: any[] = [
    { id: 'c1', product_slug: 'ctrl', title: 'Teardown one', stage: 'brief', batch_week: '2026-09-28' },
    { id: 'c2', product_slug: 'pulse', title: 'Index verdict', stage: 'produced', batch_week: '2026-09-28' },
    { id: 'c3', product_slug: 'pulse', title: 'Old week', stage: 'brief', batch_week: '2026-09-21' },
    { id: 'c4', product_slug: 'pulse', title: 'Dropped', stage: 'dropped', batch_week: '2026-09-28' },
  ]
  const withCards = nextMoves({ ...LIVE_INPUT, cards }, SUN_NOON).filter(x => x.source === 'clip').map(x => [x.id, x.title])
  assert.deepEqual(withCards, [['clip:c2', 'Index verdict'], ['clip:c1', 'Teardown one'], ['clip:pick:2026-09-28', 'Pick 1 more clip for this week']])
})

const SEP28_MOVES = {
  ctrl: ['Post the decision teardown on LinkedIn', 'Fix the /try page title'],
  circle: ['Stand up the Sunday Letter', 'Ask two coaches for a swap'],
}
const TONIGHT = [
  review('2026-09-28', 'ctrl', { double_down: SEP28_MOVES.ctrl, findings: { headline: 'CTRL is invisible in AI answers.' } }),
  review('2026-09-28', 'circle', { double_down: SEP28_MOVES.circle, findings: { headline: 'Circle has no home of its own.' } }),
  degraded('2026-09-28', 'full-time', MEASURED_FT),
]

test('after tonight\'s run: this week\'s moves sit after the short site steps, first move of every product first', () => {
  const m = nextMoves({ ...LIVE_INPUT, reviews: [...LIVE_REVIEWS, ...TONIGHT] }, SUN_EVE)
  const ids = m.map(x => x.id)
  assert.deepEqual(ids.slice(0, 8), [
    'site:legibility:canon_ruling',
    'site:fulltime:growth:2026-10-06',
    'site:site:growth:2026-10-04',
    'review:2026-09-28:ctrl:1',
    'review:2026-09-28:circle:1',
    'review:2026-09-28:ctrl:2',
    'review:2026-09-28:circle:2',
    'site:mymu:growth:2026-10-02',
  ])
  const first = m[3]
  assert.equal(first.title, 'Post the decision teardown on LinkedIn')
  assert.equal(first.why, 'CTRL is invisible in AI answers.')
  assert.deepEqual(first.primary, { kind: 'today', label: 'Put on today' })
  assert.deepEqual(first.secondary, { kind: 'clip', label: 'Make it a clip' })
  assert.equal(first.reviewId, 'rv-2026-09-28-ctrl')
  assert.equal(first.weekStart, '2026-09-28')
  assert.equal(first.minutes, null, 'nobody measured it')
  assert.ok(!ids.some(id => id.includes(':full-time:') && id.startsWith('review:')), 'a degraded review offers nothing')
  assert.ok(ids.includes('clip:pick:2026-10-05'), 'clips are for the coming week from Sunday 17:00')
})

test('a move already on today, or already a clip, is not offered again; nor is anything else on today', () => {
  const cards: any[] = [{ id: 'c9', product_slug: 'ctrl', title: 'Post the decision teardown on LinkedIn', stage: 'brief', batch_week: '2026-10-05',
    brief: 'From the weekly review, week of Mon 28 Sep: Post the decision teardown on LinkedIn' }]
  const m = nextMoves({
    ...LIVE_INPUT, reviews: [...LIVE_REVIEWS, ...TONIGHT], cards,
    todayTexts: ['  stand up the SUNDAY letter ', 'Keep or drop Getwaitlist', null],
  }, SUN_EVE)
  const ids = m.map(x => x.id)
  assert.ok(!ids.includes('review:2026-09-28:ctrl:1'), 'made into a clip')
  assert.ok(!ids.includes('review:2026-09-28:circle:1'), 'on today, compared trimmed and case-folded')
  assert.ok(!ids.includes('spend:getwaitlist'))
  assert.ok(ids.includes('review:2026-09-28:ctrl:2'))
  // The clip it became is listed as this week's clip instead.
  assert.ok(ids.includes('clip:c9'))
  assert.equal(normaliseTaskText('  A  b '), 'a b')
})

test('nextMoves is deterministic: input order never changes the queue', () => {
  const a = nextMoves({ ...LIVE_INPUT, reviews: [...LIVE_REVIEWS, ...TONIGHT] }, SUN_EVE).map(x => x.id)
  const shuffled = {
    ...LIVE_INPUT,
    reviews: [...TONIGHT, ...LIVE_REVIEWS].reverse(),
    accounts: [...ACCOUNTS].reverse(),
    touchpoints: [...TOUCHPOINTS].reverse(),
    integrations: [...INTEGRATIONS].reverse(),
    web: { ...WEB, properties: [...WEB.properties].reverse() },
  }
  assert.deepEqual(nextMoves(shuffled, SUN_EVE).map(x => x.id), a)
  assert.deepEqual(nextMoves({ reviews: [] }, SUN_NOON).map(x => x.id), ['clip:pick:2026-09-28'], 'an empty tab still has one honest step')
})

// ------------------------------------------------------------------ signals

let probeN = 0
function probes(product: string, runAt: string, asked: number, cited: number, competitors: string[] = [], over: Record<string, unknown> = {}): any[] {
  return Array.from({ length: asked }, (_, i) => ({
    id: `p${probeN++}`, product_slug: product, question: `${product} question ${i % 3}`, engine: i % 2 ? 'perplexity' : 'chatgpt',
    answer_snapshot: 'long answer', we_cited: i < cited, competitors_cited: competitors, touchpoint_id: null, run_at: runAt,
    subject_kind: 'venture', ...over,
  }))
}
const PROBES = [
  ...probes('mindmake', '2026-09-21T06:00:00Z', 10, 1, ['https://www.linkedin.com/in/someone', 'digiday.com']),
  ...probes('mindmake', '2026-09-28T06:00:00Z', 10, 3, ['linkedin.com']),
  ...probes('ctrl', '2026-09-21T06:00:00Z', 5, 0, ['fractionus.com', 'connectd.com']),
  ...probes('ctrl', '2026-09-28T06:00:00Z', 5, 0, ['fractionus.com']),
  ...probes('circle', '2026-09-28T06:00:00Z', 4, 0),
  // Outside the 30 days, and someone else's answers: neither counts.
  ...probes('mindmake', '2026-09-01T06:00:00Z', 4, 4, ['old.example']),
  ...probes('acme', '2026-09-28T06:00:00Z', 3, 3, ['acme.example'], { subject_kind: 'prospect' }),
]
const SEO: SeoRankRow[] = [
  { id: 's1', keyword: 'ai immersion', product: 'mm_ctrl', position: 8.5, previous_position: 9, monthly_searches: null, priority: null, impressions: 2, clicks: 0, checked_at: '2026-09-28T21:00:00Z' },
  { id: 's2', keyword: 'mind makers', product: 'mm_ctrl', position: 21.5, previous_position: 24, monthly_searches: null, priority: null, impressions: 2, clicks: 0, checked_at: '2026-09-28T21:00:00Z' },
  { id: 's3', keyword: 'AI news aggregator', product: 'mm_ctrl', position: null, previous_position: null, monthly_searches: 140, priority: 15, impressions: null, clicks: null, checked_at: '2026-09-28T20:00:00Z' },
  { id: 's4', keyword: 'switching ai vendors', product: 'mm_ctrl', position: 58, previous_position: null, monthly_searches: null, priority: null, impressions: 1, clicks: 0, checked_at: '2026-09-28T21:00:00Z' },
  { id: 's5', keyword: 'ai11222', product: 'fractionl_pulse', position: 2, previous_position: null, monthly_searches: null, priority: null, impressions: 1, clicks: 0, checked_at: '2026-09-28T21:00:00Z' },
  { id: 's6', keyword: 'fractionator service', product: 'fractionl_pulse', position: 13, previous_position: null, monthly_searches: null, priority: null, impressions: 1, clicks: 0, checked_at: '2026-09-28T21:00:00Z' },
  { id: 's7', keyword: 'fractional executive', product: 'fractionl_pulse', position: null, previous_position: null, monthly_searches: 880, priority: 33, impressions: null, clicks: null, checked_at: '2026-09-28T20:00:00Z' },
  { id: 's8', keyword: 'MCP server', product: 'legibility', position: null, previous_position: null, monthly_searches: 60500, priority: 48, impressions: null, clicks: null, checked_at: '2026-09-28T20:00:00Z' },
]
const SIG_CARDS: any[] = [
  { id: 'k1', product_slug: 'ctrl', title: 'a', stage: 'brief', batch_week: '2026-09-28' },
  { id: 'k2', product_slug: 'ctrl', title: 'b', stage: 'posted', batch_week: '2026-09-28' },
  { id: 'k3', product_slug: 'ctrl', title: 'c', stage: 'dropped', batch_week: '2026-09-28' },
  { id: 'k4', product_slug: 'pulse', title: 'd', stage: 'posted', batch_week: '2026-09-21' },
]

test('productSignals: rate, trend, visits, rank, clips and places per product, with honest nulls', () => {
  const { products, totals } = productSignals({ probes: PROBES, web: WEB, seo: SEO, cards: SIG_CARDS, touchpoints: TOUCHPOINTS }, SUN_NOON)
  assert.deepEqual(products.map(p => [p.slug, p.label, p.core]), [
    ['heartside', 'Heartside', true], ['full-time', 'Full Time', true], ['legibility', 'Legibility', true],
    ['ctrl', 'CTRL', true], ['pulse', 'Pulse', true], ['mindmake', 'Advisory', true], ['circle', 'Circle', true],
    ['publication', 'Media', false],
  ])
  const by = Object.fromEntries(products.map(p => [p.slug, p]))
  assert.deepEqual([by.mindmake.aiAnswers.mentioned, by.mindmake.aiAnswers.asked, by.mindmake.aiAnswers.rate], [4, 20, 0.2])
  assert.equal(by.mindmake.aiAnswers.trend.dir, 'up')
  assert.ok(Math.abs((by.mindmake.aiAnswers.trend.delta as number) - 0.2) < 1e-9)
  assert.deepEqual(by.mindmake.aiAnswers.trend.weekly, [{ week: '2026-09-21', mentioned: 1, asked: 10 }, { week: '2026-09-28', mentioned: 3, asked: 10 }])
  assert.equal(by.ctrl.aiAnswers.trend.dir, 'flat')
  assert.equal(by.circle.aiAnswers.trend.dir, null, 'one week is not a trend')
  assert.deepEqual([by.pulse.aiAnswers.asked, by.pulse.aiAnswers.rate], [0, null], 'nothing asked is no rate, not 0%')

  assert.equal(by.ctrl.visits, null, 'no site of its own')
  assert.deepEqual(by['full-time'].visits, { cur: 3, prev: 0 })
  assert.deepEqual(by.mindmake.visits, { cur: 0, prev: 3 })
  assert.deepEqual(by.publication.visits, { cur: 0, prev: 3 })
  assert.equal(by.legibility.visits, null, 'a site that was not read is not 0 visits')

  assert.deepEqual(by.ctrl.rank, { inTop10: 1, tracked: 4, best: 8.5 })
  assert.deepEqual(by.pulse.rank, { inTop10: 1, tracked: 3, best: 2 })
  assert.deepEqual(by.legibility.rank, { inTop10: 0, tracked: 1, best: null })
  assert.equal(by.circle.rank, null)

  assert.deepEqual(by.ctrl.clips, { made: 2, posted: 1 })
  assert.deepEqual(by.pulse.clips, { made: 0, posted: 0 }, 'last week\'s clip is not this week\'s')
  assert.deepEqual(by['full-time'].places, { covered: 0, total: 2, waiting: 2 })
  assert.deepEqual(by.circle.places, { covered: 0, total: 1, waiting: 1 }, 'retired places are not counted')
  assert.deepEqual(by.mindmake.places, { covered: 1, total: 2, waiting: 0 })

  assert.deepEqual(totals.aiAnswers, { mentioned: 4, asked: 34, rate: 4 / 34 })
  assert.deepEqual(totals.visits, { cur: 3, prev: 6 })
  assert.deepEqual(totals.rank, { inTop10: 2, tracked: 8 })
  assert.deepEqual(totals.clips, { made: 2, posted: 1, min: 3, max: 5 })
  assert.deepEqual(totals.places, { covered: 1, total: 6, waiting: 3 })
  // Counted once per answer, www. and paths stripped; a tie breaks by name.
  assert.deepEqual(totals.citedInstead, [{ domain: 'linkedin.com', times: 20 }, { domain: 'digiday.com', times: 10 }, { domain: 'fractionus.com', times: 10 }])
})

test('productSignals with nothing measured: every number null or zero-of-zero, never invented', () => {
  const { products, totals } = productSignals({}, SUN_NOON)
  assert.equal(products.length, 7)
  for (const p of products) {
    assert.equal(p.aiAnswers.rate, null)
    assert.equal(p.visits, null)
    assert.equal(p.rank, null)
  }
  assert.equal(totals.aiAnswers.rate, null)
  assert.equal(totals.visits, null)
  assert.equal(totals.rank, null)
  assert.deepEqual(totals.citedInstead, [])
})

test('missedQuestions: the evidence behind a low rate, one per question, only the engines that missed', () => {
  const rows = [
    ...probes('ctrl', '2026-09-28T06:00:00Z', 2, 0, [], { question: 'Best AI decision tool?' }),
    ...probes('mindmake', '2026-09-28T06:00:00Z', 2, 1, [], { question: 'Who runs AI pilots for leaders?' }),
    ...probes('mindmake', '2026-09-21T06:00:00Z', 2, 2, [], { question: 'Mindmake reviews' }),
  ]
  assert.deepEqual(missedQuestions(rows, 'ctrl', SUN_NOON), [{ question: 'Best AI decision tool?', engines: ['chatgpt', 'perplexity'], lastAsked: '2026-09-28T06:00:00Z' }])
  assert.deepEqual(missedQuestions(rows, 'mm_ctrl', SUN_NOON).length, 1, 'any slug spelling')
  assert.deepEqual(missedQuestions(rows, 'mindmake', SUN_NOON), [{ question: 'Who runs AI pilots for leaders?', engines: ['perplexity'], lastAsked: '2026-09-28T06:00:00Z' }])
  assert.deepEqual(citedInstead([], 3), [])
})

// ------------------------------------------------------------------ the week

const stepStatus = (r: ReturnType<typeof weekLoop>) => r.steps.map(s => `${s.id}:${s.status}`)

test('weekLoop on Sunday afternoon: the degraded review has nothing to act on, so picking clips is current', () => {
  const r = weekLoop({ reviews: LIVE_REVIEWS, cards: [], probes: PROBES, web: WEB }, SUN_NOON)
  assert.equal(r.week, '2026-09-28')
  assert.equal(r.reviewWeek, '2026-09-21')
  assert.deepEqual(stepStatus(r), ['review:done', 'pick:current', 'make:upcoming', 'see:upcoming'])
  assert.deepEqual(r.steps[0].counts, { reviews: 5, moves: 0, handled: 0 })
  assert.equal(r.steps[0].note, null)
  assert.deepEqual(r.steps[1].action.kind, 'suggest')
  assert.deepEqual(r.steps[1].counts, { picked: 0, min: 3, max: 5 })
  assert.deepEqual(r.steps[3].counts, { answersMentioned: 3, answersAsked: 19, visitsCur: 3, visitsPrev: 6 })
})

test('weekLoop after tonight\'s run: the review is current until its moves are used', () => {
  const reviews = [...LIVE_REVIEWS, ...TONIGHT]
  const r = weekLoop({ reviews, cards: [] }, SUN_EVE)
  assert.equal(r.week, '2026-10-05')
  assert.deepEqual(stepStatus(r), ['review:current', 'pick:upcoming', 'make:upcoming', 'see:upcoming'])
  assert.deepEqual(r.steps[0].counts, { reviews: 3, moves: 4, handled: 0 })
  assert.equal(r.steps[0].action.link.href, '#/growth?section=council')
  // Every move used (two clips, two on today): the review is done.
  const cards: any[] = [
    { id: 'a', product_slug: 'ctrl', title: SEP28_MOVES.ctrl[0], stage: 'brief', batch_week: '2026-10-05' },
    { id: 'b', product_slug: 'circle', title: SEP28_MOVES.circle[0], stage: 'brief', batch_week: '2026-10-05' },
  ]
  const used = weekLoop({ reviews, cards, todayTexts: [SEP28_MOVES.ctrl[1], SEP28_MOVES.circle[1]] }, WED)
  assert.deepEqual(stepStatus(used), ['review:done', 'pick:current', 'make:upcoming', 'see:upcoming'])
  assert.equal(used.steps[1].action.kind, 'open')
  // Ruling every review also clears it, whatever the moves.
  const ruled = weekLoop({ reviews: reviews.map(x => (x.week_start === '2026-09-28' ? { ...x, krish_decision: 'Go.' } : x)) }, WED)
  assert.equal(ruled.steps[0].status, 'done')
})

test('weekLoop through the week: 3 picked, then all posted, then see what moved', () => {
  const reviews = [...LIVE_REVIEWS, ...TONIGHT]
  const card = (id: string, stage: string): any => ({ id, product_slug: 'ctrl', title: id, stage, batch_week: '2026-10-05' })
  const making = weekLoop({ reviews, cards: [card('x', 'posted'), card('y', 'script'), card('z', 'produced')] }, WED)
  assert.deepEqual(stepStatus(making), ['review:done', 'pick:done', 'make:current', 'see:upcoming'])
  assert.deepEqual(making.steps[2].counts, { posted: 1, picked: 3, inProgress: 2 })
  const posted = weekLoop({ reviews, cards: [card('x', 'posted'), card('y', 'posted'), card('z', 'posted')] }, WED)
  assert.deepEqual(stepStatus(posted), ['review:done', 'pick:done', 'make:done', 'see:current'])
  const over = weekLoop({ reviews, cards: ['a', 'b', 'c', 'd', 'e', 'f'].map(id => card(id, 'brief')) }, WED)
  assert.equal(over.steps[1].note, 'More than 5 clips are picked. Drop one.')
  // No review written for the week: it says so, and does not hold the week hostage.
  const none = weekLoop({ reviews: LIVE_REVIEWS }, WED)
  assert.equal(none.steps[0].status, 'done')
  assert.equal(none.steps[0].note, 'No review was written for this week.')
  assert.equal(none.steps[1].status, 'current')
  // In the hour the run is writing it, a missing review is late, not absent.
  assert.equal(weekLoop({ reviews: LIVE_REVIEWS }, new Date('2026-10-04T17:02:00Z')).steps[0].note, 'This week\'s review is being written now.')
})

// ------------------------------------------------------------------ the rank check and the slug aliases

test('normaliseSeoRows: numbers coerced, aliases applied, newest check per keyword, priority then volume', () => {
  const raw = [
    { id: 'a', product: 'mm_ctrl', query: 'AI news aggregator', current_position: null, previous_position: null, search_volume: '140', priority: '15', last_checked_at: '2026-09-28T20:00:00Z' },
    { id: 'b', product: 'ctrl', query: 'ai news aggregator ', current_position: '40', previous_position: null, search_volume: '140', priority: '15', last_checked_at: '2026-09-21T20:00:00Z' },
    { id: 'c', product: 'legibility', query: 'MCP server', current_position: null, previous_position: null, search_volume: 60500, priority: 48, last_checked_at: '2026-09-28T20:00:00Z' },
    { id: 'd', product: 'fractionl_pulse', query: 'what is fractional ai', current_position: '66', previous_position: '65', search_volume: null, priority: null, last_checked_at: null, found_at: '2026-07-18T16:55:28Z' },
    { id: 'e', product: 'fractionl_pulse', query: 'fractional executive', current_position: null, search_volume: 880, priority: 33, last_checked_at: '2026-09-28T20:00:00Z' },
    { id: 'f', product: '', query: 'no product' },
    { id: 'g', product: 'mm_ctrl', query: '   ' },
    null,
  ]
  const rows = normaliseSeoRows(raw, canonicalVentureSlug)
  assert.deepEqual(rows.map(r => r.id), ['c', 'e', 'a', 'd'])
  const a = rows.find(r => r.id === 'a')!
  assert.equal(a.product, 'mm_ctrl')
  assert.equal(a.monthly_searches, 140)
  assert.equal(a.priority, 15)
  assert.equal(a.position, null, 'the newer check says not ranking; the older #40 is dropped')
  const d = rows.find(r => r.id === 'd')!
  assert.deepEqual([d.position, d.previous_position, d.checked_at], [66, 65, '2026-07-18T16:55:28Z'])
  assert.equal(newestCheck(rows), '2026-09-28T20:00:00Z')
  assert.equal(newestCheck([]), null)
  assert.deepEqual(normaliseSeoRows('nope', canonicalVentureSlug), [])
  assert.equal(toNumberOrNull('10') as number < (toNumberOrNull('9') as number), false, '"10" < "9" is the bug coercion prevents')
})

test('canonicalVentureSlug is the alias map ventureLabel uses, and ventureLabel is unchanged', () => {
  assert.equal(canonicalVentureSlug('ctrl'), 'mm_ctrl')
  assert.equal(canonicalVentureSlug('mm_ctrl'), 'mm_ctrl')
  assert.equal(canonicalVentureSlug(' pulse '), 'fractionl_pulse')
  assert.equal(canonicalVentureSlug('full-time'), 'full_time')
  assert.equal(canonicalVentureSlug('legibility'), 'legibility')
  assert.equal(canonicalVentureSlug(null), null)
  assert.equal(canonicalVentureSlug(''), null)
  assert.equal(ventureLabel('ctrl'), 'CTRL')
  assert.equal(ventureLabel('full-time'), 'Full Time')
  assert.equal(ventureLabel('fractionl_circle'), 'Circle')
  assert.equal(ventureLabel('mindmake'), 'Advisory')
  assert.equal(ventureLabel('some_new_thing'), 'some new thing')
  assert.equal(ventureLabel(null), null)
  assert.equal(growthSlugOf('full_time'), 'full-time')
  assert.equal(growthSlugOf('mm_ctrl'), 'ctrl')
  assert.equal(growthSlugOf('publication'), 'publication')
  assert.equal(growthSlugOf(undefined), null)
})

test('no string the model writes carries an em dash', () => {
  const m = nextMoves({ ...LIVE_INPUT, reviews: [...LIVE_REVIEWS, ...TONIGHT] }, SUN_EVE)
  const loop = weekLoop({ reviews: LIVE_REVIEWS, cards: [] }, WED)
  const words = [
    ...m.flatMap(x => [x.title, x.why, x.primary.label, x.secondary?.label ?? '', ...(x.choices ?? []).flatMap(c => [c.label, c.hint ?? ''])]),
    ...loop.steps.flatMap(s => [s.label, s.action.label, s.note ?? '']),
  ]
  for (const w of words) assert.ok(!w.includes(EM), w)
})

// ------------------------------------------------- one week, one window

test('every Growth surface counts clips in the loop week: no component reads mondayOf(now)', () => {
  // "Make it a clip" files into clipWeekFor (the loop week). The board, its
  // add form and the header count used mondayOf(new Date()), local time, which
  // on Sunday evening is the week ending that night: the clip the toast sent
  // you to see was missing from "this week". One clock for all of them.
  const dir = new URL('../../src/components/growth/', import.meta.url).pathname
  const offenders = readdirSync(dir)
    .filter(f => /\.tsx?$/.test(f))
    .filter(f => /\bmondayOf\(/.test(readFileSync(join(dir, f), 'utf8').replace(/\/\/.*$/gm, '')))
  assert.deepEqual(offenders, [], `use growthWeekOf / addDaysIso instead of mondayOf in: ${offenders.join(', ')}`)
})

test('recentProbes is the one 30-day window: the header rate and GeoProbes agree on 45 days of rows', () => {
  const now = Date.parse('2026-10-04T12:00:00Z')
  const at = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString()
  // Shaped on 2026-10-04: 620 rows in 30 days with 8 cited, 14 more before it with 2 cited.
  const rows = [
    ...Array.from({ length: 620 }, (_, i) => ({ run_at: at(i % 29), we_cited: i < 8 })),
    ...Array.from({ length: 14 }, (_, i) => ({ run_at: at(31 + (i % 14)), we_cited: i < 2 })),
  ]
  const recent = recentProbes(rows, now)
  assert.equal(GEO_WINDOW_DAYS, 30)
  assert.equal(recent.length, 620)
  assert.equal(Math.round((citationRate(recent) ?? 0) * 100), 1)
  // What the header showed when it rated every row read: 2%, against the panel's 1%.
  assert.equal(Math.round((citationRate(rows) ?? 0) * 100), 2)
  // Nothing in the window: the rows read stand in (GeoProbes' rule), never an invented zero.
  const old = [{ run_at: at(40), we_cited: true }, { run_at: at(41), we_cited: false }]
  assert.deepEqual(recentProbes(old, now), old)
  assert.deepEqual(recentProbes([], now), [])
  // And no Growth component rates the raw read again.
  const dir = new URL('../../src/components/growth/', import.meta.url).pathname
  const raw = readdirSync(dir).filter(f => /\.tsx?$/.test(f))
    .filter(f => /citationRate\(g\.probes\)/.test(readFileSync(join(dir, f), 'utf8')))
  assert.deepEqual(raw, [], `rate recentProbes(g.probes), not every row read, in: ${raw.join(', ')}`)
})
