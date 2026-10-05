import { test, expect, type Page, type Route } from '@playwright/test'
import { mockIcp } from './fixtures/icp'
import { assertBodyReachesFrame, assertNoRawErrors, assertRendered, assertFrameDoesNotScroll } from './fixtures/layout'

/**
 * Growth > Buyers: where Krish defines who each product is for.
 *
 * Krish, 2026-10-05: "Can you add in Control Center somewhere I can define ICP
 * for each and it gets saved and acted on by the system durably?"
 *
 * The tests that matter are the honesty ones. A product with no ICP must say
 * so, must name what is not running because of it, and must never show another
 * product's buyer. That last one is not a style preference: Maya's prospecting
 * lane used to fall back to Mindmake's buyer titles for any unconfigured
 * product, so a new product prospected the wrong people and the run still
 * reported success. The fixture is deliberately asymmetric (Mindmake defined,
 * five products empty), because a fully populated mock cannot see any of this.
 */

async function mock(page: Page) {
  // Catch-alls first: Playwright checks handlers in REVERSE registration order.
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/api/pilot/timezone', (r: Route) => r.fulfill({ json: { ok: true, timezone: 'Europe/London' } }))
  await page.route('**/api/pilot/checkin*', (r: Route) => r.fulfill({ json: {
    ok: true,
    morning: { id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green', one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false },
    last_evening: null, evening_done_today: true, yesterday: null, timezone: 'Europe/London',
    today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()),
  } }))
  return page
}

test.beforeEach(async ({ page }) => {
  await mock(page)
  await mockIcp(page)
  await page.goto('/#/growth?section=buyers')
  await assertRendered(page, 'main')
  // Nothing below is worth measuring until the fixture is demonstrably on
  // screen: an empty page passes most of these assertions.
  await expect(page.getByTestId('buyers-products')).toBeVisible()
})

test('every product on the ladder is here, ranked, with Mindmake the only one defined', async ({ page }) => {
  // The ladder is src/lib/portfolio.ts and nothing else.
  for (const v of ['heartside', 'full_time', 'legibility', 'mm_ctrl', 'fractionl_pulse', 'mindmake', 'fractionl_circle']) {
    await expect(page.getByTestId(`buyers-product-${v}`)).toBeVisible()
  }
  await expect(page.getByTestId('buyers-product-heartside')).toContainText('Priority 1')
  await expect(page.getByTestId('buyers-product-legibility')).toContainText('Priority 2')
  await expect(page.getByTestId('buyers-product-mm_ctrl')).toContainText('Priority 3')
  // Dormant is preserved, not deleted.
  await expect(page.getByTestId('buyers-product-fractionl_circle')).toContainText('Not ranked')
  await expect(page.getByTestId('buyers-summary')).toContainText('1 of 7')
})

test('a product with no ICP says so, and says what is blocked', async ({ page }) => {
  await page.getByTestId('buyers-product-heartside').click()
  const editor = page.getByTestId('buyers-editor')
  await expect(editor).toHaveAttribute('data-venture', 'heartside')
  await expect(editor).toHaveAttribute('data-defined', 'no')

  const blocked = page.getByTestId('buyers-blocked')
  await expect(blocked).toBeVisible()
  // The prospecting lane is the one that STOPS, and it has to be named as
  // stopped rather than as degraded.
  await expect(page.getByTestId('buyers-blocked-maya_prospecting')).toContainText('stopped')
  await expect(page.getByTestId('buyers-blocked-maya_prospecting')).toContainText('no buyer titles')
  // The other three are named too, so the cost of the gap is the whole list.
  for (const id of ['growth_review', 'acquisition_direction', 'tab_grounding']) {
    await expect(page.getByTestId(`buyers-blocked-${id}`)).toBeVisible()
  }
})

test('an undefined product never shows another product\'s buyer', async ({ page }) => {
  // Read Mindmake first, so its values are in the page, then switch away. A
  // form that kept them would be the exact bug this surface exists to kill.
  await page.getByTestId('buyers-product-mindmake').click()
  await expect(page.getByTestId('buyers-who')).toHaveValue(/founder, principal or senior commercial leader/i)
  await expect(page.getByTestId('buyers-titles')).toContainText('Managing Partner')

  await page.getByTestId('buyers-product-full_time').click()
  await expect(page.getByTestId('buyers-editor')).toHaveAttribute('data-defined', 'no')
  await expect(page.getByTestId('buyers-who')).toHaveValue('')
  await expect(page.getByTestId('buyers-whonot')).toHaveValue('')
  await expect(page.getByTestId('buyers-shape')).toHaveValue('')
  await expect(page.getByTestId('buyers-titles')).not.toContainText('Managing Partner')
  await expect(page.getByTestId('buyers-titles')).not.toContainText('Founder')
})

test('a defined product shows its own buyer and no blocked notice', async ({ page }) => {
  await page.getByTestId('buyers-product-mindmake').click()
  await expect(page.getByTestId('buyers-editor')).toHaveAttribute('data-defined', 'yes')
  await expect(page.getByTestId('buyers-blocked')).toHaveCount(0)
})

test('typing buyer titles saves them and says the lane is unblocked', async ({ page }) => {
  let sent: any = null
  await mockIcp(page, { onSave: b => { sent = b } })

  await page.getByTestId('buyers-product-legibility').click()
  await expect(page.getByTestId('buyers-editor')).toHaveAttribute('data-defined', 'no')
  // Save is off until something changes, so an accidental press cannot write
  // an empty ICP over a real one.
  await expect(page.getByTestId('buyers-save')).toBeDisabled()

  const titles = page.getByTestId('buyers-titles-input')
  await titles.fill('Head of Platform')
  await titles.press('Enter')
  await titles.fill('Staff Engineer')
  await titles.press('Enter')
  await page.getByTestId('buyers-who').fill('An engineer who has to make a catalogue readable by an agent this quarter.')

  await expect(page.getByTestId('buyers-save')).toBeEnabled()
  await page.getByTestId('buyers-save').click()

  await expect(page.getByTestId('buyers-saved')).toContainText('prospecting run will use it')
  expect(sent?.venture).toBe('legibility')
  expect(sent?.patch?.buyer_titles).toEqual(['Head of Platform', 'Staff Engineer'])
  // Postgres decides `defined`, so the surface must re-read rather than assume.
  await expect(page.getByTestId('buyers-editor')).toHaveAttribute('data-defined', 'yes')
  await expect(page.getByTestId('buyers-blocked')).toHaveCount(0)
  await expect(page.getByTestId('buyers-summary')).toContainText('2 of 7')
})

test('the view obeys the frame', async ({ page }) => {
  await assertFrameDoesNotScroll(page, 'main')
  await assertBodyReachesFrame(page, '[data-testid="growth-panel-buyers"]', 'main')
  await assertNoRawErrors(page, 'main')
})
