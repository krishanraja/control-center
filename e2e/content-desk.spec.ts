import { test, expect } from '@playwright/test'
import { assertFixturesLanded } from './fixtures/populated'
import { mockContentMorning } from './fixtures/content'
import {
  assertNothingOverflows, assertNoSqueezedText, assertNoRawErrors, assertRendered,
  scrollContainers, largestHole, assertFrameDoesNotScroll, assertBodyReachesFrame,
} from './fixtures/layout'

/**
 * The Content desk above the 1400px breakpoint, holding real data: today's
 * calls as a numbered list beside a reading pane, and at 1920 a rail with each
 * series' next piece.
 *
 * This file exists because of a specific failure: the rail, the focus columns
 * and everything else behind `wideDesk` (1400px) were shipped on a suite whose
 * only viewport was 1280x800. Not one of those changes had ever been rendered
 * by a test. The screenshots that came back showed a card wrapping one word per
 * line under its own buttons, a cascade of raw engine errors, and a page that
 * ran off the bottom of the screen.
 *
 * It never calls setViewportSize: the width comes from the project, so the two
 * desk projects (1440 and 1920) actually mean something.
 */

// The fixture pins the page's clock to FIXTURE_NOW; UTC is the calendar the
// engine keeps its series days on (see content-rooms.spec.ts).
test.use({ timezoneId: 'UTC' })

test.beforeEach(async ({ page }) => {
  await mockContentMorning(page)
  await page.goto('/#/content')
  // Nothing below is worth measuring until the fixtures are demonstrably on
  // screen. An empty page passes every layout assertion in this file.
  // In this order. A crashed tab passes most of the probes below, because an
  // error boundary has nothing in it to squeeze, overflow or leave a hole.
  await assertRendered(page, 'main')
  await assertFixturesLanded(page, 'calls today')
})

test('the desk is wide enough to be the desk', async ({ page }) => {
  const width = page.viewportSize()!.width
  expect(width).toBeGreaterThanOrEqual(1440)
  // The list and the call in focus sit side by side, never stacked.
  const list = await page.getByTestId('content-calls-list').boundingBox()
  const reader = await page.getByTestId('content-reader').boundingBox()
  expect(list && reader && reader.x >= list.x + list.width).toBeTruthy()
  await expect(page.getByTestId('content-tab')).toHaveAttribute('data-layout', width >= 1900 ? 'triple' : 'split')
  if (width >= 1900) await expect(page.getByTestId('content-rail')).toBeVisible()
})

test('nothing on the desk is squeezed into a column', async ({ page }) => {
  await assertNoSqueezedText(page, 'main')
})

test('no machine strings reach the reader', async ({ page }) => {
  await assertNoRawErrors(page, 'main')
})

// Since the 2026-10-04 redesign (today's calls) the tab body is ONE scroller,
// the AppFrame body `content-room-scroll`, like Focus. So the two probes below
// look INSIDE it: the scroller itself is the legitimate one, and anything that
// scrolls or overflows within it is the nested scroller the house rules forbid.
const INSIDE = '[data-testid="content-room-scroll"] > div'

test('nothing overflows its own box', async ({ page }) => {
  await assertNothingOverflows(page, INSIDE)
})

test('the desk has one scroller and nothing scrolls inside it', async ({ page }) => {
  await expect(page.getByTestId('content-room-scroll')).toHaveCSS('overflow-y', 'auto')
  const boxes = await scrollContainers(page, INSIDE)
  expect(boxes, `nested scroll boxes: ${boxes.join(' | ')}`).toHaveLength(0)
})

test('the desk has no hole in it', async ({ page }) => {
  const { fraction, rect } = await largestHole(page, 'main')
  expect(fraction, `largest empty rectangle is ${(fraction * 100).toFixed(0)}% of the desk at ${JSON.stringify(rect)}`)
    .toBeLessThan(0.25)
})

test('the page itself does not scroll', async ({ page }) => {
  await assertFrameDoesNotScroll(page, 'main')
})

/**
 * Krish, 2026-10-05: "content tab has a glitch where it cuts off at the bottom
 * of the screen on desktop."
 *
 * It was not unreachable content and not a page scroll, so every gate here was
 * green. The shell took `--capture-gutter` off the frame's HEIGHT, so the one
 * scroller ended 96px above the bottom of the window, sliced its last row
 * through, and left 96px of dead paper under it. Measured at 1440x900 before
 * the fix: the scrollport ran 75 to 804 in a 900px window. After: 75 to 876,
 * with the pill clearance moved inside the scroller where index.css says it
 * belongs. 72px of desk came back at every width.
 */
test('the one scroller reaches the bottom of the frame', async ({ page }) => {
  await assertBodyReachesFrame(page, '[data-testid="content-room-scroll"]', 'main')
})
