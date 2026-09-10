import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * A tab's scroll region must reach the bottom of the phone screen.
 *
 * The Growth list used to stop about 100px above the nav with a blank band
 * under it: the BottomNav clearance was padding on the overflow-hidden
 * wrapper in App.tsx, so it shortened the scroll viewport instead of adding
 * scroll tail inside it. The last rows were simply unreachable. The pad now
 * lives on the scroller, the way MobileShell does it. This spec measures the
 * scroller's bottom edge against the zoom root so the regression cannot
 * come back quietly on either tab that mounts its own scroller.
 */

const calmMorning = {
  id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green',
  one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false,
}

async function mock(page: Page) {
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/pilot/timezone', (r: Route) =>
    r.fulfill({ json: { ok: true, timezone: 'America/New_York' } }))
  await page.route('**/api/pilot/checkin*', (r: Route) => {
    const tz = new URL(r.request().url()).searchParams.get('tz') || 'America/New_York'
    return r.fulfill({
      json: {
        ok: true, morning: calmMorning, last_evening: null, evening_done_today: true,
        yesterday: null, timezone: 'America/New_York',
        today: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()),
      },
    })
  })
}

/** How far the scroller's bottom edge sits above the bottom of the zoom root,
 *  in the root's own pixels. Zero means it reaches the screen. */
async function gapBelow(page: Page, testId: string): Promise<number> {
  return page.getByTestId(testId).evaluate(el => {
    const root = document.querySelector('.mobile-zoom-root')!
    const rootRect = root.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    return rootRect.bottom - rect.bottom
  })
}

// Growth's landing section is `work` (the week's clips), not `map`: the
// sections are ordered by what causes what, and the two reference sections sit
// after the loop. The panel test id follows the mounted section, and it is the
// scroller itself (GrowthTab.tsx), so measuring the landing one is both honest
// and stable.
for (const [tab, panel] of [['growth', 'growth-panel-work'], ['content?room=built', 'content-room-scroll']] as const) {
  test(`the ${tab.split('?')[0]} scroller reaches the bottom of a phone screen`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    await mock(page)
    await page.goto(`/#/${tab}`)
    if (tab.startsWith('content')) await page.getByTestId('content-room-built').click()
    await expect(page.getByTestId(panel)).toBeVisible()
    // A few pixels of rounding across the 1.2x zoom is fine. A hundred is the bug.
    expect(await gapBelow(page, panel)).toBeLessThanOrEqual(4)
    await ctx.close()
  })
}
