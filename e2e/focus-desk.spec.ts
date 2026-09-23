import { test, expect, type Page } from '@playwright/test'
import { mockFocus, FOCUS_AFTERNOON } from './fixtures/focus'
import {
  assertNothingOverflows, assertNoSqueezedText, assertNoRawErrors, assertRendered,
  scrollContainers, largestHole,
} from './fixtures/layout'

/**
 * The Focus & Purpose desk above the 1400px breakpoint.
 *
 * Focus was the last `wideDesk` surface with no desk spec at all. Its three
 * tool columns, its 620px spine and the panel beside that spine were shipped
 * and then reshaped twice on a suite whose only viewport was 1280x800 — under
 * the breakpoint, so not one of those layouts had ever been rendered by a test.
 * Everything here is a defect that reached a screenshot Krish sent back, or the
 * tree-shape rule that the rest of the app learned the hard way.
 *
 * Like the other desk specs it never calls setViewportSize: the width comes
 * from the project, so `desk-1440` and `desk-1920` actually mean something.
 *
 * Note that Focus is a SCROLLER, not a stage. Its wrapper in App.tsx is
 * `overflow-y-auto` on purpose: the ask, three open tools and the day-boundary
 * panel do not owe the viewport a single screen the way Home and Content do.
 * So there is no `assertFrameDoesNotScroll` here, and every probe is pointed at
 * the tab's own root rather than at `main`, which would flag the page's
 * legitimate scroller as an overflow.
 */

const TAB = '[data-testid="focus-tab"]'

async function openEveryTool(page: Page) {
  for (const t of ['Steady yourself', 'Before you speak', 'Test an idea']) {
    await page.getByRole('button', { name: new RegExp(t) }).first().click()
  }
  await expect(page.getByRole('button', { name: 'Avoiding an ask' })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FOCUS_AFTERNOON)
  await mockFocus(page)
  await page.goto('/#/focus')
  // In this order. A crashed tab passes most of the probes below, because an
  // error boundary has nothing in it to squeeze, overflow or leave a hole: the
  // Content desk spec came back green on four of six while the tab was showing
  // "Content failed to render".
  await assertRendered(page, 'main')
  await expect(page.locator(TAB)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Today’s ask' })).toBeVisible()
})

test('the desk is wide enough to be the desk', async ({ page }) => {
  expect(page.viewportSize()!.width).toBeGreaterThanOrEqual(1440)
  await expect(page.locator(TAB)).toHaveAttribute('data-shape', 'wide-desk')
})

test('the three tools are three columns, not a stack', async ({ page }) => {
  const tracks = await page.locator('[data-testid="focus-tools"]').evaluate(
    el => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length,
  )
  expect(tracks, 'the tool grid should resolve to three tracks above 1400px').toBe(3)
  await expect(page.getByTestId('focus-tool-card')).toHaveCount(3)
})

test('the day-boundary actions are rendered once, not twice', async ({ page }) => {
  // The rule this pins is the one Home learned by shipping six doorways: a
  // layout that changes TREE shape is chosen in JS, never with `min-[…]:hidden`.
  // Rendering both variants and hiding one leaves both in the DOM, and the
  // failure reads as "resolved to 2 elements" in whatever spec touches it next.
  await expect(page.getByTestId('focus-day-boundary')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Compile a worry' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Shutdown' })).toHaveCount(1)
})

test('the day boundary sits beside the ask, not under it', async ({ page }) => {
  const ask = (await page.getByTestId('focus-ask').boundingBox())!
  const boundary = (await page.getByTestId('focus-day-boundary').boundingBox())!
  // Beside: it starts to the right of where the ask ends, and within the same
  // horizontal band. Before this layout the band ended at the ask's right edge
  // with 600px of bare desk after it, and these two actions were two lowercase
  // text links at the very bottom of the page.
  expect(boundary.x, 'the panel should begin right of the ask').toBeGreaterThanOrEqual(ask.x + ask.width - 1)
  expect(boundary.y, 'the panel should share the ask’s band, not follow it').toBeLessThan(ask.y + ask.height)
})

test('the ask keeps its reading measure and does not stretch', async ({ page }) => {
  // The desk buys a second thing to look at, not a wider first thing. A purpose
  // line and one ask are reading; at 1920 a 1240px-wide ask is worse, not
  // better. 620px plus a pixel of rounding.
  const ask = (await page.getByTestId('focus-ask').boundingBox())!
  expect(ask.width).toBeLessThanOrEqual(621)
})

test('opening one tool does not inflate its two neighbours', async ({ page }) => {
  // `items-start` on the grid. Without it the row stretches all three cards to
  // the tallest, so opening "Steady yourself" leaves two tall empty boxes
  // beside it — which is most of what the columns were supposed to fix.
  const cards = page.getByTestId('focus-tool-card')
  await page.getByRole('button', { name: /Steady yourself/ }).first().click()
  await expect(page.getByRole('button', { name: 'Avoiding an ask' })).toBeVisible()

  const heights = await cards.evaluateAll(els => els.map(e => e.getBoundingClientRect().height))
  expect(heights[0], 'the opened card should be taller than its closed neighbours')
    .toBeGreaterThan(heights[1] + 20)
  expect(heights[1], 'the two closed cards should still match each other').toBeCloseTo(heights[2], 0)
})

test('nothing on the desk is squeezed into a column', async ({ page }) => {
  await openEveryTool(page)
  await assertNoSqueezedText(page, TAB)
})

test('no machine strings reach the reader', async ({ page }) => {
  await openEveryTool(page)
  await assertNoRawErrors(page, TAB)
})

test('nothing overflows its own box', async ({ page }) => {
  await openEveryTool(page)
  await assertNothingOverflows(page, TAB)
})

test('the tab has no scroller of its own', async ({ page }) => {
  // The page column scrolls; nothing inside the tab may. A scroll box inside a
  // scroll box means the wheel does something different depending on where the
  // pointer happens to be.
  await openEveryTool(page)
  const boxes = await scrollContainers(page, TAB)
  expect(boxes, `nested scroll boxes: ${boxes.join(' | ')}`).toHaveLength(0)
})

test('the desk has no hole in it', async ({ page }) => {
  // With the tools closed the top band is the whole desk, and it is the band
  // this probe exists for: the ask at 620px with nothing beside it left a
  // rectangle of bare desk that a bounding-box width measure scored as fine.
  const { fraction, rect } = await largestHole(page, TAB)
  expect(fraction, `largest empty rectangle is ${(fraction * 100).toFixed(0)}% of the tab at ${JSON.stringify(rect)}`)
    .toBeLessThan(0.25)
})
