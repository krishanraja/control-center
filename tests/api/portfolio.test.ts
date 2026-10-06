import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PORTFOLIO, GROWTH_ORDER, METRICS, UNRANKED_GROWTH, SUBSTACK, portfolioRank, tierOf } from '../../src/lib/portfolio.ts'
import { PRODUCTS } from '../../src/lib/growth.ts'
import { VENTURE_OPTIONS, ventureLabel } from '../../src/lib/ventureOptions.ts'
import { buildBoard, subscriptionsSummary } from '../../src/lib/portfolioBoard.ts'
import { productSignals } from '../../src/lib/growthModel.ts'
import { substackSlice } from '../../api/_revenue.ts'

const NOW = new Date('2026-10-05T12:00:00Z')

test('the ranking is the one Krish set on 2026-10-05', () => {
  assert.deepEqual(PORTFOLIO.map(p => [p.venture, p.tier]), [
    ['heartside', 1], ['full_time', 1], ['legibility', 2], ['mm_ctrl', 3], ['fractionl_pulse', 3],
  ])
  assert.equal(tierOf('full-time'), 1, 'any slug spelling resolves')
  assert.equal(tierOf('mindmake'), null, 'Advisory is tracked, not ranked')
  assert.ok(portfolioRank('heartside') < portfolioRank('legibility'))
  assert.ok(portfolioRank('pulse') < portfolioRank('mindmake'), 'unranked sorts after every tier')
})

test('Growth, the Sunday review and Subscriptions read one list', () => {
  assert.deepEqual(PRODUCTS, [...GROWTH_ORDER], 'Growth products are the portfolio order')
  const council = readFileSync(new URL('../../api/growth/council-run.ts', import.meta.url), 'utf8')
  assert.match(council, /const PRODUCTS = GROWTH_ORDER/, 'the review derives its list instead of keeping a copy')
  assert.doesNotMatch(council, /const PRODUCTS = \['ctrl'/)
  for (const p of PORTFOLIO) {
    assert.ok(VENTURE_OPTIONS.some(v => v.slug === p.venture), `${p.venture} is offered as a venture`)
    assert.equal(ventureLabel(p.venture), p.label, `${p.venture} wears one name`)
    assert.equal(ventureLabel(p.growthSlug), p.label)
  }
  for (const u of UNRANKED_GROWTH) assert.ok(GROWTH_ORDER.includes(u.growthSlug))
})

test('the migration lets every growth table hold every product Growth offers', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261005120000_heartside_and_the_ranking.sql', import.meta.url), 'utf8')
  for (const slug of GROWTH_ORDER) {
    const lists = [...sql.matchAll(/array\[([^\]]+)\]/g)].map(m => m[1])
    assert.equal(lists.length, 6)
    for (const l of lists) assert.ok(l.includes(`'${slug}'`), `${slug} allowed in ${l.slice(0, 40)}`)
  }
  assert.match(sql, /add value if not exists 'heartside'/)
  assert.match(sql, /insert into public\.ventures/, 'both venture tables, not one')
})

test('every metric names a source or says what is missing', () => {
  for (const p of PORTFOLIO) {
    for (const m of METRICS) {
      const s = p.sources[m.key]
      assert.ok(s.source || (s.gap && s.fix), `${p.venture}.${m.key}`)
      for (const line of [s.source, s.gap, s.fix]) if (line) assert.doesNotMatch(line, /—/, 'no em dash')
    }
  }
})

