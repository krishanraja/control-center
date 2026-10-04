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
    ...ROW_BASE, contact_id: '11111111-1111-4111-8111-111111111111', full_name: 'Corin Halloway',
    title: 'Chief Executive Officer', company: 'Example Media Group',
    plays: ['alumni', 'buyer'],
    shared_history: [{ key: 'nine', label: 'Nine', closeness: 'close', their_title: 'Sales Manager', current: false }],
  },
  {
    ...ROW_BASE, contact_id: '22222222-2222-4222-8222-222222222222', full_name: 'Tobias Renwick',
    title: 'Head of Sales', company: 'Captify',
    plays: ['alumni', 'buyer', 'multiplier'],
    shared_history: [{ key: 'captify', label: 'Captify', closeness: 'close', their_title: 'Head of Sales', current: true }],
  },
  {
    ...ROW_BASE, contact_id: '33333333-3333-4333-8333-333333333333', full_name: 'Imogen Achterberg',
    title: 'Head of Partnerships', company: 'Contoso',
    plays: ['buyer'],
    shared_history: [{ key: 'microsoft', label: 'Microsoft', closeness: 'wide', their_title: 'Account Executive', current: false }],
  },
]

const FRIEND = {
  ...ROW_BASE, contact_id: '44444444-4444-4444-8444-444444444444', full_name: 'Wren Castellane',
  title: 'Chief Marketing Officer', company: 'Harbourline', origin_channel: 'meta_export', linkedin_url: null,
  plays: ['buyer'], tie: 'personal', known_from: ['facebook', 'instagram'],
  shared_history: [{ key: 'sutton_grammar', label: 'Sutton Grammar School', closeness: 'close', their_title: null, current: false, kind: 'school', their_years: '1999 - 2006', krish_years: '2004 to 2005', same_years: true }],
}

const SCHOOLS = [
  { key: 'sutton_grammar', label: 'Sutton Grammar School', closeness: 'close', kind: 'school' },
  { key: 'manchester', label: 'the University of Manchester', closeness: 'wide', kind: 'school' },
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
      return r.fulfill({ json: { ok: true, counts: { alumni: 826, personal: 1180, multiplier: 182, buyer: 2207, amplifier: 152, subject: 348 }, employers: EMPLOYERS, schools: SCHOOLS, people: 12_400 } })
    }
    const body = r.request().postDataJSON() as Record<string, unknown>
    posts.push(body)
    if (body.play === 'personal') {
      return r.fulfill({ json: { ok: true, results: [FRIEND], restated: 'People you know outside work, the ones who can help now first', weak: false } })
    }
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

  await expect(page.getByText('Also at Nine, as Sales Manager.')).toBeVisible()
  await expect(page.getByText('Now at Captify, where you worked, as Head of Sales.')).toBeVisible()
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

test('the personal door finds the people he knows outside work, and opens his schools', async ({ page }) => {
  const posts: Array<Record<string, unknown>> = []
  await openNetwork(page, posts)
  await expect(page.getByTestId('network-play-personal')).toContainText('1,180')
  await page.getByTestId('network-play-personal').click()
  await expect.poll(() => posts.length).toBe(1)
  expect(posts[0]).toMatchObject({ play: 'personal', employer: null })

  // Where he knows them from is the networks, not the pipeline that loaded
  // them, and a school shared in the same years says so.
  await expect(page.getByText('Facebook · Instagram').first()).toBeVisible()
  await expect(page.getByText('Went to Sutton Grammar School in the same years as you.')).toBeVisible()

  // A school is asked for the same way an employer is.
  await expect(page.getByTestId('network-school-manchester')).toContainText('(large)')
  await page.getByTestId('network-school-sutton_grammar').click()
  await expect.poll(() => posts.length).toBe(2)
  expect(posts[1]).toMatchObject({ play: 'personal', employer: 'sutton_grammar' })

  await assertNothingOverflows(page, '[data-testid="network-plays"]')
})
