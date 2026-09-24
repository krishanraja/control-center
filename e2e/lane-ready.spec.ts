import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * Ready to write: a lane's ready pieces, ranked, each opening DecideCard.
 *
 * WHAT THIS FILE HOLDS.
 *
 * 1. THE ORDER COMES FROM THE MARKS. On 2026-09-24 every ready piece stood at
 *    exactly 7, so a sort on the standing sorted nothing. The three lift.the.lid
 *    rows below are that day's real spreads, and the spec asserts the order the
 *    marks give, which is not the order they arrive in.
 * 2. ONE QUERY FOR THE LANE. The marks are read from judge_verdicts in a single
 *    request, never one per row.
 * 3. A READY PIECE CAN BE DECIDED, AND THE DECISION CARRIES panel_run_id. Before
 *    this, a ready piece could not reach DecideCard from any screen, so the
 *    pieces the machine was surest of were the only ones whose verdict could
 *    never be scored back.
 *
 * The per-judge marks are NOT on the idea row. They are served from
 * judge_verdicts, filtered on the ids the page asks for, as PostgREST would.
 */

test.use({ viewport: { width: 1440, height: 900 } })

const RUN = {
  koa: '5255dcd8-0000-4000-8000-000000000001',
  decision: 'dca4aa7b-0000-4000-8000-000000000002',
  toggles: 'a69cd6ae-0000-4000-8000-000000000003',
  pricing: '6cb0d213-0000-4000-8000-000000000004',
  extra: 'e0000000-0000-4000-8000-000000000005',
}

const ladder = (o: { band: string; score: number; weakest: string; angle: string; run: string }) => ({
  roster_version: 'panel-v2',
  judged_at: '2026-09-24T19:00:00Z',
  first: { score: o.score, weakest: o.weakest, band: o.band },
  final: { score: o.score, weakest: o.weakest, band: o.band },
  expansion: { angle: o.angle, parties: ['the platform', 'the buyer'], scenarios: 2, decision_rule: true, known: 3, inferred: 2 },
  attempts: [],
  panel_run_id: o.run,
  router: { fits: { mind_the_gap: 4, split_the_bill: 5, lift_the_lid: 6 }, winner: 'lift_the_lid', contested: [], why: 'x' },
  router_disagrees: false,
})

const row = (id: string, idea: string, lane: string, l: unknown, state = 'seeded') => ({
  id, idea, thesis: 'A thesis.', body: null, source_type: 'pool_headline', state, lane_slot: lane,
  lane: 'publication', created_at: '2026-09-22T10:00:00Z', updated_at: '2026-09-24T19:00:00Z',
  buried_at: null, library_at: null, origin: 'agent', horizon: 'news', meta: { ladder: l },
})

// Arrival order is deliberately the reverse of the ranked order.
const IDEAS = [
  row('toggles', 'Seed: permission toggles', 'lift_the_lid', ladder({ band: 'ready', score: 7, weakest: 'standing', run: RUN.toggles,
    angle: 'The permission toggles were meant to be the trust interface, and they are not.' })),
  row('decision', 'Seed: the decision layer', 'lift_the_lid', ladder({ band: 'ready', score: 7, weakest: 'consequence', run: RUN.decision,
    angle: 'The decision layer is where lock-in and business logic collide.' })),
  row('koa', 'Seed: the Koa split', 'lift_the_lid', ladder({ band: 'ready', score: 7, weakest: 'novelty', run: RUN.koa,
    angle: 'Splitting the in-house model from the open ones is a build-or-buy answer.' })),
  row('pricing', 'Seed: the takedown', 'split_the_bill', ladder({ band: 'ready', score: 7, weakest: 'voice_mechanics', run: RUN.pricing,
    angle: 'The takedown is a pricing dispute wearing a security notice.' })),
  // In the lane but not ready: this one belongs on the in-progress board.
  row('moving', 'A piece still being researched', 'lift_the_lid', ladder({ band: 'repairable', score: 6, weakest: 'reader', run: RUN.extra,
    angle: 'Still being worked.' }), 'researching'),
]

