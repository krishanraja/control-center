import { test, expect, type Page, type Route } from '@playwright/test'
import { WEB_INSIGHTS, WEB_TOO_SOON } from './fixtures/webInsights'

/**
 * Growth on the phone (390x844 and 360x640). The desk spec owns the copy and
 * the honesty rules; this one owns what a phone does differently: one column,
 * a thumb-sized hit area on every control, nothing added to the fixed header,
 * and the window still never scrolls.
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

test('the site cards stack in one column', async ({ page }) => {
  await mock(page)
  await page.goto('/#/growth?section=numbers')
  await expect(page.getByTestId('growth-site-site')).toBeAttached()
  const xs = await page.locator('[data-testid^="growth-site-"][data-health]').evaluateAll(els =>
    els.map(e => Math.round(e.getBoundingClientRect().left)))
  expect(xs).toHaveLength(4)
  expect(new Set(xs).size).toBe(1)
})

test('every control on the move card carries the 44px hit area', async ({ page }) => {
  await mock(page)
  await page.goto('/#/growth')
  await expect(page.getByTestId('growth-move-card')).toBeVisible()
  for (const id of ['growth-move-why', 'growth-move-skip']) {
    await expect(page.getByTestId(id)).toHaveClass(/(^|\s)tap-44(\s|$)/)
  }
  for (const id of ['next', 'week', 'numbers', 'places']) {
    await expect(page.getByTestId(`growth-section-${id}`)).toHaveClass(/(^|\s)tap-44(\s|$)/)
  }
  await page.getByTestId('growth-section-numbers').tap()
  await expect(page.getByTestId('growth-site-check-button')).toHaveClass(/(^|\s)tap-44(\s|$)/)
})

test('the window does not scroll, the header holds only the switcher, and the move is on screen', async ({ page }) => {
  await mock(page)
  await page.goto('/#/growth')
  await expect(page.getByTestId('growth-move-card')).toBeVisible()
  const over = await page.evaluate(() => (document.scrollingElement?.scrollHeight ?? 0) - innerHeight)
  expect(over).toBeLessThanOrEqual(2)
  // The title band on a phone is the switcher: the summary and the strip ride in the scroller.
  const panelTop = await page.getByTestId('growth-panel-next').evaluate(el => el.getBoundingClientRect().top)
  const navBottom = await page.getByTestId('growth-section-next').evaluate(el => el.getBoundingClientRect().bottom)
  expect(panelTop - navBottom).toBeLessThan(40)
  await expect(page.getByTestId('growth-move-card')).toContainText('What is fulltime.fm for?')
})
