import { test, expect, type Page, type Route } from '@playwright/test'
import { answerPilotGate } from './pilot-gate-mock'

/**
 * The Content queue's week window.
 *
 * On 2026-08-25 the Queue had 74 pending decision cards reaching back to
 * 2026-W28, and the card at slot 1 was a brief review assembled on 10 July —
 * 46 days earlier. Three faults stacked up, none of them covered by a test:
 *
 *   1. useContentV2 read `status='pending'` with no week bound, ordered
 *      created_at ASC, limit 30. That is the thirty OLDEST pending cards ever
 *      written, so W32-W34 could not be reached at all.
 *   2. MobileDecisionDeck sorts brief_review first, which pinned the oldest
 *      unreviewed brief to slot 1 permanently.
 *   3. api/purge/run.ts aged only kind='purge_preview', so nothing else ever
 *      left the queue on its own.
 *
 * These specs pin the read half in the user's terms: the queue asks for a
 * bounded window, newest first, and an old card is not what greets you.
 */

const NOW = new Date()

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const THIS_WEEK = isoWeek(NOW)
const LAST_WEEK = isoWeek(new Date(NOW.getTime() - 7 * 86_400_000))

const CURRENT_CARD = {
  id: 'd-current',
  week: THIS_WEEK,
  kind: 'brief_review',
  ref: 'b-current',
  payload: { title: 'The infrastructure layer just repriced', headlines: 8 },
  status: 'pending',
  resolution: null,
  created_at: NOW.toISOString(),
  resolved_at: null,
}

/** The 2026-W28 card, in spirit: old enough that the window must exclude it. */
const ANCIENT_CARD = {
  ...CURRENT_CARD,
  id: 'd-ancient',
  week: '2026-W28',
  payload: { title: 'The Governance Gap Is Now a Balance Sheet Problem', headlines: 8 },
  created_at: '2026-07-10T18:15:27Z',
}

/**
 * Stands in for PostgREST, and actually HONOURS the week bound rather than
 * returning the fixture whatever was asked for. That distinction is the whole
 * point: a mock that ignores the filter passes just as happily against the
 * unbounded query that caused the bug, so it would pin nothing.
 */

async function mockQueue(page: Page, rows: Array<{ week: string }>) {
  const urls: string[] = []
  // Catch-alls first: Playwright checks handlers in REVERSE registration order.
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await answerPilotGate(page)
  await page.route('**/rest/v1/content_decisions*', (r: Route) => {
    const url = decodeURIComponent(r.request().url())
    urls.push(url)
    const bound = url.match(/week=gte\.([0-9]{4}-W[0-9]{2})/)?.[1]
    const served = bound ? rows.filter(row => row.week >= bound) : rows
    return r.fulfill({ json: served })
  })
  return urls
}

test('the queue asks for a bounded week window, newest first', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const urls = await mockQueue(page, [CURRENT_CARD])
  await page.goto('/#/content')
  await expect(page.getByText('to decide', { exact: false })).toBeVisible()

  expect(urls.length).toBeGreaterThan(0)
  const q = decodeURIComponent(urls[0])
  // The bound itself. Losing this line is the original bug.
  expect(q).toContain('week=gte.')
  // And it must be a recent week, not the beginning of time.
  expect(q).toMatch(new RegExp(`week=gte\\.(${THIS_WEEK}|${LAST_WEEK})`))
  // Newest first, so a truncated queue drops the oldest rather than hiding
  // everything recent behind a backlog.
  expect(q).toContain('created_at.desc')
  expect(q).not.toContain('created_at.asc')
})

test('an old card is not what greets you', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  // Both cards go in. Unbounded, the deck sorts brief_review first and leads
  // with the older one - which is exactly what Krish saw for six weeks.
  await mockQueue(page, [ANCIENT_CARD, CURRENT_CARD])
  await page.goto('/#/content')

  await expect(page.getByText('The infrastructure layer just repriced')).toBeVisible()
  await expect(page.getByText('The Governance Gap Is Now a Balance Sheet Problem')).toHaveCount(0)
})

test('the count reflects the window, not an all-time pile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockQueue(page, [ANCIENT_CARD, CURRENT_CARD])
  await page.goto('/#/content')

  // "1 of 30" was the tell: 30 was the query limit saturating, not a count.
  await expect(page.getByText('1 of 1 to decide', { exact: false })).toBeVisible()
  await expect(page.getByText('1 of 30', { exact: false })).toHaveCount(0)
})

test('the ancient card is excluded by the window the app sends', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const urls = await mockQueue(page, [ANCIENT_CARD, CURRENT_CARD])
  await page.goto('/#/content')
  await expect(page.getByText('to decide', { exact: false })).toBeVisible()

  // Postgrest would never have returned this row: prove the filter the client
  // sent actually excludes its week.
  const bound = decodeURIComponent(urls[0]).match(/week=gte\.([0-9]{4}-W[0-9]{2})/)?.[1]
  expect(bound).toBeTruthy()
  expect(ANCIENT_CARD.week < bound!).toBe(true)
})
