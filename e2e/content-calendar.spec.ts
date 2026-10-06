import { test, expect, type Page } from '@playwright/test'
import { mockContentMorning } from './fixtures/content'
import { contentTables, IDEAS } from './fixtures/populated'

/**
 * The Library calendar files a piece on its UTC day, whatever the browser's
 * zone.
 *
 * Until 2026-10-06 the grid bucketed by the browser's local day. A
 * scheduled_for is a date column ("2026-09-17"), which the browser reads as
 * midnight UTC, so in New York it became the evening of the 16th and the piece
 * sat a day early. The rest of the Content desk, and the engine's series days,
 * are on UTC; the calendar is now too (src/lib/contentCalendar.ts).
 *
 * The page's clock is FIXTURE_NOW, Wednesday 2026-09-16 10:00 UTC, which is
 * the same calendar day in both zones below, so the month on screen is
 * September in each.
 */

const base = IDEAS[0]
const piece = (id: string, idea: string, over: Record<string, unknown>) => ({
  ...base, id, idea, state: 'approved', lane_slot: null, buried_at: null, library_at: null, ...over,
})

const DATED = [
  // A date column: its own day, everywhere.
  piece('cal-scheduled', 'Scheduled for Thursday the 17th', { scheduled_for: '2026-09-17', published_at: null }),
  // Early UTC on the 18th: the evening of the 17th in New York.
  piece('cal-early', 'Went out early on the 18th', { scheduled_for: null, state: 'published', published_at: '2026-09-18T00:30:00Z' }),
  // Late UTC on the 18th: the morning of the 19th in Sydney.
  piece('cal-late', 'Went out late on the 18th', { scheduled_for: null, state: 'published', published_at: '2026-09-18T23:30:00Z' }),
]

async function openCalendar(page: Page) {
  const tables = contentTables()
  await mockContentMorning(page, { tables: { content_ideas: [...(tables.content_ideas as unknown[]), ...DATED] } })
  await page.goto('/#/content')
  await page.getByTestId('content-browse-open').click()
  await page.getByTestId('content-browse-library').click()
  await expect(page.getByTestId('content-calendar')).toBeVisible()
}

for (const timezoneId of ['America/New_York', 'Australia/Sydney', 'UTC']) {
  test.describe(`the Library calendar in ${timezoneId}`, () => {
    test.use({ timezoneId, viewport: { width: 1440, height: 900 } })

    test('a piece lands on its UTC day, never the day before or after', async ({ page }) => {
      await openCalendar(page)
      const day = (ymd: string) => page.getByTestId(`content-calendar-day-${ymd}`)

      await expect(day('2026-09-17')).toContainText('Scheduled for Thursday the 17th')
      await expect(day('2026-09-16')).not.toContainText('Scheduled for Thursday the 17th')

      await expect(day('2026-09-18')).toContainText('Went out early on the 18th')
      await expect(day('2026-09-18')).toContainText('Went out late on the 18th')
      await expect(day('2026-09-17')).not.toContainText('Went out early on the 18th')
      await expect(day('2026-09-19')).not.toContainText('Went out late on the 18th')

      // Today is the UTC day too, and the month is September.
      await expect(page.getByTestId('content-calendar')).toContainText('September 2026')
      await expect(day('2026-09-16')).toHaveClass(/border-violet-400/)
    })

    test('clicking a day schedules onto that exact day', async ({ page }) => {
      const sent: string[] = []
      await openCalendar(page)
      await page.route('**/api/content-ideas/*/schedule', r => {
        sent.push(r.request().postDataJSON()?.date)
        return r.fulfill({ json: { ok: true } })
      })
      await page.getByTestId('content-calendar-day-2026-09-24').click()
      const dialog = page.getByRole('dialog', { name: 'Schedule a draft' })
      await expect(dialog).toContainText('Sep 24')
      await dialog.locator('button:not([aria-label="Cancel"])').filter({ hasNotText: 'Cancel' }).first().click()
      await expect.poll(() => sent).toEqual(['2026-09-24'])
    })
  })
}
