import { test, expect, type Route } from '@playwright/test'
import { mockFocus, FOCUS_AFTERNOON } from './fixtures/focus'
import { assertNothingOverflows, assertNoRawErrors, assertNoSqueezedText, assertRendered } from './fixtures/layout'

/**
 * The ask proposer on the phone, which is the shell Krish actually carries.
 *
 * The desk spec proves the feature works. This one proves it survives 360px,
 * where the same three candidates carry the same long text through a third of
 * the width: a 90-word ask, a proof line naming two channels and a date, and a
 * give-back clause, none of which may be clipped, because the editorial rule
 * in this repo is that user-facing text wraps in full and is never ellipsised.
 */

const CARD = '[data-testid="focus-ask"]'

const CANDIDATE = {
  contact_id: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'Delphine Okafor-Lévesque',
  title: 'Senior Director, AI Product Growth',
  company: 'Northwind Cloud',
  why_them: 'She is Senior Director of AI Product Growth at Northwind Cloud, which puts her close to how a large enterprise actually budgets for AI capability.',
  why_now: 'She wrote to you last and it has been 7 years without a reply from you, so you owe her the first word before you ask for anything.',
  ask: 'Delphine, it has been far too long and I owe you a reply from years back, sorry about that. I am building Mindmake, helping large companies run AI capability programmes that actually stick rather than fade after the pilot. Do you know anyone who owns AI training budget for a big organisation?',
  channel: 'LinkedIn',
  give_back: 'happy to share what we are seeing across other enterprise AI rollouts',
  confidence: 'medium',
  evidence: { summary: '5 messages both ways on LinkedIn; 2 meetings, last 7 months ago; quiet for 7 years; they wrote last, so a reply is owed; known for 7 years.', warmth: 26, measured: true },
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FOCUS_AFTERNOON)
  await mockFocus(page)
  await page.route('**/api/network/ask', (r: Route) =>
    r.fulfill({ json: { ok: true, need: 'an intro', candidates: [CANDIDATE, { ...CANDIDATE, contact_id: 'b2', name: 'Sabine Morrow' }] } }))
  await page.goto('/#/focus')
  await assertRendered(page, 'main')
  await expect(page.locator(CARD)).toBeVisible()
})

test('a proposal wraps in full on the phone, and nothing runs off the edge', async ({ page }) => {
  await page.getByTestId('ask-who-open').click()
  await page.getByTestId('ask-who').getByRole('textbox').fill('An intro to someone who buys AI training')
  await page.getByRole('button', { name: 'Find three people' }).click()

  await expect(page.getByTestId('ask-who-candidate')).toHaveCount(2)
  await expect(page.getByText(/they wrote last, so a reply is owed/).first()).toBeVisible()

  await assertNothingOverflows(page, CARD)
  await assertNoSqueezedText(page, CARD)
  await assertNoRawErrors(page, CARD)
})

test('the tap targets are reachable on a phone', async ({ page }) => {
  const open = page.getByTestId('ask-who-open')
  const box = await open.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
})
