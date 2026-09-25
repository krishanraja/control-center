import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * The decide surface: one piece, one decision, a reason for it.
 *
 * THE THREE THINGS THIS FILE EXISTS TO HOLD, all of them Krish's rulings and
 * none of them visible in a screenshot:
 *
 * 1. NOTHING MOVES WHEN A BUTTON IS PRESSED. "There should be an element of
 *    stability and predictability behind any interaction." The probe records
 *    the geometry of the claim, the facts and the channel row, presses, and
 *    records again. It caught a 29px footer growth and a 169px layer jump that
 *    both looked fine in a still.
 *
 * 2. EVERY DECISION CARRIES panel_run_id. judge_calibration has returned
 *    nothing since 2026-09-09 because no surface ever sent it, so the panel has
 *    been scoring for a year and has never been scored back. The spec asserts
 *    on the request body, not on the UI, because a receipt that says "recorded"
 *    over a request that carried no run id is exactly the class of lie this
 *    repo keeps finding.
 *
 * 3. DEPTH REPLACES, IT NEVER EXTENDS. Each layer occupies the same box as the
 *    card. A layer that is taller resizes the panel, which is a jump.
 *
 * The fixture is the shape api/judge/ladder.ts really writes. In particular the
 * eight per-judge scores are NOT on the idea row: they are fetched from
 * judge_verdicts on panel_run_id only when the Scores layer opens, so the mock
 * serves them separately and the spec proves the fetch happens.
 */

test.use({ viewport: { width: 1440, height: 900 } })

const RUN_ID = '3f1c9a2e-5d44-4a7b-9c11-6b2e8f0a7d33'

const ladder = (o: { band: string; score: number; weakest: string; angle?: string; winner?: string; disagrees?: boolean }) => ({
  roster_version: 'panel-v2',
  judged_at: '2026-09-24T09:00:00Z',
  first: { score: o.score, weakest: o.weakest, band: o.band },
  final: { score: o.score, weakest: o.weakest, band: o.band },
  expansion: o.angle
    ? { angle: o.angle, parties: ['the lab', 'the buyer'], scenarios: 2, decision_rule: true, known: 3, inferred: 2 }
    : { failed: 'the model returned unparseable JSON' },
  attempts: [{
    n: 1, outcome: 'declined', detail: 'No named builder exists in what it read.',
    score_before: o.score, score_after: o.score, weakest_before: o.weakest,
    researched: true, sources: ['https://example.org/a', 'https://example.org/b'], briefed: 7,
  }],
  panel_run_id: RUN_ID,
  router: { fits: { mind_the_gap: 4, follow_the_money: 3, under_the_hood: 6 }, winner: o.winner || 'under_the_hood', contested: [], why: 'x' },
  router_disagrees: o.disagrees === true,
})

const row = (id: string, idea: string, l: unknown, lane: string | null = null) => ({
  id, idea, thesis: 'Jev reads as a cheaper model. The useful reading is different.',
  body: null, source_type: 'pool_headline', state: 'seeded', lane_slot: lane,
  created_at: '2026-09-22T10:00:00Z', updated_at: '2026-09-24T09:00:00Z',
  buried_at: null, library_at: null, origin: 'agent', horizon: 'news', meta: { ladder: l },
})

const IDEAS = [
  row('i1', 'Jev proves the agent stack should be split by decision type', ladder({
    band: 'repairable', score: 6, weakest: 'consequence',
    angle: 'Most agent stacks never split decisions by type, and that is what Jev actually proves.',
    winner: 'under_the_hood', disagrees: true,
  }), 'mind_the_gap'),
  row('i2', 'A second piece waiting', ladder({ band: 'repairable', score: 5, weakest: 'reader', angle: 'A second angle.' })),
  // Ready and weak must never appear in the decide queue.
  row('i3', 'Already cleared', ladder({ band: 'ready', score: 8, weakest: 'novelty', angle: 'Cleared.' })),
  row('i4', 'Could not be lifted', ladder({ band: 'weak', score: 3, weakest: 'standing', angle: 'Weak.' })),
]

