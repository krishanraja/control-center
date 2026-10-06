import { test, expect, type Page, type Route } from '@playwright/test'
import { WEB_INSIGHTS, WEB_TOO_SOON } from './fixtures/webInsights'

/**
 * Growth, Numbers, on the desk (1440 and 1920): Full Time's pilot listeners
 * against the target of 100. Rulings (Krish, 2026-10-06): "yes and 100", and
 * Full Time's pilot listeners and Mindmake's pilot customers "are TOTALLY
 * unrelated and cannot be confused with one another".
 *
 * The contract: the count and the target at a glance, honest emptiness ("Not
 * connected" before the copy has worked, never "0 of 100"), one next thing to
 * do, and a count that no other product's rows can move.
 */

const NOW = new Date().toISOString()
const listener = (id: string, test = false) => ({
  id: `c-${id}`, product: 'full_time', kind: 'free_signup', email: null, full_name: null, source: 'fulltime_accounts',
  raw: { fulltime_user_id: id, pilot_listener: true, test_account: test, on_launch_list: false, fulltime_plan: 'free' },
  created_at: NOW, updated_at: NOW,
})
// Rows that must never reach the listener count: Mindmake's, the publication's
// and Full Time's own Stripe row.
const OTHERS = [
  { id: 'c-mm', product: 'mindmake', kind: 'free_signup', email: 'leader@agency.co', full_name: 'A Leader', source: 'audience', raw: null, created_at: NOW, updated_at: NOW },
  { id: 'c-pub', product: 'publication', kind: 'paid', email: 'reader@paper.co', full_name: 'A Reader', source: 'stripe_sync', raw: null, mrr_usd: 8, created_at: NOW, updated_at: NOW },
  { id: 'c-ftpaid', product: 'full_time', kind: 'paid', email: 'fan@club.co', full_name: 'A Fan', source: 'stripe_sync', raw: null, created_at: NOW, updated_at: NOW },
]

async function mock(page: Page, opts: { customers: unknown[]; runs: unknown[] }) {
  // Catch-alls first: Playwright checks handlers in REVERSE registration order.
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/rest/v1/**', (r: Route) => {
    const url = r.request().url()
    const table = (url.match(/\/rest\/v1\/([a-z_]+)/) || [])[1] || ''
    if (table === 'customers') return r.fulfill({ json: opts.customers })
    if (table === 'workflow_runs' && url.includes('cc-fulltime-listeners')) return r.fulfill({ json: opts.runs })
    return r.fulfill({ json: [] })
  })
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/api/pilot/timezone', (r: Route) => r.fulfill({ json: { ok: true, timezone: 'Europe/London' } }))
  await page.route('**/api/pilot/checkin*', (r: Route) => r.fulfill({ json: {
    ok: true,
    morning: { id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green', one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false },
    last_evening: null, evening_done_today: true, yesterday: null, timezone: 'Europe/London',
    today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()),
  } }))
  await page.route('**/api/growth/web-insights*', (r: Route) => {
    if (r.request().method() === 'POST') return r.fulfill({ status: 429, json: WEB_TOO_SOON })
    return r.fulfill({ json: WEB_INSIGHTS })
  })
}

async function openNumbers(page: Page) {
  await page.goto('/#/growth?section=numbers')
  // The Growth chunk loads lazily; the first paint can take longer than 5s on a cold preview.
  await expect(page.getByTestId('growth-numbers-portfolio')).toBeVisible({ timeout: 20_000 })
}

test('the count against 100, from listener rows only', async ({ page }) => {
  await mock(page, {
    customers: [listener('u1'), listener('u2'), listener('u3'), listener('qa', true), ...OTHERS],
    runs: [{ status: 'success', run_at: NOW, outcome: '3 of 100 pilot listeners. Nothing new since the last copy.', error_message: null }],
  })
  await openNumbers(page)
  const goal = page.getByTestId('growth-listener-goal')
  await expect(goal).toBeVisible()
  await expect(page.getByTestId('growth-listener-count')).toHaveText(/^3\s*of 100 pilot listeners$/)
  await expect(goal.getByRole('img', { name: '3 of 100 pilot listeners' })).toBeVisible()
  await expect(page.getByTestId('growth-listener-line')).toContainText('97 to go.')
  await expect(page.getByTestId('growth-listener-next')).toContainText('Ask five football fans you know to make a free Full Time account.')
  await expect(page.getByTestId('growth-listener-copied')).toBeVisible()
  // The same number on the board row, and never the words "pilot customers".
  await expect(page.getByTestId('portfolio-row-full_time')).toContainText('3 of 100')
  await expect(goal).not.toContainText(/pilot customers/i)
})

test('before the copy has worked: not connected, the one step, and no zero', async ({ page }) => {
  await mock(page, { customers: OTHERS, runs: [] })
  await openNumbers(page)
  await expect(page.getByTestId('growth-listener-count')).toHaveText('Not connected')
  await expect(page.getByTestId('growth-listener-line')).toContainText('has not run yet')
  await expect(page.getByTestId('growth-listener-next')).toContainText('read key for Full Time')
  await expect(page.getByTestId('growth-listener-goal').getByRole('img')).toHaveCount(0)
  await expect(page.getByTestId('growth-listener-goal')).not.toContainText('0 of 100')
  await expect(page.getByTestId('portfolio-row-full_time')).not.toContainText('0 of 100')
})

test('a failed copy is said, and the last good count still stands', async ({ page }) => {
  await mock(page, {
    customers: [listener('u1'), ...OTHERS],
    runs: [
      { status: 'error', run_at: NOW, outcome: 'The Full Time copy failed: Full Time refused the read key (HTTP 401)', error_message: 'Full Time refused the read key (HTTP 401)' },
      { status: 'success', run_at: '2026-10-06T06:25:00Z', outcome: '1 of 100 pilot listeners.', error_message: null },
    ],
  })
  await openNumbers(page)
  await expect(page.getByTestId('growth-listener-count')).toHaveText(/^1\s*of 100 pilot listeners$/)
  await expect(page.getByTestId('growth-listener-line')).toContainText('refused the read key')
})
