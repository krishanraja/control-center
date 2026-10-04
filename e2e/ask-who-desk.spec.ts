import { test, expect, type Page, type Route } from '@playwright/test'
import { mockFocus, FOCUS_AFTERNOON } from './fixtures/focus'
import { assertNothingOverflows, assertNoRawErrors, assertNoSqueezedText, assertRendered } from './fixtures/layout'

/**
 * "Who do I ask, and what do I say?" on the Focus desk.
 *
 * The proposer shipped on 2026-10-03 having never been rendered once: it was
 * typechecked, linted, passed every structural guard, and no test had put a
 * single candidate on a screen. That is the exact gap this repo keeps learning
 * about, so the spec exists before the feature is called finished.
 *
 * What it holds, each of which is a way the card could be wrong while every
 * other check stays green:
 *  - three candidates with long, honest text do not burst the ask card
 *  - the proof line is on screen, because it is the whole argument for trusting
 *    the sentence above it
 *  - "Use this wording" lands in the compose field, which is the one thing the
 *    feature is for
 *  - a need that matches nobody says so in words, rather than rendering nothing
 *
 * Like the other desk specs it never calls setViewportSize: the width comes
 * from the project. Focus is a scroller, so probes point at the ask card, not
 * at `main`.
 */

const CARD = '[data-testid="focus-ask"]'

// Deliberately the longest honest answer, not a tidy one: a 7-year gap, a name
// with an accent, a 90-word ask and a proof line that names three channels.
const CANDIDATES = [
  {
    contact_id: 'aaaaaaaa-0000-4000-8000-000000000001',
    name: 'Delphine Okafor-Lévesque',
    title: 'Senior Director, AI Product Growth',
    company: 'Northwind Cloud',
    why_them: 'She is Senior Director of AI Product Growth at Northwind Cloud, which puts her close to how a large enterprise actually budgets for AI capability, and she can point to who owns that decision.',
    why_now: 'She wrote to you last and it has been 7 years without a reply from you, so you owe her the first word before you ask for anything.',
    ask: 'Delphine, it has been far too long and I owe you a reply from years back, sorry about that. I am building Mindmake, helping large companies run AI capability programmes that actually stick rather than fade after the pilot. Given your seat at Northwind Cloud, do you know anyone who owns AI training or enablement budget for a big organisation? Even a name to look up would help me enormously.',
    channel: 'LinkedIn',
    give_back: 'happy to share what we are seeing across other enterprise AI rollouts',
    confidence: 'medium',
    evidence: { summary: '5 messages both ways on LinkedIn; 2 meetings, last 7 months ago; quiet for 7 years; they wrote last, so a reply is owed; known for 7 years.', warmth: 26, measured: true },
  },
  {
    contact_id: 'aaaaaaaa-0000-4000-8000-000000000002',
    name: 'Sabine Morrow',
    title: 'AI Strategist and Builder',
    company: 'Brightlane Labs',
    why_them: 'She runs Brightlane Labs and has trained many business leaders to build with AI, so she sits in the same buyer conversations you need.',
    why_now: 'She wrote to you last 16 months ago and never got a reply.',
    ask: 'Sabine, sorry for leaving your last message hanging, that one is on me. I am working on Mindmake, AI capability engagements for large companies, and trying to find the people who actually hold the budget inside big organisations. Do you know anyone who buys AI training at that scale?',
    channel: 'LinkedIn',
    give_back: 'glad to swap notes on what is landing in AI training right now',
    confidence: 'medium',
    evidence: { summary: '4 messages both ways on LinkedIn; quiet for 16 months; they wrote last, so a reply is owed; known for about a year.', warmth: 32, measured: true },
  },
  {
    contact_id: 'aaaaaaaa-0000-4000-8000-000000000003',
    name: 'Niall Barraclough',
    title: 'Founder and Principal Consultant',
    company: 'Fernhill Advisory',
    why_them: 'He is a fractional Chief AI Officer for founder-led companies, so he is close to AI spend decisions, though his usual client is smaller than the one you are after.',
    why_now: 'You wrote to him last 17 months ago and never heard back, so this is a clean reopen rather than an owed reply.',
    ask: 'Niall, it has been a while, I hope things are going well with Fernhill. I am building out Mindmake and looking for an introduction to someone who buys AI training programmes inside a big organisation. Do you know anyone like that?',
    channel: 'email',
    give_back: 'happy to trade notes on where AI adoption stalls across our different client sizes',
    confidence: 'low',
    evidence: { summary: '4 messages both ways on LinkedIn; quiet for 17 months; known for about a year.', warmth: 30, measured: true },
  },
]

async function mockAsk(page: Page, candidates: unknown[]) {
  await page.route('**/api/network/ask', (r: Route) =>
    r.fulfill({ json: { ok: true, need: 'an intro', candidates } }))
}

async function propose(page: Page, candidates: unknown[] = CANDIDATES) {
  await mockAsk(page, candidates)
  await page.getByTestId('ask-who-open').click()
  await page.getByTestId('ask-who').getByRole('textbox').fill('An introduction to someone who buys AI training for a large company')
  await page.getByRole('button', { name: 'Find three people' }).click()
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FOCUS_AFTERNOON)
  await mockFocus(page)
  await page.goto('/#/focus')
  // In this order: a crashed tab passes most probes, because an error boundary
  // has nothing in it to overflow or squeeze.
  await assertRendered(page, 'main')
  await expect(page.locator(CARD)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Today\u2019s ask' })).toBeVisible()
})

test('three proposals fit the ask card, with the proof under each name', async ({ page }) => {
  await propose(page)
  const cards = page.getByTestId('ask-who-candidate')
  await expect(cards).toHaveCount(3)

  // The proof line is the argument for believing the sentence above it. If it
  // is clipped or absent the feature is just a model's opinion.
  await expect(page.getByText(/they wrote last, so a reply is owed/).first()).toBeVisible()
  await expect(page.getByText(/5 messages both ways on LinkedIn/)).toBeVisible()

  // Plain words, never the stored slug.
  await expect(page.getByText(/linkedin_dm/)).toHaveCount(0)
  await expect(page.getByText(/Send on LinkedIn\./).first()).toBeVisible()

  await assertNothingOverflows(page, CARD)
  await assertNoSqueezedText(page, CARD)
  await assertNoRawErrors(page, CARD)
})

test('the chosen wording lands in today’s ask', async ({ page }) => {
  await propose(page)
  await page.getByRole('button', { name: 'Use this wording' }).first().click()

  const compose = page.getByTestId('ask-compose').getByRole('textbox').first()
  await expect(compose).toHaveValue(/I owe you a reply from years back/)
  // The guess is his, never the machine's: a prefilled prediction would teach
  // him about a guess he never made.
  await expect(page.getByTestId('ask-guess-20')).toHaveAttribute('aria-pressed', 'false')
})

test('a need that matches nobody says so', async ({ page }) => {
  await propose(page, [])
  await expect(page.getByText(/Nobody in your network matches that yet/)).toBeVisible()
  await expect(page.getByTestId('ask-who-candidate')).toHaveCount(0)
  await assertNoRawErrors(page, CARD)
})