const VERDICTS = [
  { judge: 'consequence', score: 3, verdict: 'revise', the_one_fix: 'Name the decision it changes.', evidence: ['e'], deterministic: false },
  { judge: 'novelty', score: 7, verdict: 'pass', the_one_fix: null, evidence: ['e'], deterministic: false },
  { judge: 'evidence', score: 7, verdict: 'pass', the_one_fix: null, evidence: ['e'], deterministic: false },
  { judge: 'prosecutor', score: 6, verdict: 'kill', the_one_fix: 'It dates badly once a build ships.', evidence: ['e'], deterministic: false },
]

const calmMorning = {
  id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green',
  one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false,
}

/** Returns the bodies POSTed to the ledger, so the spec can assert on what
 *  reached the wire rather than on what the receipt claims. */
async function mock(page: Page, ideas: unknown[] = IDEAS) {
  const posted: Record<string, unknown>[] = []
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
  // registration order, so the other way round the catch-all shadows these.
  await page.route('**/rest/v1/content_ideas*', (r: Route) => r.fulfill({ json: ideas }))
  await page.route('**/rest/v1/judge_verdicts*', (r: Route) => r.fulfill({ json: VERDICTS }))
  await page.route('**/api/content-edits', (r: Route) => {
    try { posted.push(JSON.parse(r.request().postData() || '{}')) } catch { /* recorded as absent */ }
    return r.fulfill({ json: { ok: true } })
  })
  return posted
}

const openDecide = async (page: Page) => {
  await page.goto('/#/content')
  await page.getByTestId('content-room-decide').click()
  await expect(page.getByTestId('decide-card')).toBeVisible()
}

