import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * The Home intel drawer (#/home → the Intel pill). Pins three things:
 *
 * 1. Home carries a door into the daily intel on both shells, and the drawer
 *    shows the curated set: headline, ranked signals, one "Open Intel" row.
 * 2. A signal opens the same sheet the Intel tab uses (why it matters + the
 *    two actions), so acting on intel from Home is one tap, not a navigation.
 * 3. The "Open Intel" row lands on OS → Intel, where the heavy surface lives.
 *
 * Same mocking pattern as focus-purpose.spec.ts: catch-alls first (Playwright
 * matches in reverse registration order), then the specific routes.
 */

const INTEL_ROW = {
  summary: {
    headline: 'Enterprise AI services are consolidating into certified mega-integrators.',
    recommended_focus: 'Ship the licensing memo.',
  },
  external_signals: [
    {
      signal: 'Four retailers named their first Chief AI Officer this cycle',
      relevance: 'The buyer role Mindmaker sells to is becoming standard in retail.',
      recommended_action: 'Draft the CAIO outreach note',
      source: 'Marcus sweep',
      urgency: 'high',
      days_until: 3,
    },
    {
      signal: 'UK redundancy warnings hit a five-year high among senior executives',
      relevance: 'The senior-exec talent pool for Fractionl Circle just expanded.',
      urgency: 'medium',
    },
    {
      signal: 'A mid-market bank published its model-risk playbook',
      relevance: 'Reference material for the governance workshop.',
      urgency: 'low',
    },
  ],
  generated_at: new Date().toISOString(),
}

const calmMorning = {
  id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green',
  one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false,
}

const AFTERNOON = new Date('2026-08-20T18:30:00Z') // 14:30 New York

async function mock(page: Page) {
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/pilot/timezone', (r: Route) =>
    r.fulfill({ json: { ok: true, timezone: 'America/New_York' } }))
  await page.route('**/api/pilot/checkin*', (r: Route) => {
    const tz = new URL(r.request().url()).searchParams.get('tz') || 'America/New_York'
    return r.fulfill({
      json: {
        ok: true, morning: calmMorning, last_evening: null, evening_done_today: true,
        yesterday: null, timezone: 'America/New_York',
        today: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()),
      },
    })
  })
  await page.route('**/rest/v1/home_intelligence*', (r: Route) => r.fulfill({ json: INTEL_ROW }))
  // An explicitly empty spend summary: the drawer's money line and the door
  // dot render nothing, so the four assertions above stay about the signals.
  // (The generic **/api/** {ok:true} would be rejected by useSpend's shape
  // check anyway; this pins the intended quiet state.)
  await page.route('**/api/spend', (r: Route) => r.fulfill({
    json: {
      ok: true, month_usd: 0, avg_3mo_usd: 0, delta_pct: null, ballooning: false,
      months: [], services: [], unmatched: [],
      connections: { ok: 0, low: 0, broken: 0, critical_broken: 0, unchecked: 0, broken_names: [], low_names: [] },
      renewals_due: [], needs_review: 0, meter: null, empty: true, as_of: new Date().toISOString(),
    },
  }))
}

test.describe('the home intel drawer', () => {
  test('opens from the desktop door with the headline, the signals and the way deeper', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page)
    await page.goto('/#/home')

    await page.getByTestId('intel-door').click()
    await expect(page.getByText('Enterprise AI services are consolidating')).toBeVisible()
    await expect(page.getByText('UK redundancy warnings hit a five-year high', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: /Open Intel/ })).toBeVisible()
    await ctx.close()
  })

  test('a signal opens the acting sheet, not a navigation', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page)
    await page.goto('/#/home')

    await page.getByTestId('intel-door').click()
    await page.getByText('UK redundancy warnings hit a five-year high').click()
    await expect(page.getByText(/Why it matters: The senior-exec talent pool/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create task' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add to bets' })).toBeVisible()
    expect(page.url()).toContain('#/home')
    await ctx.close()
  })

  test('the open-intel row lands on OS → Intel', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page)
    await page.goto('/#/home')

    await page.getByTestId('intel-door').click()
    await page.getByRole('button', { name: /Open Intel/ }).click()
    await expect(page).toHaveURL(/os\?sub=intel/)
    await ctx.close()
  })

  test('the mobile doors row carries both pills and the drawer opens', async ({ browser }) => {
    const ctx = await browser.newContext({
      timezoneId: 'America/New_York',
      viewport: { width: 390, height: 844 },
    })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page)
    await page.goto('/#/home')

    await expect(page.getByTestId('vitals-focus')).toBeVisible()
    await page.getByTestId('intel-door').click()
    await expect(page.getByText('Enterprise AI services are consolidating')).toBeVisible()
    await ctx.close()
  })

  test('the doors survive the shortest supported phone', async ({ browser }) => {
    // The old full-width Focus door hid below 840px CSS height. The pills live
    // in the + button's reclaimed band, so they no longer cost the canon a row
    // and must be present even at 360x800.
    const ctx = await browser.newContext({
      timezoneId: 'America/New_York',
      viewport: { width: 360, height: 800 },
    })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page)
    await page.goto('/#/home')

    await expect(page.getByTestId('vitals-focus')).toBeVisible()
    await expect(page.getByTestId('intel-door')).toBeVisible()
    await ctx.close()
  })
})
