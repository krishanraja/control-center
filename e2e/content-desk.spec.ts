import { test, expect } from '@playwright/test'
import { mockPopulatedContent, assertFixturesLanded } from './fixtures/populated'
import {
  assertNothingOverflows, assertNoSqueezedText, assertNoRawErrors, assertRendered,
  scrollContainers, largestHole, assertFrameDoesNotScroll,
} from './fixtures/layout'

/**
 * The Content desk above the 1400px breakpoint, holding real data.
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

test.beforeEach(async ({ page }) => {
  await mockPopulatedContent(page)
  await page.goto('/#/content')
  // Nothing below is worth measuring until the fixtures are demonstrably on
  // screen. An empty page passes every layout assertion in this file.
  // In this order. A crashed tab passes most of the probes below, because an
  // error boundary has nothing in it to squeeze, overflow or leave a hole.
  await assertRendered(page, 'main')
  await assertFixturesLanded(page, 'In progress')
})

test('the desk is wide enough to be the desk', async ({ page }) => {
  expect(page.viewportSize()!.width).toBeGreaterThanOrEqual(1440)
  await expect(page.getByTestId('content-rail')).toBeVisible()
})

test('nothing on the desk is squeezed into a column', async ({ page }) => {
  await assertNoSqueezedText(page, 'main')
})

test('no machine strings reach the reader', async ({ page }) => {
  await assertNoRawErrors(page, 'main')
})

test('nothing overflows its own box', async ({ page }) => {
  await assertNothingOverflows(page, 'main')
})

test('the desk has at most one scroller', async ({ page }) => {
  const boxes = await scrollContainers(page, 'main')
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
