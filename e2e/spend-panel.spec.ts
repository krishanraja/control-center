import { test, expect, type Page, type Route } from '@playwright/test'
import { answerPilotGate } from './pilot-gate-mock'

/**
 * The spend and connections truth on the Business Intelligence
 * interrogation: "What is it costing?" carries the month against the usual
 * (the pinned $1,284), "What is broken?" names the API that needs a hand
 * with its who-spent-it line and the sweep trigger, the ranked detail sheet
 * hangs off the costing answer, and the Home door dot stays the sanctioned
 * exception to "doors carry no numbers" (a dot, still never a number).
 *
 * Catch-alls first (reverse registration order), fixtures module-level.
 */

// Fixed afternoon so the pilot gate's morning check-in can never fire on
// wall clock — the spec used to pass or fail with the time of day. Every
// relative date in the fixtures hangs off THIS instant, not the real now.
export const AFTERNOON = new Date('2026-08-20T18:30:00Z')

const SPEND_FULL = {
  ok: true,
  month_usd: 1284,
  avg_3mo_usd: 1040,
  delta_pct: 23,
  ballooning: false,
  months: [
    { month: '2026-03', total_usd: 980 },
    { month: '2026-04', total_usd: 1010 },
    { month: '2026-05', total_usd: 990 },
    { month: '2026-06', total_usd: 1055 },
    { month: '2026-07', total_usd: 1075 },
    { month: '2026-08', total_usd: 1284 },
  ],
  services: [
    {
      key: 'anthropic', name: 'Anthropic', category: 'llm', criticality: 'critical',
      month_usd: 336.52, avg_usd: 330, cadence: 'monthly', plan_label: 'Max plan - 20x',
      last_paid_at: '2026-08-20', next_renewal_on: '2026-09-20', status: 'ok',
      balance: null, balance_unit: null, balance_low: false,
      last_checked_at: new Date().toISOString(),
      top_up_url: 'https://console.anthropic.com/settings/billing', dashboard_url: 'https://console.anthropic.com',
    },
    {
      key: 'apify', name: 'Apify', category: 'data', criticality: 'critical',
      month_usd: 320, avg_usd: 300, cadence: 'monthly', plan_label: null,
      last_paid_at: '2026-08-22', next_renewal_on: '2026-09-22', status: 'ok',
      balance: 12.4, balance_unit: 'usd', balance_low: false,
      last_checked_at: new Date().toISOString(),
      top_up_url: 'https://console.apify.com/billing', dashboard_url: 'https://console.apify.com',
    },
    {
      key: 'openai', name: 'OpenAI', category: 'llm', criticality: 'critical',
      month_usd: 96, avg_usd: 88, cadence: 'monthly', plan_label: null,
      last_paid_at: '2026-08-14', next_renewal_on: '2026-09-14', status: 'exhausted',
      balance: null, balance_unit: null, balance_low: false,
      last_checked_at: new Date().toISOString(),
      top_up_url: 'https://platform.openai.com/settings/organization/billing', dashboard_url: 'https://platform.openai.com',
    },
    {
      key: 'elevenlabs', name: 'ElevenLabs', category: 'media', criticality: 'low',
      month_usd: 0, avg_usd: 22, cadence: 'monthly', plan_label: null,
      last_paid_at: '2026-07-30', next_renewal_on: '2026-08-30', status: 'ok',
      balance: 2100, balance_unit: 'characters', balance_low: true,
      last_checked_at: new Date().toISOString(),
      top_up_url: 'https://elevenlabs.io/app/subscription', dashboard_url: 'https://elevenlabs.io/app',
    },
  ],
  unmatched: [{ vendor: 'DataForSEO', month_usd: 54.44 }],
  connections: {
    ok: 9, low: 1, broken: 1, critical_broken: 1, unchecked: 12,
    broken_names: ['OpenAI'], low_names: ['ElevenLabs'],
  },
  renewals_due: [
    { key: 'relume', name: 'Relume', amount: 348, currency: 'USD', on: new Date(AFTERNOON.getTime() + 12 * 86_400_000).toISOString().slice(0, 10) },
  ],
  needs_review: 2,
  meter: { usd_mtd: 41, calls_mtd: 1204 },
  empty: false,
  as_of: new Date().toISOString(),
}

const SPEND_EMPTY = {
  ok: true, month_usd: 0, avg_3mo_usd: 0, delta_pct: null, ballooning: false,
  months: [], services: [], unmatched: [],
  connections: { ok: 0, low: 0, broken: 0, critical_broken: 0, unchecked: 0, broken_names: [], low_names: [] },
  renewals_due: [], needs_review: 0, meter: null, empty: true, as_of: new Date().toISOString(),
}


