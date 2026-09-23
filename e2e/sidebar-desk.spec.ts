import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * The desktop sidebar's pin-and-hover contract, at the desk widths.
 *
 * This file exists for a bug that looked like a flaky test and was not one.
 * `mindmake-identity.spec.ts` covers the same behaviour by moving a real
 * mouse; it failed once in a full local run, then passed sixty consecutive
 * times under heavy parallel load. What actually separated the passes from the
 * failure was not load at all: it was how long the test paused between
 * collapsing the sidebar and moving the pointer.
 *
 * The cause, traced in the browser rather than reasoned about. Collapsing
 * animates the sidebar from 240px to 72px over 200ms, under a pointer sitting
 * at roughly x=119 — inside the old box, outside the new one. Chromium does
 * not reliably dispatch a boundary event when an element shrinks out from
 * under a stationary pointer: the trace shows the collapse commit, then the
 * pointer moving away with NO mouseout on the aside at all. The hover
 * suppression that the collapse sets was released only by `onMouseLeave`, so
 * it stayed set, and hovering the collapsed sidebar did nothing for the rest
 * of the session.
 *
 * Measured before the fix, sweeping out and back at a fixed delay after the
 * click: 0 of 8 expanded at 0ms, 10ms and 50ms; 8 of 8 at 150ms, 220ms and
 * 300ms. Pausing past the transition lets Chromium recompute hover on its own
 * and fire the leave that was missing, which is the only reason the existing
 * spec usually passed.
 *
 * So the test below sweeps immediately, with no pause. That is the real
 * person's gesture — collapse the sidebar, move away, come back — and it fails
 * deterministically against the unfixed component.
 *
 * Like the other desk specs it never calls setViewportSize.
 */

async function mockShell(page: Page) {
  // Playwright evaluates page.route handlers in reverse registration order.
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/pilot/timezone', (r: Route) =>
    r.fulfill({ json: { ok: true, timezone: 'America/New_York' } }))
  await page.route('**/api/pilot/checkin*', (r: Route) => r.fulfill({
    json: {
      ok: true,
      morning: {
        id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green',
        one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false,
      },
      last_evening: null, evening_done_today: true, yesterday: null,
      timezone: 'America/New_York', today: '2026-08-20',
    },
  }))
}

/** Somewhere well clear of the sidebar at any width it can have. */
const OUTSIDE = { x: 600, y: 200 }
/** Inside the collapsed 72px rail, over its navigation. */
const INSIDE = { x: 20, y: 120 }

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-20T18:30:00Z'))
  await mockShell(page)
  await page.goto('/#/home')
  await expect(page.getByTestId('desktop-sidebar')).toBeVisible()
})

test('the desk opens with the sidebar pinned', async ({ page }) => {
  expect(page.viewportSize()!.width).toBeGreaterThanOrEqual(1440)
  await expect(page.getByTestId('desktop-sidebar')).toHaveAttribute('data-expanded', 'true')
})

test('hover works immediately after a collapse, with no pause to wait out the transition', async ({ page }) => {
  const sidebar = page.getByTestId('desktop-sidebar')
  await page.getByTestId('desktop-sidebar-toggle').click()
  await expect(sidebar).toHaveAttribute('data-expanded', 'false')

  // No waitForTimeout between these. The pause is what used to hide the bug.
  await page.mouse.move(OUTSIDE.x, OUTSIDE.y)
  await page.mouse.move(INSIDE.x, INSIDE.y)

  await expect(sidebar, 'the suppression must release on real pointer travel, not on a mouseleave that Chromium never owes')
    .toHaveAttribute('data-expanded', 'true')
  await expect(page.getByTestId('desktop-sidebar-toggle')).toHaveAccessibleName('Keep sidebar open')
})

test('an explicit collapse is not undone by the pointer it shrinks out from under', async ({ page }) => {
  // The reason the suppression exists at all, and the thing the fix must not
  // cost. Collapsing changes the sidebar's geometry beneath a stationary
  // pointer; the re-entry that causes must not instantly reverse what the
  // person just asked for.
  const sidebar = page.getByTestId('desktop-sidebar')
  const toggle = page.getByTestId('desktop-sidebar-toggle')
  const box = (await toggle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await toggle.click()

  await expect(sidebar).toHaveAttribute('data-expanded', 'false')
  // Long enough for the width transition to finish and for any synthetic
  // boundary event to land. The pointer has not moved, so it stays collapsed.
  await page.waitForTimeout(400)
  await expect(sidebar).toHaveAttribute('data-expanded', 'false')
  await expect(toggle).toHaveAccessibleName('Expand sidebar')
})

test('leaving the sidebar again collapses it, and pinning survives a sweep', async ({ page }) => {
  const sidebar = page.getByTestId('desktop-sidebar')
  const toggle = page.getByTestId('desktop-sidebar-toggle')
  await toggle.click()
  await expect(sidebar).toHaveAttribute('data-expanded', 'false')

  await page.mouse.move(OUTSIDE.x, OUTSIDE.y)
  await page.mouse.move(INSIDE.x, INSIDE.y)
  await expect(sidebar).toHaveAttribute('data-expanded', 'true')

  // Hover is a convenience, not a pin: leaving puts it back.
  await page.mouse.move(OUTSIDE.x, OUTSIDE.y)
  await expect(sidebar).toHaveAttribute('data-expanded', 'false')

  // Pinning from there holds through a sweep in and out.
  await page.mouse.move(INSIDE.x, INSIDE.y)
  await expect(sidebar).toHaveAttribute('data-expanded', 'true')
  await toggle.click()
  await expect(toggle).toHaveAccessibleName('Collapse sidebar')
  await page.mouse.move(OUTSIDE.x, OUTSIDE.y)
  await expect(sidebar).toHaveAttribute('data-expanded', 'true')
})
