import { test, expect } from '@playwright/test'
import { mockPilots } from './fixtures/pilots'
import { ADVISORY_LABEL } from '../src/hooks/usePilots'
import {
  assertNothingOverflows, assertNoSqueezedText, assertNoRawErrors, assertRendered,
  scrollContainers, largestHole,
} from './fixtures/layout'

/**
 * Advisory on a desk, which nothing measured before.
 *
 * `pilots-noscroll.spec.ts` covers 390x844 and 360x800 and stops there, so the
 * lane's desk layout — `grid grid-cols-1 xl:grid-cols-2` over the deal list —
 * had never been rendered by a test. With one drafted deal that grid gives two
 * equal tracks and fills one, so half the screen is empty while the draft
 * scrolls inside a six-row textarea. That is what Krish saw: "you have used the
 * screen space terribly with horrible box scrolling and half the page wasted."
 *
 * 'one' is the state that produced it, so it is the state asserted here.
 */

for (const state of ['one', 'full'] as const) {
  test.describe(`${state} deal(s)`, () => {
    test.beforeEach(async ({ page }) => {
      await mockPilots(page, state)
      await page.goto('/#/people?lane=pilots')
      await assertRendered(page, 'main')
      // Scoped to the list: the lane's move names the first drafted person too.
      await expect(page.getByTestId('pilot-deal-list').getByText('Sam Patel')).toBeVisible({ timeout: 15_000 })
    })

    test(`${ADVISORY_LABEL} leaves no half-empty screen`, async ({ page }) => {
      const { fraction, rect } = await largestHole(page, 'main')
      expect(fraction, `largest empty rectangle is ${(fraction * 100).toFixed(0)}% of the lane at ${JSON.stringify(rect)}`)
        .toBeLessThan(0.25)
    })

    test('the draft does not scroll in a box of its own', async ({ page }) => {
      // Scoped to the deal list, not to `main`. The People shell is a normal
      // scrolling page — every lane on it scrolls, and the no-scroll ruling
      // was about Content, not about this shell. What Krish called "horrible
      // box scrolling" is a scroll box INSIDE the page: the six-row draft
      // textarea, where the wheel did something different depending on where
      // the pointer was. That is what must be zero here.
      const boxes = await scrollContainers(page, '[data-testid="pilot-deal-list"]')
      expect(boxes, `scroll boxes inside the deal list: ${boxes.join(' | ')}`).toHaveLength(0)
    })

    test('nothing overflows, nothing is squeezed, nothing raw reaches the reader', async ({ page }) => {
      await assertNothingOverflows(page, '[data-testid="pilot-deal-list"]')
      await assertNoSqueezedText(page, 'main')
      await assertNoRawErrors(page, 'main')
    })
  })
}

// A prepared move at the send wall (ADR-030): the lane's one move is a link to
// the Gmail draft the OS already wrote, and the press is his. Before this the
// button scrolled to the card and said "Show the note".
test('the drafted deal\'s move is a link to his Gmail draft, and his press is the only one', async ({ page }) => {
  await mockPilots(page, 'one')
  await page.goto('/#/people?lane=pilots')
  const primary = page.getByTestId('pilots-move-primary')
  await expect(primary).toBeVisible({ timeout: 15_000 })
  await expect(primary).toHaveAttribute('href', 'https://mail.google.com/mail/u/0/#drafts/abc')
  await expect(primary).toContainText('Open the draft in Gmail')
  await expect(page.getByTestId('pilots-move-secondary')).toContainText('See it')
})
