import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * External market intelligence off Home — the head-space split (Krish's
 * mock-gate calls, 2026-08-25/26): internal business intelligence lives on
 * OS → Intel; the external feed lives behind a pure door, and NO market
 * content ever renders on Home itself. Pins:
 *
 * 1. The Market signals door is a permanent peer in the bottom doors panel
 *    (Focus · Market signals · Intel) — doorway language only (a word; no
 *    signal text, no counts). A quiet feed keeps the door and its own empty
 *    state inside; a hot feed earns a status dot, never a count.
 * 2. The door opens the signals drawer with the full ranked digest; a drawer
 *    row opens the acting sheet (why it matters + task or bet), never a
 *    navigation.
 * 3. Home's face carries no signal content: the signal text appears only
 *    inside the drawer, quiet feed or hot.
 * 4. A market signal can be declined from the drawer, and it leaves the feed.
 * 5. The Intel door is the internal path: it lands on OS → Intel directly.
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

// Same digest with nothing hot: the door stays, its hot dot does not.
const QUIET_ROW = {
  ...INTEL_ROW,
  external_signals: INTEL_ROW.external_signals.filter(s => s.urgency !== 'high'),
}

// One raw market signal from Zara's feed, declinable in the drawer.
const ZARA_SIGNALS = [
  {
    id: 'z1',
    signal_type: 'buyer-signal',
    venture: 'mindmaker',
    company_name: 'Wells Fargo',
    description: 'A named C-suite AI leadership move at a major legacy bank.',
    source_url: null,
    signal_score: 5,
    status: 'received',
    surfaced_at: new Date().toISOString(),
    summary: null,
  },
]

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
  test('a fresh hot digest earns the door; the drawer acts without navigating; Home shows no signal text', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page)
    await page.goto('/#/home')

    // The door is there; the signal's words are NOT on Home's face.
    const door = page.getByTestId('signals-door')
    await expect(door).toBeVisible()
    await expect(page.getByText('Four retailers named their first Chief AI Officer', { exact: false })).toHaveCount(0)

    await door.click()
    // The full ranked digest lives in the drawer, quiet signals included.
    await expect(page.getByText('Four retailers named their first Chief AI Officer', { exact: false })).toBeVisible()
    await expect(page.getByText('UK redundancy warnings hit a five-year high', { exact: false })).toBeVisible()
    await expect(page.getByText('A mid-market bank published its model-risk playbook', { exact: false })).toBeVisible()

    await page.getByText('UK redundancy warnings hit a five-year high', { exact: false }).click()
    await expect(page.getByText(/Why it matters: The senior-exec talent pool/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create task' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add to bets' })).toBeVisible()
    expect(page.url()).toContain('#/home')
    await ctx.close()
  })

  test('a quiet feed keeps the door but never leaks signal text onto Home', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page, QUIET_ROW)
    await page.goto('/#/home')

    // The door is a permanent peer now, present even when nothing is hot.
    await expect(page.getByTestId('vitals-focus')).toBeVisible()
    await expect(page.getByTestId('signals-door')).toBeVisible()
    // Home's face still carries no signal content — the drawer owns it.
    await expect(page.getByText('A mid-market bank published its model-risk playbook', { exact: false })).toHaveCount(0)
    await ctx.close()
  })

  test('a market signal can be declined, and it leaves the feed', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page)
    // Registered after mock()'s catch-alls, so it wins for zara_signals reads.
    await page.route('**/rest/v1/zara_signals*', (r: Route) => r.fulfill({ json: ZARA_SIGNALS }))
    await page.goto('/#/home')

    await page.getByTestId('signals-door').click()
    const row = page.getByText('A named C-suite AI leadership move', { exact: false })
    await expect(row).toBeVisible()

    // Decline writes through /api/triage/reject (the **/api/** catch-all in
    // mock() answers { ok: true }); the row leaves the feed optimistically.
    await page.getByRole('button', { name: 'Decline this signal' }).click()
    await expect(row).toHaveCount(0)
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

  test('the signals door and the doors row survive the shortest supported phone', async ({ browser }) => {
    // All three doors (Focus · Market signals · Intel) share the + button's
    // reclaimed band as compact peers — all must be present at 360x800.
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
    await expect(page.getByTestId('signals-door')).toBeVisible()
    await ctx.close()
  })
})