const v = (run: string, judge: string, score: number | null, deterministic = false) =>
  ({ panel_run_id: run, judge, score, verdict: 'pass', the_one_fix: null, evidence: [], deterministic })

const VERDICTS = [
  // Koa: no 8s, lowest model judge novelty 6. The prosecutor's 3 must not count.
  ...Object.entries({ prosecutor: 3, novelty: 6, connection: 7, evidence: 7, fun: 7, consequence: 7, buyer: 7 }).map(([j, s]) => v(RUN.koa, j, s)),
  v(RUN.koa, 'reader', null), v(RUN.koa, 'standing', null),
  // Decision layer: no 8s, consequence 3. The voice check's 4 must not count.
  ...Object.entries({ consequence: 3, prosecutor: 6, novelty: 6, connection: 7, evidence: 7, fun: 7, standing: 7, buyer: 7, reader: 7 }).map(([j, s]) => v(RUN.decision, j, s)),
  v(RUN.decision, 'voice_mechanics', 4, true),
  // Toggles: no 8s, standing 2.
  ...Object.entries({ standing: 2, reader: 3, buyer: 3, evidence: 7, consequence: 7, connection: 7, prosecutor: 7, novelty: 7, fun: 7 }).map(([j, s]) => v(RUN.toggles, j, s)),
  v(RUN.toggles, 'voice_mechanics', 4, true),
  // Pricing: three 8s, and only the voice check below 6.
  ...Object.entries({ prosecutor: 6, novelty: 7, reader: 7, evidence: 7, consequence: 7, standing: 7, fun: 8, connection: 8, buyer: 8 }).map(([j, s]) => v(RUN.pricing, j, s)),
  v(RUN.pricing, 'voice_mechanics', 4, true),
]

const calmMorning = {
  id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green',
  one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false,
}