test('buildBoard: an unwired cell never prints a zero, a wired empty one says so, a live one is a number', () => {
  const signals = productSignals({
    probes: [
      { id: 'a', product_slug: 'full-time', question: 'q', engine: 'perplexity', answer_snapshot: null, we_cited: false, competitors_cited: [], touchpoint_id: null, run_at: '2026-10-01T10:00:00Z' },
      { id: 'b', product_slug: 'ctrl', question: 'q', engine: 'perplexity', answer_snapshot: null, we_cited: true, competitors_cited: [], touchpoint_id: null, run_at: '2026-10-01T10:00:00Z' },
    ] as any,
    touchpoints: [{ id: 't', product_slug: 'pulse', coverage_status: 'covered', assumption_flag: null } as any],
  }, NOW).products
  const { rows, gaps } = buildBoard({
    signals,
    reviews: [{ product_slug: 'ctrl', week_start: '2026-09-28', double_down: ['a', 'b'] }],
    customers: [
      // These were `mm_ctrl` until 2026-10-05. They are the Substack's founding
      // members (metadata.substack=yes on every one of their prices), so they
      // belong to the publication. See the migration
      // 20261005140000_substack_revenue_is_not_ctrl.sql.
      { product: 'publication', kind: 'paid', mrr_usd: 6.75, churned_at: null },
      { product: 'publication', kind: 'churned', mrr_usd: 8, churned_at: '2026-07-01' },
      { product: 'fractionl_pulse', kind: 'waitlist' },
    ],
    audience: { ctrl: 103 },
    usage: [{ product: 'mm_ctrl', metric_date: '2026-10-04', active_users: 1 }],
  }, NOW)
  const by = Object.fromEntries(rows.map(r => [r.product.venture, r]))

  for (const m of METRICS) {
    const c = by.heartside.cells[m.key]
    if (c.state === 'unwired') assert.equal(c.value, 'Not wired')
  }
  // Ruling (Krish, 2026-10-05): Heartside is read in Shopify. Its visits,
  // sign-ups and orders link out there; they are not gaps, not zeros, not MRR.
  for (const k of ['analytics', 'signups', 'revenue'] as const) {
    const c = by.heartside.cells[k]
    assert.equal(c.state, 'external', k)
    assert.equal(c.value, 'In Shopify')
    assert.equal(c.href, 'https://admin.shopify.com/store/bnf1em-ge/analytics')
    assert.doesNotMatch(`${c.value} ${c.note} ${c.source}`, /MRR|\/mo|subscriber|\$0/)
  }
  assert.equal(by.heartside.cells.aeo.state, 'unwired', 'AI answers are still the OS\'s to wire')
  assert.equal(by.heartside.mrrUsd, null, 'no revenue figure, not $0')
  assert.equal(by.heartside.paid, null, 'never framed as paying subscribers')
  assert.deepEqual(gaps.filter(g => g.product.venture === 'heartside').map(g => g.metric).sort(), ['aeo', 'hacks'],
    'Heartside\'s Shopify numbers are not on the wiring list')
  // Full Time joined the daily pull on 2026-10-05, when one organisation key
  // replaced the two per-account keys. Its zero is now a MEASURED zero, which
  // is a different claim from "not wired" and has to read differently.
  assert.equal(by.full_time.cells.revenue.state, 'zero')
  assert.equal(by.full_time.cells.aeo.value, '0 of 1')
  assert.equal(by.full_time.cells.aeo.state, 'zero')

  assert.deepEqual([by.mm_ctrl.cells.aeo.state, by.mm_ctrl.cells.aeo.value], ['live', '1 of 1'])
  assert.equal(by.mm_ctrl.cells.signups.value, '103')
  assert.equal(by.mm_ctrl.paid, 0, 'CTRL has never had a paying customer')
  assert.equal(by.mm_ctrl.cells.suggestions.value, '2 moves')
  assert.equal(by.mm_ctrl.cells.analytics.value, '1 user')
  assert.equal(by.fractionl_pulse.cells.signups.value, '1')
  assert.equal(by.fractionl_pulse.cells.hacks.value, '1 of 1')
  assert.equal(by.fractionl_pulse.cells.revenue.state, 'unwired', 'Pulse cannot take a payment, so it is not a $0')
  assert.equal(by.fractionl_pulse.mrrUsd, null)

  assert.equal(gaps[0].product.venture, 'heartside', 'priority 1 gaps first')
  assert.ok(gaps.findIndex(g => g.product.venture === 'legibility') > gaps.findIndex(g => g.product.venture === 'full_time'))
})

test('QA, audit and owner accounts never count as sign-ups or customers', async () => {
  const { isTestRecord } = await import('../../src/lib/recordHygiene.ts')
  for (const email of ['qa_desktop_1780967337717@example.com', 'ctrl-qa-1782077550632@example.com', 'qa-bot@merciless-qa.dev',
    'pulse-qa-test@gmail.com', 'audit-1@example.com', 'verify-1781997550188@test.com', 'krishanraja@gmail.com']) {
    assert.equal(isTestRecord({ email }), true, email)
  }
  for (const email of ['hello@cameronrambert.com', 'thin.list9496@fastmail.com', 'aqa@company.com', 'qasim@company.com']) {
    assert.equal(isTestRecord({ email }), false, email)
  }
})

test('substackSlice: only plans Substack made, never added to the totals', () => {
  const subs = [
    { id: 's1', status: 'active', currency: 'usd', mrr_cents: 675, mrr_usd_cents: 675, substack: 'yes' },
    { id: 's2', status: 'canceled', currency: 'usd', mrr_cents: 800, mrr_usd_cents: 800, substack: 'yes' },
    { id: 's3', status: 'active', currency: 'usd', mrr_cents: 1000, mrr_usd_cents: 1000, substack: null },
    { id: 's4', status: 'active', currency: 'aud', mrr_cents: 958, mrr_usd_cents: null, substack: 'yes' },
  ]
  const events = [
    { subscription_id: 's1', net_cents: 667, occurred_at: '2026-10-01T00:00:00Z' },
    { subscription_id: 's2', net_cents: 667, occurred_at: '2026-06-01T00:00:00Z' },
    { subscription_id: 's3', net_cents: 900, occurred_at: '2026-10-01T00:00:00Z' },
    { subscription_id: null, net_cents: 66313, occurred_at: '2026-03-09T00:00:00Z' },
  ]
  const s = substackSlice(events, subs, NOW.getTime())
  assert.deepEqual(s, {
    active_subscriptions: 2,
    committed_mrr_usd_cents: 675,
    committed_mrr_other: [{ currency: 'aud', cents: 958 }],
    collected_30d_net_cents: 667,
    collected_all_time_net_cents: 1334,
  })
})

test('the Subscriptions sentence says who pays and how much of priority 1 is visible', () => {
  const { rows } = buildBoard({ signals: [], reviews: [], customers: [], audience: {}, usage: [] }, NOW)
  const line = subscriptionsSummary(rows, {
    active_subscriptions: 2, substack: { active_subscriptions: 2 },
  } as any)
  assert.match(line, /^2 paying, all through the Substack\./)
  assert.match(line, /Priority 1 shows \d+ of its 12 numbers/)
  assert.doesNotMatch(line, /—/)
})

test('CTRL sells CTRL Pro, and paid Substack members count under the publication', () => {
  // Stripe renamed Edge Pro to CTRL Pro on 2026-10-05, and migration
  // 20261005140000 moved the Substack plans from mm_ctrl to publication. The
  // one code source of the ladder has to say both.
  const ctrl = PORTFOLIO.find(p => p.venture === 'mm_ctrl')!
  assert.match(ctrl.what, /CTRL Pro at \$49 a month/)
  assert.doesNotMatch(JSON.stringify(ctrl), /sells Edge Pro|one thing, Edge Pro/)
  assert.equal(SUBSTACK.paidCountedUnder, 'publication')
})
