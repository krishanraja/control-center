import { test, expect } from '@playwright/test'
import { assertNoRawErrors, assertNothingOverflows, assertNoSqueezedText } from './fixtures/layout'
import { MERGES, openNetwork } from './fixtures/peopleReview'

/**
 * People to check on the phone, where Krish is most likely to answer a few
 * questions in a spare minute. The two records of a pair stack rather than
 * squeeze, every answer is a full tap target, and nothing runs off a 360px
 * screen. Every person here is invented.
 */

test('a pair stacks on a phone and every answer fits', async ({ page }) => {
  const posts: Array<Record<string, unknown>> = []
  await openNetwork(page, posts)
  await expect(page.getByTestId('people-review-open')).toHaveText('4 people to check', { timeout: 15_000 })
  await page.getByTestId('people-review-open').click()

  const card = page.getByTestId('people-review-merge')
  await expect(card).toBeVisible()
  // Both rectangles in one frame: the sheet springs in, and two separate reads
  // land on different frames of the slide.
  const { a, b } = await page.evaluate(() => {
    const r = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect()
    const a = r('people-review-a'); const b = r('people-review-b')
    return { a: { x: a.x, y: a.y, w: a.width, h: a.height }, b: { x: b.x, y: b.y, w: b.width, h: b.height } }
  })
  expect(b.y >= a.y + a.h - 1, `the second record sits under the first, not squeezed beside it: ${JSON.stringify({ a, b })}`).toBe(true)
  expect(a.w > 280, 'each record takes the width of the sheet').toBe(true)

  for (const name of ['Same person', 'Different people', 'Not sure']) {
    const box = await card.getByRole('button', { name }).boundingBox()
    expect(box && box.height >= 44, `${name} is a full tap target`).toBe(true)
  }

  await assertNothingOverflows(page, '[data-testid="people-review"]')
  await assertNoSqueezedText(page, '[data-testid="people-review"]')
  await assertNoRawErrors(page, '[data-testid="people-review"]')

  await card.getByRole('button', { name: 'Same person' }).click()
  await expect.poll(() => posts.length).toBe(1)
  expect(posts[0]).toMatchObject({ suggestion_id: MERGES[0].id, verdict: 'accepted' })
})
