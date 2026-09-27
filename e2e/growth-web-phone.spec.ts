import { test, expect, type Page, type Route } from '@playwright/test'
import { WEB_INSIGHTS, WEB_TOO_SOON } from './fixtures/webInsights'

/**
 * Growth > What's moving > Site visits, on the phone (390x844 and 360x640).
 *
 * The desk spec owns the copy and the ladder. This one owns what a phone does
 * differently: one column, the evidence folded until tapped, a thumb-sized hit
 * area on every control, nothing added to the fixed header, and the window
 * still never scrolls.
 */

async function mock(page: Page) {
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
    return r.fulfill({ json: WEB_INSIGHTS })
  })
  await page.route('**/api/daily-focus/slot*', (r: Route) => r.fulfill({ json: { ok: true, written: 1 } }))
}

async function open(page: Page) {
  await mock(page)
  await page.goto('/#/growth?section=signals')
  await expect(page.getByTestId('growth-web-card-site')).toBeAttached()
}

test('the cards stack in one column', async ({ page }) => {
  await open(page)
  const xs = await page.locator('[data-testid^="growth-web-card-"]').evaluateAll(els =>
    els.map(e => Math.round(e.getBoundingClientRect().left)))
  expect(xs).toHaveLength(4)
  expect(new Set(xs).size).toBe(1)
})

test('the evidence starts folded and opens on a tap', async ({ page }) => {
  await open(page)
  const toggles = page.locator('[data-testid^="growth-web-evidence-"]')
  await expect(toggles).toHaveCount(4)
  for (const v of await toggles.evaluateAll(els => els.map(e => e.getAttribute('aria-expanded')))) {
    expect(v).toBe('false')
  }
  const card = page.getByTestId('growth-web-card-site')
  await expect(card.getByText('Where visits came from')).toHaveCount(0)
  await page.getByTestId('growth-web-evidence-site').scrollIntoViewIfNeeded()
  await page.getByTestId('growth-web-evidence-site').tap()
  await expect(page.getByTestId('growth-web-evidence-site')).toHaveAttribute('aria-expanded', 'true')
  await expect(card.getByText('Where visits came from')).toBeVisible()
})

test('every control carries the 44px hit area', async ({ page }) => {
  await open(page)
  for (const id of ['growth-web-today-site', 'growth-web-check', 'growth-web-evidence-site']) {
    await expect(page.getByTestId(id)).toHaveClass(/(^|\s)tap-44(\s|$)/)
  }
})

test('the window does not scroll, and the hero is on screen', async ({ page }) => {
  await open(page)
  const over = await page.evaluate(() => (document.scrollingElement?.scrollHeight ?? 0) - innerHeight)
  expect(over).toBeLessThanOrEqual(2)
  await expect(page.getByTestId('growth-hero')).toBeVisible()
  await expect(page.getByTestId('growth-hero')).toContainText('Turn on one Google setting so the sites can be checked')
})