async function mock(page: Page, ideas: unknown[] = IDEAS) {
  const posted: Record<string, unknown>[] = []
  const verdictQueries: string[] = []
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/pilot/timezone', (r: Route) =>
    r.fulfill({ json: { ok: true, timezone: 'America/New_York' } }))
  await page.route('**/api/pilot/checkin*', (r: Route) => r.fulfill({
    json: {
      ok: true, morning: calmMorning, last_evening: null, evening_done_today: true,
      yesterday: null, timezone: 'America/New_York',
      today: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()),
    },
  }))
  // Specific AFTER the catch-alls: Playwright checks handlers in reverse
  // registration order.
  await page.route('**/rest/v1/content_ideas*', (r: Route) => r.fulfill({ json: ideas }))
  await page.route('**/rest/v1/judge_verdicts*', (r: Route) => {
    const filter = new URL(r.request().url()).searchParams.get('panel_run_id') || ''
    verdictQueries.push(filter)
    const ids = filter.startsWith('in.(') ? filter.slice(4, -1).split(',').map(s => s.replace(/"/g, ''))
      : filter.startsWith('eq.') ? [filter.slice(3)] : []
    return r.fulfill({ json: VERDICTS.filter(x => ids.includes(x.panel_run_id)) })
  })
  await page.route('**/api/content-edits', (r: Route) => {
    try { posted.push(JSON.parse(r.request().postData() || '{}')) } catch { /* recorded as absent */ }
    return r.fulfill({ json: { ok: true } })
  })
  return { posted, verdictQueries }
}

const openLane = async (page: Page, lane: string) => {
  await page.goto('/#/content')
  await page.getByTestId(`content-room-${lane}`).click()
  await expect(page.getByTestId('ready-to-write')).toBeVisible()
}

const rowIds = (page: Page) => page.getByTestId('ready-to-write').locator('[data-testid^="ready-row-"]')
  .evaluateAll(els => els.map(e => e.getAttribute('data-testid')))

test.describe('ready to write', () => {
  test('ranks pieces tied at 7 by their marks, not by arrival', async ({ page }) => {
    const { verdictQueries } = await mock(page)
    await openLane(page, 'lift_the_lid')
    await expect(page.getByTestId('ready-row-koa').getByTestId('ready-praise')).toBeVisible()
    expect(await rowIds(page)).toEqual(['ready-row-koa', 'ready-row-decision', 'ready-row-toggles'])
    // One query for the whole lane, never one per row.
    expect(verdictQueries.filter(q => q.startsWith('in.('))).toHaveLength(1)
  })

  test('names the voice check in words rather than a shrug', async ({ page }) => {
    await mock(page)
    await openLane(page, 'split_the_bill')
    const r = page.getByTestId('ready-row-pricing')
    await expect(r.getByTestId('ready-weakest')).toHaveText('Weakest check: Breaks a house writing rule')
    await expect(r.getByTestId('ready-praise')).toHaveText('3 checks rated it 8 or more')
  })

  test('a ready piece is not shown twice in one column', async ({ page }) => {
    await mock(page)
    await openLane(page, 'lift_the_lid')
    const board = page.getByTestId('content-lift_the_lid-in-progress')
    await expect(board).toContainText('A piece still being researched')
    // The count, not the cards: on a desk the board pages to its height, so a
    // duplicate can sit on a page nobody is looking at and a text check passes
    // over it. The first version of this test did exactly that.
    await expect(board.locator('h3')).toContainText('1 in flight')
  })

  test('deciding one carries its panel run to the ledger, then opens the composer', async ({ page }) => {
    const { posted } = await mock(page)
    await openLane(page, 'lift_the_lid')
    await page.getByTestId('ready-row-koa').click()
    await expect(page.getByTestId('decide-card')).toBeVisible()
    await expect(page.getByTestId('decide-claim')).toHaveText('Splitting the in-house model from the open ones is a build-or-buy answer.')
    await page.getByTestId('decide-write').click()
    await page.getByTestId('reason-pattern_is_real').click()
    await page.getByTestId('decide-commit').click()
    await expect(page.getByTestId('decide-receipt')).toBeVisible()

    expect(posted).toHaveLength(1)
    expect(posted[0]!.action).toBe('approved')
    expect(posted[0]!.panel_run_id).toBe(RUN.koa)
    expect(posted[0]!.reason_code).toBe('pattern_is_real')

    await page.getByTestId('decide-start-writing').click()
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/content?idea=koa')
  })

  test('back returns to the ranked list, and a settled piece leaves it', async ({ page }) => {
    await mock(page)
    await openLane(page, 'lift_the_lid')
    await page.getByTestId('ready-row-toggles').click()
    await page.getByTestId('decide-close').click()
    expect(await rowIds(page)).toEqual(['ready-row-koa', 'ready-row-decision', 'ready-row-toggles'])

    await page.getByTestId('ready-row-koa').click()
    await page.getByTestId('decide-bin').click()
    await page.getByTestId('decide-commit').click()
    await page.getByRole('button', { name: 'Next piece' }).click()
    expect(await rowIds(page)).toEqual(['ready-row-decision', 'ready-row-toggles'])
  })

  test('past three, the rest are one press away', async ({ page }) => {
    const more = [...IDEAS, row('fourth', 'Seed: a fourth', 'lift_the_lid', ladder({ band: 'ready', score: 7, weakest: 'reader', run: 'f0000000-0000-4000-8000-000000000006', angle: 'A fourth ready piece.' }))]
    await mock(page, more)
    await openLane(page, 'lift_the_lid')
    expect(await rowIds(page)).toHaveLength(3)
    await page.getByTestId('ready-show-all').click()
    await expect(page.getByRole('dialog').locator('[data-testid^="ready-row-"]')).toHaveCount(4)
  })
})