async function mock(page: Page, spend: unknown = SPEND_FULL) {
  await page.clock.setFixedTime(AFTERNOON)
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await answerPilotGate(page)
  await page.route('**/api/spend', (r: Route) => r.fulfill({ json: spend }))
  await page.route('**/rest/v1/home_intelligence*', (r: Route) => r.fulfill({
    json: {
      summary: { headline: 'Quiet morning.' },
      external_signals: [],
      metrics: [],
      generated_at: new Date().toISOString(),
    },
  }))
}

test.describe('the spend and connections questions', () => {
  test('the phone glance answers costing and broken without a tap', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await mock(page)
    await page.goto('/#/os?sub=intel')

    const list = page.getByTestId('bi-questions')
    await expect(list).toBeVisible()
    // toBeVisible passes for a collapsed sliver; pin real height so a
    // compressed list can never read as rendered.
    expect((await list.boundingBox())!.height).toBeGreaterThan(200)
    await expect(page.getByTestId('spend-month-total')).toHaveText('$1,284')
    await expect(list.getByText(/usual/)).toBeVisible()
    // The broken answer names the API on the closed line — no tap needed.
    await expect(page.getByTestId('bi-q-broken')).toContainText('OpenAI is out of credits')
    await ctx.close()
  })

  test('desktop opens on the decide question with the renewal on the board', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await mock(page)
    await page.goto('/#/os?sub=intel')

    await expect(page.getByRole('heading', { name: 'Business Intelligence' })).toBeVisible()
    await expect(page.getByTestId('spend-month-total')).toHaveText('$1,284')
    // The decide pane is the default open answer; the renewal rides in it.
    await expect(page.getByTestId('bi-pane')).toContainText(/Relume renews in 1[12] days/)
    // The costing answer opens with the unreadable-receipts line.
    await page.getByTestId('bi-q-costing').click()
    await expect(page.getByTestId('spend-review-line')).toContainText('2 receipts could not be read')
    await ctx.close()
  })

  test('the detail sheet ranks every service by money and links the fix', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await mock(page)
    await page.goto('/#/os?sub=intel')

    await page.getByTestId('bi-q-costing').click()
    await page.getByTestId('spend-panel-open').click()
    const sheet = page.getByTestId('spend-detail')
    await expect(sheet).toBeVisible()
    // Server pre-ranks by month cost; the first paying row is the top spender.
    await expect(sheet.getByText('Anthropic', { exact: false }).first()).toBeVisible()
    await expect(sheet.getByText('Max plan - 20x')).toBeVisible()
    await expect(sheet.getByLabel('Open OpenAI')).toHaveAttribute('href', 'https://platform.openai.com/settings/organization/billing')
    await expect(sheet.getByText('DataForSEO')).toBeVisible()
    await ctx.close()
  })

  test('Check now arms the sweep and refetches', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await mock(page)
    let swept = 0
    await page.route('**/api/health/connections-sweep', (r: Route) => {
      swept++
      return r.fulfill({ json: { ok: true, checked: 30 } })
    })
    await page.goto('/#/os?sub=intel')

    await page.getByTestId('bi-q-broken').click()
    // The broken answer carries the who-spent-it attribution line.
    await expect(page.getByTestId('bi-pane')).toContainText('No calls metered by the Control Center')
    await page.getByTestId('spend-check-now').click()
    await expect.poll(() => swept).toBeGreaterThan(0)
    await ctx.close()
  })

  test('the door dot fires and the door lands on the console with the month', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await mock(page)
    await page.goto('/#/home')

    // The door dot: rose because a critical connection is broken. The door
    // is the internal path — one tap from the alert to the console.
    await expect(page.getByTestId('intel-door-dot')).toBeVisible()

    await page.getByTestId('intel-door').click()
    await expect(page).toHaveURL(/os\?sub=intel/)
    await expect(page.getByTestId('spend-month-total')).toHaveText('$1,284')
    await ctx.close()
  })

  test('an empty summary stays quiet: no dot, no fake zero', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await mock(page, SPEND_EMPTY)
    await page.goto('/#/home')

    await expect(page.getByTestId('intel-door')).toBeVisible()
    await expect(page.getByTestId('intel-door-dot')).toHaveCount(0)

    await page.goto('/#/os?sub=intel')
    const list = page.getByTestId('bi-questions')
    await expect(list).toBeVisible()
    await expect(list.getByText(/No receipts read/)).toBeVisible()
    await expect(page.getByTestId('spend-month-total')).toHaveCount(0)
    await ctx.close()
  })
})
