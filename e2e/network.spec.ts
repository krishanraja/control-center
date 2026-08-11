import { test, expect, type Page } from '@playwright/test'

/**
 * Network tab E2E, deterministic: /api/network/* and every Supabase call is
 * mocked, so the spec asserts UI behaviour and never spends an embedding or a
 * model call.
 *
 * The subject is the search lifecycle — ask, read, clear, ask again — because
 * that loop is the whole surface. A search you cannot get out of is a search
 * you only run once.
 *
 * Requires the preview build to carry VITE_UI_V2_ENABLED=true; without it the
 * network lane still renders the pre-v2 substring list and none of this exists.
 */

function person(i: number, over: Record<string, unknown> = {}) {
  return {
    contact_id: `c${i}`,
    full_name: `Person ${i}`,
    company: `Company ${i}`,
    title: 'Chief Marketing Officer',
    email: `p${i}@example.com`,
    linkedin_url: null,
    who: 'CMO at a large bank.',
    why_them: 'Owns the martech budget.',
    hook: 'Spoke about AI governance last month.',
    risk: null,
    roles: ['buyer'],
    surface_when: [],
    network_tier: '1_reciprocated',
    best_channel: 'email',
    reachable_via: ['email'],
    confidence: 'high',
    intel_method: 'llm_v2',
    seniority: 'founder_cxo',
    country: 'Australia',
    industry: 'Financial services',
    venture_scores: { mindmaker: 80 },
    thin_evidence: false,
    match_score: 90 - i,
    query_relevance: 0.7,
    s_semantic: 0.6, s_lexical: 0.4, s_constraint: 0.5,
    s_relationship: 0.8, s_actionability: 0.7, venture_multiplier: 1,
    ...over,
  }
}

async function mockNetworkApis(page: Page, onSearch?: (body: any) => void) {
  await page.route('**/api/network/search', r => {
    onSearch?.(r.request().postDataJSON())
    return r.fulfill({
      json: {
        ok: true,
        restated: 'Marketing leaders at banks who care about AI governance.',
        weak: false,
        degraded: [],
        results: [person(1), person(2), person(3)],
      },
    })
  })
  await page.route('**/api/network/recommend', r =>
    r.fulfill({
      json: {
        ok: true,
        restated: 'People to sell Mindmaker to.',
        weak: false,
        degraded: [],
        results: [person(7, { full_name: 'Recommended Person' })],
      },
    }))
  // Phase two. Returning nothing is a valid degrade path and keeps the spec
  // focused on the list rather than on the reasons.
  await page.route('**/api/network/explain', r => r.fulfill({ json: { ok: true, explanations: [] } }))
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', r => r.abort())
}

// Selection goes through data-testid throughout. Both the filter bar and the
// recommender render a chip reading "Mindmaker", and "Clear search" contains
// "Search", so accessible-name matching is ambiguous on this surface by
// construction, not by accident.
const input = (page: Page) => page.getByTestId('network-search-input')
const clearButton = (page: Page) => page.getByTestId('network-search-clear')

async function openNetwork(page: Page) {
  await page.goto('/#/relationships')
  await expect(input(page)).toBeVisible()
}

async function runSearch(page: Page, q = 'CMOs at banks who care about AI governance') {
  await input(page).fill(q)
  await page.getByTestId('network-search-submit').click()
  await expect(page.getByText('Person 1')).toBeVisible()
}

test('search renders the restated question and the ranked people', async ({ page }) => {
  await mockNetworkApis(page)
  await openNetwork(page)
  await runSearch(page)

  await expect(page.getByText('Marketing leaders at banks who care about AI governance.')).toBeVisible()
  for (const n of [1, 2, 3]) await expect(page.getByText(`Person ${n}`)).toBeVisible()
})

test('the clear button empties the field, drops the results and restores the starting state', async ({ page }) => {
  await mockNetworkApis(page)
  await openNetwork(page)
  await runSearch(page)

  await clearButton(page).click()

  await expect(input(page)).toHaveValue('')
  // The results and the interpretation go with the query. Leaving either behind
  // is the bug this button exists to fix.
  await expect(page.getByText('Person 1')).toHaveCount(0)
  await expect(page.getByText('Marketing leaders at banks who care about AI governance.')).toHaveCount(0)
  // Back to the state the tab opens in, examples and venture picker included.
  await expect(page.getByText('Ask a question, or pick a venture above.')).toBeVisible()
  await expect(page.getByTestId('network-recommender')).toBeVisible()
  await expect(input(page)).toBeFocused()
  // The clear button itself goes once there is nothing left to clear.
  await expect(clearButton(page)).toHaveCount(0)
})

test('clear is reachable by keyboard through Escape', async ({ page }) => {
  await mockNetworkApis(page)
  await openNetwork(page)
  await runSearch(page)

  await input(page).press('Escape')
  await expect(page.getByText('Person 1')).toHaveCount(0)
  await expect(input(page)).toHaveValue('')
})

test('a second search runs clean after a clear', async ({ page }) => {
  const sent: any[] = []
  await mockNetworkApis(page, b => sent.push(b))
  await openNetwork(page)
  await runSearch(page)

  await clearButton(page).click()
  await runSearch(page, 'publisher-side identity people in Australia')

  expect(sent).toHaveLength(2)
  expect(sent[1].question).toBe('publisher-side identity people in Australia')
  // Filters reset with the query, so the second search is not quietly narrowed
  // by a chip left lit from the first.
  expect(sent[1].venture).toBeNull()
  expect(sent[1].roles).toBeNull()
  expect(sent[1].tiers).toBeNull()
})

test('a recommendation can be cleared back to the venture picker', async ({ page }) => {
  await mockNetworkApis(page)
  await openNetwork(page)

  await page.getByTestId('network-recommend-venture-mindmaker').click()
  await page.getByTestId('network-recommend-go').click()
  await expect(page.getByText('Recommended Person')).toBeVisible()

  // Nothing was typed, so the clear affordance has to key off the results
  // rather than off the input value.
  await clearButton(page).click()
  await expect(page.getByText('Recommended Person')).toHaveCount(0)
  await expect(page.getByTestId('network-recommender')).toBeVisible()
})

test('clear works on a phone viewport, where the field is the only control in reach', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockNetworkApis(page)
  await openNetwork(page)
  await runSearch(page)

  const clear = clearButton(page)
  await expect(clear).toBeVisible()
  const box = await clear.boundingBox()
  // Inside the field, not off the edge of a 390px screen.
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await clear.click()
  await expect(page.getByText('Person 1')).toHaveCount(0)
})