test.describe('the decide surface', () => {
  test('leads with the argument, not the seed or a score', async ({ page }) => {
    await mock(page)
    await openDecide(page)
    // The expansion's angle is what the panel judged. Showing the seed while
    // attributing a verdict on the argument to it would be a small lie.
    await expect(page.getByTestId('decide-claim'))
      .toHaveText('Most agent stacks never split decisions by type, and that is what Jev actually proves.')
    await expect(page.getByTestId('decide-card')).not.toContainText('/10')
  })

  test('only shows pieces the machine could not finish', async ({ page }) => {
    await mock(page)
    await openDecide(page)
    const card = page.getByTestId('decide-card')
    await expect(card).not.toContainText('Already cleared')
    await expect(card).not.toContainText('Could not be lifted')
  })

  test('states where the router disagrees with the filing', async ({ page }) => {
    await mock(page)
    await openDecide(page)
    await expect(page.getByTestId('decide-disagrees')).toContainText('under_the_hood')
  })

  test('nothing above the footer moves when a button is pressed', async ({ page }) => {
    await mock(page)
    await openDecide(page)
    const box = async () => page.evaluate(() => {
      const card = document.querySelector('[data-testid="decide-card"]')!.getBoundingClientRect()
      const o: Record<string, number[]> = { card: [Math.round(card.height)] }
      for (const sel of ['decide-claim', 'decide-facts', 'decide-channels']) {
        const e = document.querySelector(`[data-testid="${sel}"]`)
        // Relative to the card, not the viewport: clicking scrolls the button
        // into view, and a page that scrolls 5px is not the layout moving.
        if (e) { const r = e.getBoundingClientRect(); o[sel] = [Math.round(r.top - card.top), Math.round(r.height)] }
      }
      return o
    })
    const before = await box()
    // All three, because the reason sets differ in size: five chips for a
    // decline, five for an approve, four and a longer question for a reroute.
    // Reserving for one and not the others would leave the jump in place on
    // whichever is tallest.
    for (const press of ['decide-bin', 'decide-write', 'decide-channel-follow_the_money'] as const) {
      await page.getByTestId(press).click()
      await expect(page.getByTestId('decide-why')).toBeVisible()
      expect(await box()).toEqual(before)
      await page.getByTestId('decide-why').getByRole('button', { name: 'Back' }).click()
      expect(await box()).toEqual(before)
    }
  })

  test('a depth layer is the same box as the card it replaces', async ({ page }) => {
    await mock(page)
    await openDecide(page)
    // Offset within the scrolling pane, so opening a door (which scrolls the
    // control into view) does not read as the panel moving.
    const geom = (sel: string) => page.evaluate((s) => {
      const e = document.querySelector(s)!
      const r = e.getBoundingClientRect()
      return [Math.round(r.top + window.scrollY), Math.round(r.height)]
    }, sel)
    const card = await geom('[data-testid="decide-card"]')
    for (const door of ['topic', 'scores', 'origin']) {
      await page.getByTestId(`decide-door-${door}`).click()
      expect(await geom(`[data-testid="decide-layer-${door}"]`)).toEqual(card)
      await page.getByTestId('decide-back').click()
    }
  })

  test('the scores layer fetches the eight verdicts and reports the prosecutor apart', async ({ page }) => {
    await mock(page)
    await openDecide(page)
    await page.getByTestId('decide-door-scores').click()
    const layer = page.getByTestId('decide-layer-scores')
    await expect(layer).toContainText('consequence')
    // Beside the panel, never inside it: a strong objection must not read as
    // a strong endorsement.
    await expect(layer).toContainText('Arguing to kill it')
  })

  test('a decision carries panel_run_id and the reason code to the ledger', async ({ page }) => {
    const posted = await mock(page)
    await openDecide(page)
    await page.getByTestId('decide-bin').click()
    await page.getByTestId('reason-nothing_to_prove_it').click()
    await page.getByTestId('decide-commit').click()
    await expect(page.getByTestId('decide-receipt')).toBeVisible()

    expect(posted).toHaveLength(1)
    const e = posted[0]!
    expect(e.action).toBe('binned')
    expect(e.surface).toBe('triage')
    // THE KEYSTONE. Without this the weekly compiler has nothing to join on
    // and the panel is never graded.
    expect(e.panel_run_id).toBe(RUN_ID)
    expect(e.reason_code).toBe('nothing_to_prove_it')
  })

  test('moving a subchannel records both sides of the disagreement', async ({ page }) => {
    const posted = await mock(page)
    await openDecide(page)
    await page.getByTestId('decide-channel-follow_the_money').click()
    await page.getByTestId('reason-it_is_about_money').click()
    await page.getByTestId('decide-commit').click()

    expect(posted).toHaveLength(1)
    const e = posted[0]!
    expect(e.action).toBe('manual_edit')
    expect(e.mode).toBe('lane_slot')
    expect(e.value).toBe('follow_the_money')
    expect(e.panel_run_id).toBe(RUN_ID)
    // change_has_result: the table refuses a change with no result, so both
    // hashes must be real or the row never lands.
    expect(String(e.before_hash)).toMatch(/^[a-f0-9]{64}$/)
    expect(String(e.after_hash)).toMatch(/^[a-f0-9]{64}$/)
  })

  test('a piece the machine could not work up says so instead of rendering a hole', async ({ page }) => {
    await mock(page, [row('i9', 'A seed with no expansion', ladder({ band: 'repairable', score: 6, weakest: 'reader' }))])
    await openDecide(page)
    await expect(page.getByTestId('decide-no-expansion')).toBeVisible()
    await expect(page.getByTestId('decide-facts')).toHaveCount(0)
  })

  test('deciding advances to the next piece rather than handing back the same one', async ({ page }) => {
    await mock(page)
    await openDecide(page)
    await page.getByTestId('decide-bin').click()
    await page.getByTestId('decide-commit').click()
    await page.getByTestId('decide-receipt').getByRole('button', { name: 'Next piece' }).click()
    await expect(page.getByTestId('decide-claim')).toHaveText('A second angle.')
  })
})
