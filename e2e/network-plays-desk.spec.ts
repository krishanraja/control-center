import { test, expect, type Page, type Route } from '@playwright/test'
import { assertNoSqueezedText, assertNoRawErrors, assertRendered, assertNothingOverflows } from './fixtures/layout'
import { answerPilotGate } from './pilot-gate-mock'

/**
 * Browsing the network by what people can do for Krish (2026-10-03).
 *
 * Search answers "who matches these words". These doors answer the question he
 * actually brought: the colleagues who watched him scale three businesses, the
 * people who reach many buyers at once, the ones holding a budget, the ones who
 * put him in rooms, the builders worth a story.
 *
 * What this holds, each a way the feature could be wrong while every other
 * check stays green:
 *  - the shared-history line never says "worked together". Career rows carry a
 *    duration, not dates, so the record can prove both were at Nine and
 *    nothing more
 *  - a large employer says it is large. "Also at Microsoft" implies a closeness
 *    a company of 220,000 does not carry
 *  - the employer chip asks for that employer, not "alumni AND that employer",
 *    which for a large one returns almost nobody
 *  - "buyer" earns no badge: it sits on a third of the network
 */

const ROW_BASE = {
  company: null, title: null, email: null, linkedin_url: 'https://www.linkedin.com/in/x',
  twitter_handle: null, origin_channel: 'linkedin_export', origin_campaign: null, first_met_context: null,
  followers: null, completeness: 80, intent_score: null, intent_stance: null, intent_evidence: null,
  intent_evidence_url: null, intent_topics: null, intent_summary: null, last_post_at: null,
  who: null, why_them: null, hook: null, risk: null, roles: [], surface_when: [],
  network_tier: '2_core_network', best_channel: null, reachable_via: ['linkedin'], confidence: 'medium',
  intel_method: 'rules_v1', seniority: null, country: null, geo_code: null, industry: null,
  venture_scores: {}, thin_evidence: false, sells_competing_services: false,
  match_score: 61.2, query_relevance: null, s_semantic: 0, s_lexical: 0, s_constraint: 0,
  s_relationship: 0.71, s_actionability: 0.52, venture_multiplier: 1,
}

const ROWS = [
  {
    ...ROW_BASE, contact_id: '11111111-1111-4111-8111-111111111111', full_name: 'Michael Stephenson',
    title: 'Chief Executive Officer', company: 'Example Media Group',
    plays: ['alumni', 'buyer'],
    shared_history: [{ key: 'nine', label: 'Nine', closeness: 'close', their_title: 'Commercial Director - Digital', current: false }],
  },
  {
    ...ROW_BASE, contact_id: '22222222-2222-4222-8222-222222222222', full_name: 'Rishi Chande',
    title: 'Managing Director', company: 'Captify',
    plays: ['alumni', 'buyer', 'multiplier'],
    shared_history: [{ key: 'captify', label: 'Captify', closeness: 'close', their_title: 'Managing Director', current: true }],
  },
  {
    ...ROW_BASE, contact_id: '33333333-3333-4333-8333-333333333333', full_name: 'Priya Nandakumar',
    title: 'Head of Partnerships', company: 'Contoso',
    plays: ['buyer'],
    shared_history: [{ key: 'microsoft', label: 'Microsoft', closeness: 'wide', their_title: 'Account Executive', current: false }],
  },
]

const EMPLOYERS = [
  { key: 'amobee', label: 'Amobee (now Nexxen)', closeness: 'close' },
  { key: 'captify', label: 'Captify', closeness: 'close' },
  { key: 'nine', label: 'Nine', closeness: 'close' },
  { key: 'microsoft', label: 'Microsoft', closeness: 'wide' },
]

async function openNetwork(page: Page, posts: Array<Record<string, unknown>>) {
  // Catch-alls FIRST: Playwright matches routes in reverse registration order.
  await page.route('**/realtime/**', r => r.abort())
  await page.route('**/api/**', r => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }))
  await page.route('**/api/network/geo', r => r.fulfill({ json: { ok: true, total: 10_670, known: 4_212, unknown: 6_458, countries: [] } }))
  await page.route('**/api/network/by-play', (r: Route) => {
    if (r.request().method() === 'GET') {
      return r.fulfill({ json: { ok: true, counts: { alumni: 826, multiplier: 182, buyer: 2207, amplifier: 152, subject: 348 }, employers: EMPLOYERS } })
    }
    posts.push(r.request().postDataJSON() as Record<string, unknown>)
    return r.fulfill({ json: { ok: true, results: ROWS, restated: 'People who worked at a company you worked at, senior ones first', weak: false } })
  })
  await answerPilotGate(page)
  await page.goto('/#/people?lane=network')
  await assertRendered(page, 'main')
  await expect(page.getByTestId('network-plays')).toBeVisible({ timeout: 15_000 })
}

test('the five doors carry their counts', async ({ page }) => {
  await openNetwork(page, [])
  await expect(page.getByTestId('network-play-alumni')).toContainText('826')
  await expect(page.getByTestId('network-play-multiplier')).toContainText('182')
  await expect(page.getByTestId('network-play-subject')).toContainText('Worth a story')
})

test('alumni rows say both were there, and never that they worked together', async ({ page }) => {
  const posts: Array<Record<string, unknown>> = []
  await openNetwork(page, posts)
  await page.getByTestId('network-play-alumni').click()

  await expect(page.getByText('Also at Nine, as Commercial Director - Digital.')).toBeVisible()
  await expect(page.getByText('Now at Captify, where you worked, as Managing Director.')).toBeVisible()
  // The large employer says so, rather than implying a closeness.
  await expect(page.getByText(/Also at Microsoft, a large company/)).toBeVisible()
  await expect(page.getByText(/worked together/i)).toHaveCount(0)

  // Multiplier earns a badge; buyer, on a third of the network, does not.
  await expect(page.getByTestId('network-row-play-multiplier')).toHaveCount(1)
  await expect(page.getByTestId('network-row-play-buyer')).toHaveCount(0)

  expect(posts[0]).toMatchObject({ play: 'alumni', employer: null })

  // The picker, not main: the results list below it is a scroller on purpose,
  // and a probe aimed at main flags the page's legitimate scroller.
  await assertNothingOverflows(page, '[data-testid="network-plays"]')
  await assertNoSqueezedText(page, 'main')
  await assertNoRawErrors(page, 'main')
})

test('an employer chip asks for that employer, and stays open to switch', async ({ page }) => {
  const posts: Array<Record<string, unknown>> = []
  await openNetwork(page, posts)
  await page.getByTestId('network-play-alumni').click()

  const employers = page.getByTestId('network-play-employers')
  await expect(employers).toBeVisible()
  await expect(page.getByTestId('network-employer-microsoft')).toContainText('(large)')

  await page.getByTestId('network-employer-captify').click()
  await expect.poll(() => posts.length).toBe(2)
  expect(posts[1]).toMatchObject({ play: 'alumni', employer: 'captify' })

  // Moving from Captify to Nine is one tap, not clear-and-start-again.
  await page.getByTestId('network-employer-nine').click()
  await expect.poll(() => posts.length).toBe(3)
  expect(posts[2]).toMatchObject({ employer: 'nine' })
})
