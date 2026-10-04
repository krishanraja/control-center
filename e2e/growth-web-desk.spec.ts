import { test, expect, type Page, type Route } from '@playwright/test'
import { WEB_INSIGHTS, WEB_INSIGHTS_EMPTY, WEB_TOO_SOON } from './fixtures/webInsights'

/**
 * Growth's site visits on the desk (1440 and 1920): the four sites in Numbers,
 * Check now in the title band, and each site's one action as a move in the
 * queue.
 *
 * The contract is honesty before numbers: a site that cannot be read shows its
 * verdict and no visit count, the shared setup step is one move (not one per
 * site it blocks), and a ruling is a one-tap quick choice at the front of the
 * queue. Each of those is asserted against a fixture with one site per verdict
 * family (e2e/fixtures/webInsights.ts).
 */

async function mock(page: Page, opts: { insights?: unknown; onSlot?: (body: any) => void } = {}) {
  // Catch-alls first: Playwright checks handlers in REVERSE registration order.
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  // The morning check-in gates the shell: answer it as done so the tab renders.
  await page.route('**/api/pilot/timezone', (r: Route) => r.fulfill({ json: { ok: true, timezone: 'Europe/London' } }))
  await page.route('**/api/pilot/checkin*', (r: Route) => r.fulfill({ json: {
    ok: true,
    morning: { id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green', one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false },
    last_evening: null, evening_done_today: true, yesterday: null, timezone: 'Europe/London',
    today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()),
  } }))
  await page.route('**/api/growth/web-insights*', (r: Route) => {
    if (r.request().method() === 'POST') return r.fulfill({ status: 429, json: WEB_TOO_SOON })
    return r.fulfill({ json: opts.insights ?? WEB_INSIGHTS })
  })
  await page.route('**/api/daily-focus/slot*', (r: Route) => {
    opts.onSlot?.(r.request().postDataJSON())
    return r.fulfill({ json: { ok: true, written: 1 } })
  })
}

async function openNumbers(page: Page) {
  await page.goto('/#/growth?section=numbers')
  await expect(page.getByTestId('growth-numbers-visits')).toBeVisible()
  await expect(page.getByTestId('growth-site-site')).toBeVisible()
}

test('four sites, in registry order', async ({ page }) => {
  await mock(page)
  await openNumbers(page)
  const ids = await page.locator('[data-testid^="growth-site-"][data-health]').evaluateAll(els =>
    els.map(e => e.getAttribute('data-testid')))
  expect(ids).toEqual(['growth-site-site', 'growth-site-mymu', 'growth-site-fulltime', 'growth-site-legibility'])
})

test('a site that cannot be read shows its verdict and no visit count', async ({ page }) => {
  await mock(page)
  await openNumbers(page)
  const legibility = page.getByTestId('growth-site-legibility')
  await expect(legibility).toHaveAttribute('data-health', 'api_disabled')
  await expect(legibility.getByRole('img', { name: /this week, .* the week before/ })).toHaveCount(0)
  await expect(legibility).toContainText('Cannot be checked until one Google setting is on.')
  // Proves the probe can find a count where one is honest.
  await expect(page.getByTestId('growth-site-mymu').getByRole('img', { name: /this week, .* the week before/ })).toHaveCount(1)
})

test('the ruling is the first move, a quick choice, and the shared step is one move', async ({ page }) => {
  await mock(page)
  await page.goto('/#/growth')
  await expect(page.getByTestId('growth-move-card')).toContainText('What is fulltime.fm for?')
  await page.getByTestId('growth-section-week').click()
  const moves = page.getByTestId('growth-week-move')
  await expect(moves.filter({ hasText: 'Admin API' })).toHaveCount(1)
  await expect(moves.nth(0)).toContainText('What is fulltime.fm for?')
})

test('Put on today writes the action title and its job', async ({ page }) => {
  let body: any = null
  await mock(page, { onSlot: b => { body = b } })
  await page.goto('/#/growth?section=week')
  await page.getByTestId('growth-week-move').filter({ hasText: 'Admin API' }).click()
  await page.getByTestId('growth-move-primary').click()
  await expect.poll(() => body).not.toBeNull()
  expect(body.text).toBe(WEB_INSIGHTS.shared_action?.title)
  expect(body.job).toBe('keep_honest')
  expect(body.slot).toBe(1)
})

test('Check now in the title band, inside ten minutes, says when to try again', async ({ page }) => {
  await mock(page)
  await page.goto('/#/growth')
  const check = page.getByTestId('growth-site-check').first()
  await check.getByTestId('growth-site-check-button').click()
  await expect(check).toContainText('You can check again in 7 minutes.')
  // Never a dead button.
  await expect(check.getByTestId('growth-site-check-button')).toBeEnabled()
})

test('on the desk, why opens in place under the card, not over it', async ({ page }) => {
  await mock(page)
  await page.goto('/#/growth')
  await page.getByTestId('growth-move-why').click()
  const why = page.getByTestId('growth-why-inline')
  await expect(why).toBeVisible()
  await expect(why).toContainText('What each answer means')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('no em dash anywhere in the numbers', async ({ page }) => {
  await mock(page)
  await openNumbers(page)
  expect(await page.getByTestId('growth-panel-numbers').innerText()).not.toContain('—')
})

test('nothing read yet is an empty note, not an error', async ({ page }) => {
  await mock(page, { insights: WEB_INSIGHTS_EMPTY })
  await page.goto('/#/growth?section=numbers')
  await expect(page.getByTestId('growth-web-empty')).toBeVisible()
  await expect(page.getByText('could not be read')).toHaveCount(0)
})
