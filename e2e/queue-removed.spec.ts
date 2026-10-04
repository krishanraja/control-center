import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * The OS Queue is gone (ruling, Krish 2026-10-04).
 *
 * It held 27 rulings of which 74% were stale or superseded, and 78% already
 * showed in the tab that owns them. Four things must stay true:
 *   1. No OS switcher offers a Queue, and an old #/os?sub=queue link opens Org.
 *   2. A legacy #/today RULING deep link (?task= / ?decision=) opens OS → Org,
 *      where the agent carrying the work lives. A bare #/today is still Home.
 *   3. Home's Waiting count counts only fresh rulings: here the W40 brief and
 *      one idea, not the 41-day-old correction, the superseded W39 brief or
 *      the purge notice. It opens a list that sends each item to its tab.
 *   4. When nothing is fresh, the count is 0 and the list says so plainly.
 */

const now = Date.now()
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString()
const base = { description: null, url: null, source_table: 't', route_target: null }

const DECISIONS = [
  { ...base, kind: 'content_decision', id: 'brief-39', title: 'Review the weekly brief: Old week', agent: 'cleo', status: 'brief_review', priority: 'high', sort_at: daysAgo(9), meta: { decision_kind: 'brief_review', week: '2026-W39', ref: 'b39', title: 'Old week' } },
  { ...base, kind: 'content_decision', id: 'brief-40', title: 'Review the weekly brief: This week', agent: 'cleo', status: 'brief_review', priority: 'high', sort_at: daysAgo(2), meta: { decision_kind: 'brief_review', week: '2026-W40', ref: 'b40', title: 'The headcount saving was never net' } },
  { ...base, kind: 'content_decision', id: 'purge-40', title: '72 items expire in the Monday purge', agent: 'cleo', status: 'purge_preview', priority: 'normal', sort_at: daysAgo(2), meta: { decision_kind: 'purge_preview', week: '2026-W40', ref: 'b40' } },
  { ...base, kind: 'correction', id: 'corr-1', title: 'Correction: cleo / pattern_recall', agent: 'cleo', status: 'analyzed', priority: 'overdue', sort_at: daysAgo(41), meta: {} },
  { ...base, kind: 'idea', id: 'idea-1', title: 'Same agent, opposite answers', agent: 'cleo', status: 'review', priority: 'normal', sort_at: daysAgo(0), meta: {} },
]

let rows: unknown[] = DECISIONS

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
  await page.route('**/rest/v1/decisions_waiting*', (r: Route) => r.fulfill({ json: rows }))
}

test.beforeEach(() => { rows = DECISIONS })

test('the OS switcher has no Queue, and an old queue link opens Org', async ({ page }) => {
  await mock(page)
  await page.goto('/#/os?sub=queue')
  await expect(page.getByTestId('os-sub-org')).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
  await expect(page.getByTestId('os-sub-queue')).toHaveCount(0)
})

test('a legacy #/today?task= deep link opens OS → Org', async ({ page }) => {
  await mock(page)
  await page.goto('/#/today?task=task-1')
  await expect(page.getByTestId('os-sub-org')).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
})

test('a legacy #/today?decision= deep link opens OS → Org', async ({ page }) => {
  await mock(page)
  await page.goto('/#/today?decision=vera_gap:gap-9')
  await expect(page.getByTestId('os-sub-org')).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
})

test('a bare #/today still lands on Home', async ({ page }) => {
  await mock(page)
  await page.goto('/#/today')
  await expect(page.getByLabel("This week's objectives")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('os-sub-org')).toHaveCount(0)
})

test('the Waiting count counts only fresh rulings and sends each to its tab', async ({ page }) => {
  await mock(page)
  await page.goto('/#/home')
  const count = page.getByTestId('vitals-waiting')
  await expect(count).toContainText('2', { timeout: 15_000 })
  await count.click()
  const sheet = page.getByTestId('waiting-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('2 things are waiting on you.')
  await expect(sheet).toContainText('In Content')
  await expect(sheet).not.toContainText('Old week')
  await expect(sheet).not.toContainText('purge')
  await expect(sheet).not.toContainText('Correction')
  await sheet.getByRole('button', { name: /This week's brief|headcount saving/i }).click()
  await expect(page).toHaveURL(/#\/content/)
})

test('with nothing fresh the count is zero and says so', async ({ page }) => {
  rows = DECISIONS.filter(d => d.id === 'corr-1' || d.id === 'purge-40')
  await mock(page)
  await page.goto('/#/home')
  const count = page.getByTestId('vitals-waiting')
  await expect(count).toContainText('0', { timeout: 15_000 })
  await count.click()
  await expect(page.getByTestId('waiting-sheet')).toContainText('Nothing is waiting on you.')
})
