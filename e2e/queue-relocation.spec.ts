import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * The queue relocation contract (2026-08-20 recompose).
 *
 * The ruling queue moved from Home to OS → Queue. Three things must stay true:
 *   1. A legacy #/today RULING deep link (?task= / ?decision=) lands on the
 *      queue with the deck seeded to the referenced row — every old bookmark
 *      and n8n-sent link keeps resolving.
 *   2. A bare #/today still lands on Home (it always meant "the day").
 *   3. Home's vitals "Waiting" count navigates to the queue.
 */

const DECISIONS = [
  { kind: 'task', id: 'task-1', title: 'Approve the Vera correction batch', description: null, priority: 'high', agent: 'vera', status: 'waiting', sort_at: new Date().toISOString(), meta: {}, route_target: null },
  { kind: 'vera_gap', id: 'gap-9', title: 'Vera flagged a gap on the enrich task', description: null, priority: 'normal', agent: 'vera', status: 'waiting', sort_at: new Date().toISOString(), meta: {}, route_target: null },
]

async function mock(page: Page) {
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/api/pilot/worries*', (r: Route) => r.fulfill({ json: {
    ok: true, due: [], calibration: { total_closed: 0, pct_confirmed: 0 }, open_test_count: 0, cap: 5,
    today: new Intl.DateTimeFormat('en-CA').format(new Date()),
  } }))

  await page.route('**/api/pilot/checkin*', (r: Route) => r.fulfill({ json: {
    ok: true,
    morning: { id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green', one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false },
    last_evening: null, evening_done_today: true, yesterday: null,
    timezone: 'Australia/Sydney',
    today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date()),
  } }))
  await page.route('**/api/goals/ladder*', (r: Route) => r.fulfill({ json: {
    ok: true, horizons: ['os', 'weekly'], by_horizon: { os: [], weekly: [] }, goals: [],
    stale_count: 0, orphan_count: 0, ventures: [], north_star: '', week_of: 'Aug 17–23',
  } }))
  await page.route('**/rest/v1/decisions_waiting*', (r: Route) => r.fulfill({ json: DECISIONS }))
}

test('a legacy #/today?task= deep link lands on OS → Queue with the deck seeded', async ({ page }) => {
  await mock(page)
  await page.goto('/#/today?task=task-1')
  await expect(page.getByTestId('os-sub-queue')).toBeVisible({ timeout: 15_000 })
  // The deck opens seeded to the referenced ruling.
  await expect(page.getByRole('heading', { name: 'Approve the Vera correction batch' })).toBeVisible()
})

test('a legacy #/today?decision= deep link lands on OS → Queue with the deck seeded', async ({ page }) => {
  await mock(page)
  await page.goto('/#/today?decision=vera_gap:gap-9')
  await expect(page.getByTestId('os-sub-queue')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Vera flagged a gap on the enrich task' })).toBeVisible()
})

test('a bare #/today still lands on Home', async ({ page }) => {
  await mock(page)
  await page.goto('/#/today')
  // Home's canon layers, not the queue.
  await expect(page.getByLabel("This week's objectives")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('os-sub-queue')).toHaveCount(0)
})

test('the vitals Waiting count navigates to the queue', async ({ page }) => {
  await mock(page)
  await page.goto('/#/home')
  await page.getByTestId('vitals-waiting').click()
  await expect(page.getByTestId('os-sub-queue')).toBeVisible({ timeout: 15_000 })
  await expect(page).toHaveURL(/os\?sub=queue|os&sub=queue|sub=queue/)
})
