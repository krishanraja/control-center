import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * External market intelligence off Home — the head-space split (Krish's
 * mock-gate call, 2026-08-25): internal business intelligence lives on
 * OS → Intel; what the outside world is doing lives condensed on Home.
 * Pins four things:
 *
 * 1. When Marcus's digest is fresh and carries a high/critical signal, Home
 *    shows the swipeable signal-cards row; a quiet digest renders nothing —
 *    the conditional-presence contract (same as the critical alert banner).
 * 2. A card opens the acting sheet (why it matters + task or bet), not a
 *    navigation.
 * 3. The "All signals" card opens the signals drawer with the full ranked
 *    digest, including the signals too quiet for a card.
 * 4. The Intel door is the internal path: it lands on OS → Intel directly.
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

// Same digest with nothing hot: the cards row must not spend Home's space.
const QUIET_ROW = {
  ...INTEL_ROW,
  external_signals: INTEL_ROW.external_signals.filter(s => s.urgency !== 'high'),
}

const calmMorning = {
  id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green',
  one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false,
}

const AFTERNOON = new Date('2026-08-20T18:30:00Z') // 14:30 New York

async function mock(page: Page, intelRow: unknown = INTEL_ROW) {
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
  await page.route('**/rest/v1/home_intelligence*', (r: Route) => r.fulfill({ json: intelRow }))
  // An explicitly empty spend summary: the door dot stays dark, so these
  // assertions stay about the signals. (The generic **/api/** {ok:true}
  // would be rejected by useSpend's shape check anyway; this pins the
  // intended quiet state.)
  await page.route('**/api/spend', (r: Route) => r.fulfill({
    json: {
      ok: true, month_usd: 0, avg_3mo_usd: 0, delta_pct: null, ballooning: false,
      months: [], services: [], unmatched: [],
      connections: { ok: 0, low: 0, broken: 0, critical_broken: 0, unchecked: 0, broken_names: [], low_names: [] },
      renewals_due: [], needs_review: 0, meter: null, empty: true, as_of: new Date().toISOString(),
    },
  }))
}

test.describe('external market intelligence off Home', () => {
  test('a fresh hot digest earns the cards row; a card opens the acting sheet, not a navigation', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page)
    await page.goto('/#/home')

    const cards = page.getByTestId('signal-cards')
    await expect(cards).toBeVisible()
    // Only the hot signal earns a card; the medium one waits in the drawer.
    await expect(cards.getByText('Four retailers named their first Chief AI Officer', { exact: false })).toBeVisible()
    await expect(cards.getByText('UK redundancy warnings', { exact: false })).toHaveCount(0)

    await cards.getByText('Four retailers named their first Chief AI Officer', { exact: false }).click()
    await expect(page.getByText(/Why it matters: The buyer role Mindmaker sells to/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create task' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add to bets' })).toBeVisible()
    expect(page.url()).toContain('#/home')
    await ctx.close()
  })

  test('the all-signals card opens the drawer with the full ranked digest', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page)
    await page.goto('/#/home')

    await page.getByTestId('signal-cards-all').click()
    // The quiet signals live here, ranked under the hot one.
    await expect(page.getByText('UK redundancy warnings hit a five-year high', { exact: false })).toBeVisible()
    await expect(page.getByText('A mid-market bank published its model-risk playbook', { exact: false })).toBeVisible()
    expect(page.url()).toContain('#/home')
    await ctx.close()
  })

  test('a quiet digest spends no Home glass at all', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page, QUIET_ROW)
    await page.goto('/#/home')

    await expect(page.getByTestId('vitals-focus')).toBeVisible()
    await expect(page.getByTestId('signal-cards')).toHaveCount(0)
    await ctx.close()
  })

  test('the intel door is the internal path: it lands on the console', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page)
    await page.goto('/#/home')

    await page.getByTestId('intel-door').click()
    await expect(page).toHaveURL(/os\?sub=intel/)
    await expect(page.getByRole('heading', { name: 'Business Intelligence' })).toBeVisible()
    await ctx.close()
  })

  test('the cards row and the doors survive the shortest supported phone', async ({ browser }) => {
    // The pills live in the + button's reclaimed band and the cards row is a
    // single compact band above the canon — both must be present at 360x800.
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
    await expect(page.getByTestId('signal-cards')).toBeVisible()
    await ctx.close()
  })
})
