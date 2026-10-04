import { test, expect } from '@playwright/test'
import { assertNoRawErrors, assertNothingOverflows } from './fixtures/layout'
import { MERGES, LINKS, openNetwork } from './fixtures/peopleReview'

/**
 * People to check (2026-10-04): the two questions about people only Krish can
 * answer, raised by a merge pass and an import that refused to guess.
 *
 * What this holds, each a way it could be wrong while everything else stays
 * green:
 *  - the entry point appears only when there is something to check, and says
 *    how many
 *  - "Same person" sends an accepted verdict for THAT question, and the next
 *    card is already there
 *  - "Different people" is a rejection with a reason, never a silent skip
 *  - a profile question with several candidates sends the index chosen, and
 *    "None of these" rejects them all
 *  - a memorial match asks plainly and offers both answers
 *
 * Every person here is invented.
 */

test('the entry point says how many people there are to check', async ({ page }) => {
  await openNetwork(page, [])
  await expect(page.getByTestId('people-review-open')).toHaveText('4 people to check', { timeout: 15_000 })
  // The tab's own count follows the network, not a number typed in once.
  await expect(page.getByText('12,400 people. Type it how you would say it.')).toBeVisible()
})

test('nothing to check, no entry point', async ({ page }) => {
  await openNetwork(page, [], { contact_merge: 0, contact_link: 0 })
  await expect(page.getByTestId('network-plays')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('people-review-open')).toHaveCount(0)
})

test('same person sends an accepted verdict and moves to the next pair', async ({ page }) => {
  const posts: Array<Record<string, unknown>> = []
  await openNetwork(page, posts)
  await page.getByTestId('people-review-open').click()

  const card = page.getByTestId('people-review-merge')
  await expect(card).toBeVisible()
  await expect(page.getByTestId('people-review-a')).toContainText('Chief Revenue Officer at Glasshouse Media')
  await expect(page.getByTestId('people-review-a')).toContainText('LinkedIn and email')
  await expect(page.getByTestId('people-review-b')).toContainText('Facebook and Instagram')

  await card.getByRole('button', { name: 'Same person' }).click()
  await expect.poll(() => posts.length).toBe(1)
  expect(posts[0]).toMatchObject({ suggestion_id: MERGES[0].id, verdict: 'accepted' })
  // The next pair is already on screen.
  await expect(page.getByTestId('people-review-a')).toContainText('Declan Ashworth')

  await page.getByTestId('people-review-merge').getByRole('button', { name: 'Different people' }).click()
  await expect.poll(() => posts.length).toBe(2)
  expect(posts[1]).toMatchObject({ suggestion_id: MERGES[1].id, verdict: 'rejected', reason_code: 'different_people' })

  await assertNothingOverflows(page, '[data-testid="people-review"]')
  await assertNoRawErrors(page, '[data-testid="people-review"]')
})

test('which profile: a chosen candidate sends its index; none of these rejects', async ({ page }) => {
  const posts: Array<Record<string, unknown>> = []
  await openNetwork(page, posts)
  await page.getByTestId('people-review-open').click()
  await page.getByTestId('people-review-contact_link').click()

  const card = page.getByTestId('people-review-link')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Saffron Mbeki-Hart')
  await expect(page.getByTestId('people-review-candidate')).toHaveCount(2)
  await page.getByTestId('people-review-candidate').nth(1).getByRole('button', { name: "That's them" }).click()
  await expect.poll(() => posts.length).toBe(1)
  expect(posts[0]).toMatchObject({ suggestion_id: LINKS[0].id, verdict: 'accepted', choice: 1 })

  // The memorial question asks plainly, and offers both answers.
  const memorial = page.getByTestId('people-review-link')
  await expect(memorial).toContainText('Is this them?')
  await expect(memorial.getByRole('button', { name: 'Yes, they have passed away' })).toBeVisible()
  await memorial.getByRole('button', { name: 'Not them' }).click()
  await expect.poll(() => posts.length).toBe(2)
  expect(posts[1]).toMatchObject({ suggestion_id: LINKS[1].id, verdict: 'rejected', reason_code: 'not_their_profile' })
})
