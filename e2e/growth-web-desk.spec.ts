import { test, expect, type Page, type Route } from '@playwright/test'
import { WEB_INSIGHTS, WEB_INSIGHTS_EMPTY, WEB_TOO_SOON } from './fixtures/webInsights'

/**
 * Growth > What's moving > Site visits, on the desk (1440 and 1920).
 *
 * The panel's contract is honesty before numbers: a property that cannot be
 * read shows its verdict and no visit count, one shared step shows once at the
 * top instead of on every card it blocks, and the hero points at it while any
 * site is not being counted. Each of those is asserted here against a fixture
 * with one card per verdict family (e2e/fixtures/webInsights.ts).
 *
 * Mutation-checked once, locally (2026-09-27), rather than trusted for passing:
 *   - rendering the numbers row for every health (dropping the `totals` gate,
 *     an unread site then reads "0 visits in 7 days") fails exactly the "no
 *     visit count on an unread site" test;
 *   - dropping the web branch from nextGrowthAction fails exactly the hero
 *     test (the hero falls through to "Pick this week's clips").
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

async function open(page: Page) {
  await page.goto('/#/growth?section=signals')
  await expect(page.getByTestId('growth-web')).toBeVisible()
  await expect(page.getByTestId('growth-web-card-site')).toBeVisible()
}

test('four cards, in registry order', async ({ page }) => {
  await mock(page)
  await open(page)
  const ids = await page.locator('[data-testid^="growth-web-card-"]').evaluateAll(els =>
    els.map(e => e.getAttribute('data-testid')))
  expect(ids).toEqual(['growth-web-card-site', 'growth-web-card-mymu', 'growth-web-card-fulltime', 'growth-web-card-legibility'])
})

test('a site that cannot be read shows its verdict and no visit count', async ({ page }) => {
  await mock(page)
  await open(page)
  await expect(page.getByTestId('growth-web-health-legibility')).toHaveAttribute('data-health', 'api_disabled')
  const text = await page.getByTestId('growth-web-card-legibility').innerText()
  expect(text).not.toMatch(/\d+ visits?/)
  // Proves the probe can find a count where one is honest.
  expect(await page.getByTestId('growth-web-card-mymu').innerText()).toMatch(/\d+ visits?/)
})

test('the shared step shows once, and the site it blocks says it is waiting', async ({ page }) => {
  await mock(page)
  await open(page)
  await expect(page.getByTestId('growth-web-shared-action')).toHaveCount(1)
  await expect(page.getByTestId('growth-web-shared-action')).toContainText('Admin API')
  await expect(page.getByTestId('growth-web-waiting-legibility')).toHaveText('Waiting on the step at the top.')
})

test('a ruling stays on its card', async ({ page }) => {
  await mock(page)
  await open(page)
  await expect(page.getByTestId('growth-web-action-fulltime')).toContainText('Decide what fulltime.fm is for')
})

test('the hero names the setup step and Show me brings it into view', async ({ page }) => {
  await mock(page)
  await open(page)
  const hero = page.getByTestId('growth-hero')
  await expect(hero).toContainText('Turn on one Google setting so the sites can be checked')
  await hero.getByRole('button', { name: 'Show me' }).click()
  await expect(page.getByTestId('growth-web-shared-action')).toBeInViewport()
})

test('Put on today writes the action title and its job', async ({ page }) => {
  let body: any = null
  await mock(page, { onSlot: b => { body = b } })
  await open(page)
  await page.getByTestId('growth-web-today-site').click()
  await expect.poll(() => body).not.toBeNull()
  expect(body.text).toBe(WEB_INSIGHTS.properties[0].action?.title)
  expect(body.job).toBe('keep_honest')
  expect(body.slot).toBe(1)
})

test('Check now inside ten minutes says when to try again', async ({ page }) => {
  await mock(page)
  await open(page)
  await page.getByTestId('growth-web-check').click()
  await expect(page.getByText(/Checked less than 10 minutes ago/)).toBeVisible()
  // Never a dead button.
  await expect(page.getByTestId('growth-web-check')).toBeEnabled()
})

test('the evidence starts open on the desk', async ({ page }) => {
  await mock(page)
  await open(page)
  await expect(page.getByTestId('growth-web-evidence-mymu')).toHaveAttribute('aria-expanded', 'true')
})

test('no em dash anywhere in the panel', async ({ page }) => {
  await mock(page)
  await open(page)
  const text = await page.getByTestId('growth-web').innerText()
  expect(text).not.toContain('\u2014')
})

test('nothing read yet is an empty note, not an error', async ({ page }) => {
  await mock(page, { insights: WEB_INSIGHTS_EMPTY })
  await page.goto('/#/growth?section=signals')
  await expect(page.getByTestId('growth-web-empty')).toBeVisible()
  await expect(page.getByText('Could not read the site visits.')).toHaveCount(0)
})
