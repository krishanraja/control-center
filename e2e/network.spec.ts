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
    twitter_handle: null,
    origin_channel: 'community',
    origin_campaign: 'ai_circle',
    first_met_context: 'AI Circle member, imported Sep 2026',
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
    geo_code: 'AU',
    industry: 'Financial services',
    venture_scores: { mindmake: 80 },
    thin_evidence: false,
    followers: 4200,
    completeness: 90,
    intent_score: 0,
    intent_stance: null,
    intent_evidence: null,
    intent_evidence_url: null,
    intent_topics: null,
    intent_summary: null,
    last_post_at: null,
    match_score: 90 - i,
    query_relevance: 0.7,
    s_semantic: 0.6, s_lexical: 0.4, s_constraint: 0.5,
    s_relationship: 0.8, s_actionability: 0.7, venture_multiplier: 1,
    ...over,
  }
}

async function mockNetworkApis(page: Page, onSearch?: (body: any) => void, results?: any[]) {
  await page.route('**/api/network/search', r => {
    onSearch?.(r.request().postDataJSON())
    return r.fulfill({
      json: {
        ok: true,
        restated: 'Marketing leaders at banks who care about AI governance.',
        weak: false,
        degraded: [],
        geo: { countries: [], hard: false },
        results: results ?? [person(1), person(2), person(3)],
      },
    })
  })
  await page.route('**/api/network/geo', r =>
    r.fulfill({
      json: {
        ok: true,
        countries: [
          { code: 'GB', name: 'United Kingdom', featured: true, n: 382 },
          { code: 'AU', name: 'Australia', featured: true, n: 1741 },
          { code: 'US', name: 'United States', featured: true, n: 1150 },
          { code: 'SG', name: 'Singapore', featured: false, n: 24 },
          { code: 'IN', name: 'India', featured: false, n: 62 },
        ],
        unknown: 6392,
        known: 3359,
        total: 9751,
      },
    }))
  await page.route('**/api/network/recommend', r =>
    r.fulfill({
      json: {
        ok: true,
        restated: 'People to sell Mindmake to.',
        weak: false,
        degraded: [],
        geo: { countries: [], hard: false },
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
// recommender render a chip reading "Mindmake", and "Clear search" contains
// "Search", so accessible-name matching is ambiguous on this surface by
// construction, not by accident.
const input = (page: Page) => page.getByTestId('network-search-input')
const clearButton = (page: Page) => page.getByTestId('network-search-clear')

async function openNetwork(page: Page) {
  await page.goto('/#/relationships')
  await expect(input(page)).toBeVisible()
}

async function runSearch(page: Page, q = 'CMOs at banks who care about AI governance', settles = 'Person 1') {
  await input(page).fill(q)
  await page.getByTestId('network-search-submit').click()
  // Wait on a name from the result set this test actually mocked, not on the
  // default fixture's.
  await expect(page.getByText(settles)).toBeVisible()
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
  expect(sent[1].countries).toBeNull()
})

test('a country chip narrows the search and says what it did', async ({ page }) => {
  const sent: any[] = []
  await mockNetworkApis(page, b => sent.push(b))
  await openNetwork(page)
  await runSearch(page)

  await page.getByTestId('network-geo-chip-GB').click()
  await expect.poll(() => sent.length).toBe(2)
  expect(sent[1].countries).toEqual(['GB'])
  // Soft by default. The chip ranks Britons up; it does not delete everyone
  // else, which is the promise the mode label makes.
  expect(sent[1].filter_mode).toBe('soft')
})

test('a hard country filter states how many people it cannot place', async ({ page }) => {
  await page.route('**/api/network/search', r =>
    r.fulfill({
      json: {
        ok: true,
        restated: 'Marketing leaders at banks who care about AI governance.',
        weak: false,
        degraded: [],
        geo: { countries: ['GB'], hard: true },
        results: [person(1, { geo_code: 'GB', country: 'United Kingdom' })],
      },
    }))
  await page.route('**/api/network/geo', r =>
    r.fulfill({ json: { ok: true, countries: [{ code: 'GB', name: 'United Kingdom', featured: true, n: 382 }], unknown: 6392, known: 3359, total: 9751 } }))
  await page.route('**/api/network/explain', r => r.fulfill({ json: { ok: true, explanations: [] } }))
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', r => r.abort())

  await openNetwork(page)
  await runSearch(page)

  // The count is the whole point. Without it "United Kingdom only" reads as a
  // fact about the network rather than about how much of it has a location.
  await expect(page.getByText(/6,392 people have no location on file/)).toBeVisible()
})

test('countries beyond the three markets are reachable through the overflow', async ({ page }) => {
  const sent: any[] = []
  await mockNetworkApis(page, b => sent.push(b))
  await openNetwork(page)
  await runSearch(page)

  // Five countries, three of them featured, so exactly two sit behind the +2.
  await page.getByTestId('network-geo-more').click()
  await page.getByTestId('network-geo-row-SG').click()
  await expect.poll(() => sent.length).toBe(2)
  expect(sent[1].countries).toEqual(['SG'])
})

test('on a phone the filters open over the results instead of replacing them', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockNetworkApis(page)
  await openNetwork(page)
  await runSearch(page)

  // Level 1: the three markets are one tap away without opening anything, and
  // the results are on screen at the same time.
  await expect(page.getByTestId('network-geo-chip-GB')).toBeVisible()
  await expect(page.getByText('Person 1')).toBeVisible()

  // Level 2: the sheet is content-height, so the list behind it survives. This
  // is the assertion the old inline-expansion layout could not have passed.
  await page.getByTestId('network-filters-open').click()
  await expect(page.getByTestId('network-role-chip-buyer')).toBeVisible()
  await expect(page.getByText('Person 1')).toBeVisible()

  await page.getByTestId('network-filters-close').click()
  await expect(page.getByTestId('network-role-chip-buyer')).toHaveCount(0)
})

test('an active filter can be removed on a phone without reopening the sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const sent: any[] = []
  await mockNetworkApis(page, b => sent.push(b))
  await openNetwork(page)
  await runSearch(page)

  await page.getByTestId('network-filters-open').click()
  await page.getByTestId('network-role-chip-buyer').click()
  await page.getByTestId('network-filters-close').click()

  // The pill is the removal affordance. Reaching it must not cost a sheet.
  const pill = page.getByRole('button', { name: 'Remove Buyer filter' })
  await expect(pill).toBeVisible()
  await pill.click()
  await expect(pill).toHaveCount(0)
  expect(sent[sent.length - 1].roles).toBeNull()
})

test('a recommendation can be cleared back to the venture picker', async ({ page }) => {
  await mockNetworkApis(page)
  await openNetwork(page)

  // One venture control now: the filter chip IS the recommender's venture.
  // There used to be a second identical row here, from the same VENTURES
  // array, and with nothing typed the filter copy did nothing at all.
  await page.getByTestId('network-venture-chip-mindmake').click()
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

test('tapping a person opens their detail with the best channel one tap away', async ({ page }) => {
  await mockNetworkApis(page)
  await page.route('**/api/network/person/**', r => r.fulfill({ json: { ok: true, contact: {}, intelligence: {} } }))
  await openNetwork(page)
  await runSearch(page)

  await page.getByText('Person 1').click()

  const email = page.getByTestId('network-reach-email')
  await expect(email).toBeVisible()
  await expect(email).toHaveAttribute('href', 'mailto:p1@example.com')
  // The address is printed, not hidden behind the button: half of what this
  // sheet is used for is pasting it somewhere else.
  await expect(email).toContainText('p1@example.com')
  await expect(email).toContainText('best channel')
})

test('a recorded best channel with no address on file says so instead of offering a dead button', async ({ page }) => {
  await page.route('**/api/network/search', r =>
    r.fulfill({
      json: {
        ok: true, restated: 'x', weak: false, degraded: [], geo: { countries: [], hard: false },
        results: [person(1, {
          // 368 real people look exactly like this: phone is the recommended way
          // in and there is no phone column anywhere in the database.
          best_channel: 'phone',
          reachable_via: ['phone', 'email'],
        })],
      },
    }))
  await page.route('**/api/network/geo', r => r.fulfill({ json: { ok: true, countries: [], unknown: 0, known: 0, total: 0 } }))
  await page.route('**/api/network/person/**', r => r.fulfill({ json: { ok: true, contact: {}, intelligence: {} } }))
  await page.route('**/api/network/explain', r => r.fulfill({ json: { ok: true, explanations: [] } }))
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', r => r.abort())

  await openNetwork(page)
  await runSearch(page)
  await page.getByText('Person 1').click()

  // Email is offered because email is what we hold, and the mismatch is named.
  await expect(page.getByTestId('network-reach-email')).toHaveAttribute('href', 'mailto:p1@example.com')
  await expect(page.getByTestId('network-reach-phone')).toHaveCount(0)
  await expect(page.getByText(/Best channel on file is Phone, but no number is recorded/)).toBeVisible()
})

test('a person with no contact details at all is not offered a button that does nothing', async ({ page }) => {
  await page.route('**/api/network/search', r =>
    r.fulfill({
      json: {
        ok: true, restated: 'x', weak: false, degraded: [], geo: { countries: [], hard: false },
        results: [person(1, { email: null, linkedin_url: null, best_channel: 'instagram_dm', reachable_via: ['instagram_dm'] })],
      },
    }))
  await page.route('**/api/network/geo', r => r.fulfill({ json: { ok: true, countries: [], unknown: 0, known: 0, total: 0 } }))
  await page.route('**/api/network/person/**', r => r.fulfill({ json: { ok: true, contact: {}, intelligence: {} } }))
  await page.route('**/api/network/explain', r => r.fulfill({ json: { ok: true, explanations: [] } }))
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', r => r.abort())

  await openNetwork(page)
  await runSearch(page)

  // No ADDRESS shortcut on the row, because there is nothing to shortcut to.
  await expect(page.getByTestId('network-row-reach-email')).toHaveCount(0)
  await expect(page.getByTestId('network-row-reach-twitter')).toHaveCount(0)
  // But the LinkedIn route is still there, as a search rather than a profile.
  // "One click to their LinkedIn" is unconditional; what it is honest about is
  // WHICH kind of click it is.
  const fallback = page.getByTestId('network-row-reach-linkedin_search').first()
  await expect(fallback).toHaveAttribute('href', /linkedin\.com\/search\/results\/people/)
  await page.getByText('Person 1').click()
  await expect(page.getByText(/no address for it is recorded/)).toBeVisible()
  await expect(page.getByText('no profile on file')).toBeVisible()
})

test('every row says where he knows the person from', async ({ page }) => {
  await mockNetworkApis(page)
  await openNetwork(page)
  await runSearch(page)

  // The campaign, not the pipeline that loaded it, and without opening the
  // sheet — which is the entire point.
  await expect(page.getByText('AI Circle').first()).toBeVisible()
})

test('a contact with no recorded source says so rather than implying one', async ({ page }) => {
  await page.route('**/api/network/search', r =>
    r.fulfill({
      json: {
        ok: true, restated: 'x', weak: false, degraded: [], geo: { countries: [], hard: false },
        results: [person(1, { origin_channel: null, origin_campaign: null, first_met_context: null })],
      },
    }))
  await page.route('**/api/network/geo', r => r.fulfill({ json: { ok: true, countries: [], unknown: 0, known: 0, total: 0 } }))
  await page.route('**/api/network/person/**', r => r.fulfill({ json: { ok: true, contact: {}, intelligence: {} } }))
  await page.route('**/api/network/explain', r => r.fulfill({ json: { ok: true, explanations: [] } }))
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', r => r.abort())

  await openNetwork(page)
  await runSearch(page)
  await expect(page.getByText('Unknown source').first()).toBeVisible()
})

test('the row itself reaches someone without opening the sheet', async ({ page }) => {
  await mockNetworkApis(page)
  await openNetwork(page)
  await runSearch(page)

  const shortcut = page.getByTestId('network-row-reach-email').first()
  await expect(shortcut).toHaveAttribute('href', 'mailto:p1@example.com')
  // It must not also open the sheet: the whole point is skipping it.
  await shortcut.click()
  await expect(page.getByTestId('network-reach-email')).toHaveCount(0)
})

test('the person sheet can change venture and status, and says what do-not-contact costs', async ({ page }) => {
  const patches: any[] = []
  await mockNetworkApis(page)
  await page.route('**/api/network/person/**', r =>
    r.fulfill({ json: { ok: true, contact: { primary_venture: 'mindmake', status: 'active' }, intelligence: {} } }))
  await page.route('**/api/contacts/**', r => {
    patches.push({ method: r.request().method(), body: r.request().postDataJSON() })
    return r.fulfill({ json: { ok: true, contact: {} } })
  })

  await openNetwork(page)
  await runSearch(page)
  await page.getByText('Person 1').click()

  // Venture is a chip row, not a native select: the value on file reads at a
  // glance and changing it is one tap rather than an OS picker.
  await expect(page.getByTestId('contact-venture-chip-mindmake')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('contact-venture-chip-mm_ctrl').click()
  await expect.poll(() => patches.length).toBe(1)
  expect(patches[0]).toEqual({ method: 'PATCH', body: { primary_venture: 'mm_ctrl' } })

  // do_not_contact is the edit with teeth, so the consequence is stated rather
  // than left to be discovered when someone stops appearing in searches.
  await page.getByTestId('contact-status-do_not_contact').click()
  await expect.poll(() => patches.length).toBe(2)
  expect(patches[1]).toEqual({ method: 'PATCH', body: { status: 'do_not_contact' } })
  await expect(page.getByText('Excluded from network search and from every outreach surface.')).toBeVisible()
})

test('a failed edit reverts the chip rather than leaving it lit', async ({ page }) => {
  await mockNetworkApis(page)
  await page.route('**/api/network/person/**', r =>
    r.fulfill({ json: { ok: true, contact: { primary_venture: 'mindmake', status: 'active' }, intelligence: {} } }))
  await page.route('**/api/contacts/**', r =>
    r.fulfill({ status: 500, json: { ok: false, error: 'nope' } }))

  await openNetwork(page)
  await runSearch(page)
  await page.getByText('Person 1').click()

  await page.getByTestId('contact-status-closed').click()
  // The database never took it, so the UI must not keep claiming it did.
  await expect(page.getByTestId('contact-status-active')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('contact-status-closed')).toHaveAttribute('aria-pressed', 'false')
})

test('missing surnames can be previewed and applied without leaving the tab', async ({ page }) => {
  // The whole point of this panel: the repair used to need a cloned repo, a
  // node install and two env vars copied out of Vercel before a single name
  // could be seen. Krish is already authenticated here.
  const calls: any[] = []
  await mockNetworkApis(page)
  await page.route('**/api/network/repair-names', async r => {
    const body = r.request().postDataJSON()
    calls.push(body)
    await r.fulfill({
      json: body.dry
        ? { ok: true, dry: true, examined: 200, repaired: 2, skipped: { no_messages: 190, no_display_name: 8 },
            sample: [{ id: 'a', from: 'Bill', to: 'Bill Simmons' }, { id: 'b', from: 'James', to: 'James Harrabin' }] }
        : { ok: true, dry: false, examined: 200, repaired: 2, skipped: {}, sample: [] },
    })
  })

  await openNetwork(page)
  await page.getByTestId('network-repair-names').click()

  // Apply must not exist before a preview: a button that writes an unknown
  // number of changes to real people's names is not one anyone should trust.
  await expect(page.getByTestId('network-repair-apply')).toHaveCount(0)

  await page.getByTestId('network-repair-preview').click()
  await expect(page.getByText('Bill Simmons')).toBeVisible()
  await expect(page.getByText('James Harrabin')).toBeVisible()
  expect(calls[0].dry).toBe(true)

  // Only now, and it says how many.
  const apply = page.getByTestId('network-repair-apply')
  await expect(apply).toHaveText(/Apply these 2/)
  await apply.click()
  await expect(page.getByText(/2 names written/)).toBeVisible()
  expect(calls[1].dry).toBe(false)
})

test('network health reads per tier, and names what is invisible', async ({ page }) => {
  await mockNetworkApis(page)
  await page.route('**/api/network/health', r =>
    r.fulfill({
      json: {
        ok: true,
        total: 11755,
        invisible: 119,
        stale_embedding: 0,
        posts_read: 849,
        signalling: 36,
        generated_at: '2026-09-15T20:00:00.000Z',
        tiers: [
          { tier: 'warm', people: 366, linkedin: 207, email: 285, invisible: 7,
            avg_completeness: 55, weak: 160, strong: 74,
            posts_read: 340, signalling: 21, hot_intent: 9,
            apify_due: 132, coresignal_due: 152, posts_due: 26,
            apify_usd: 1.2, posts_usd: 0.41, coresignal_credits: 1520 },
          { tier: 'permissioned', people: 1046, linkedin: 682, email: 144, invisible: 1,
            avg_completeness: 38, weak: 902, strong: 0,
            posts_read: 509, signalling: 15, hot_intent: 4,
            apify_due: 680, coresignal_due: 364, posts_due: 173,
            apify_usd: 6.19, posts_usd: 2.73, coresignal_credits: 3640 },
        ],
        rates: {
          apify_usd_per_profile: 0.0091,
          apify_usd_per_posts_read: 0.0158,
          priced_from_runs: 5195,
          priced_to: '2026-09-15',
          coresignal_credits_per_profile: 10,
        },
      },
    }))

  await openNetwork(page)
  await page.getByTestId('network-health').click()

  // Invisibility is the one total failure on this panel: a contact with no
  // intelligence row cannot be reached by any query. It must be stated, not
  // left to be inferred from a coverage bar.
  await expect(page.getByTestId('network-health-panel')).toContainText('119')
  await expect(page.getByTestId('network-health-panel')).toContainText('invisible to search')

  // Per tier, with the cost of the outstanding work attached to the tier rather
  // than to the network: the decision is always "is THIS tier worth it".
  // Intent coverage is on the panel, because "nobody is signalling" and
  // "nobody has been read" look identical on one number and mean the opposite.
  await expect(page.getByTestId('network-health-panel')).toContainText('849')
  await expect(page.getByTestId('network-health-panel')).toContainText('36')

  // The prices are stated as measured, with the run count they came from. The
  // panel hardcoded $0.003 when the meter said $0.0090 and called it measured.
  await expect(page.getByTestId('network-health-panel')).toContainText('0.0091')
  await expect(page.getByTestId('network-health-panel')).toContainText('5,195 runs')

  // Per tier, and asserted AGAINST THE TIER rather than against the whole list,
  // so cost-to-tier attribution is actually covered.
  const tiers = page.getByTestId('network-health-tiers')
  const warm = tiers.getByRole('listitem').filter({ hasText: 'Warm' }).first()
  const communities = tiers.getByRole('listitem').filter({ hasText: 'Communities' }).first()

  await expect(warm).toContainText('366')
  await expect(warm).toContainText('Complete 55/100')
  await expect(warm).toContainText('160 thin, 74 strong')
  await expect(warm).toContainText('21 signalling')
  await expect(warm).toContainText('$1.20')

  await expect(communities).toContainText('$6.19')
  await expect(communities).toContainText('3,640 Coresignal credits')
  // The warm tier's figures must not leak into the communities row.
  await expect(communities).not.toContainText('$1.20')
})

// ── Intent ─────────────────────────────────────────────────────────────────
// The chip and the evidence quote were both invisible to this suite: deleting
// either block entirely left every test green. They are the newest and least
// obvious surface in the tab, which is exactly the kind that rots unwatched.

const POSTING = {
  intent_score: 72,
  intent_stance: 'struggling',
  intent_summary: 'hitting problems, rollout stalled on evals',
  intent_evidence: "We're three months in and our agents still can't handle tier-1 tickets.",
  intent_evidence_url: 'https://www.linkedin.com/posts/ada-lovelace_activity-123',
  intent_topics: ['AI agents', 'LLMs'],
  last_post_at: '2026-09-05T00:00:00.000Z',
}

test('a row says what someone is DOING about AI, not just that they mention it', async ({ page }) => {
  await mockNetworkApis(page, undefined, [
    person(1, { full_name: 'Stuck Person', ...POSTING }),
    person(2, { full_name: 'Quiet Person' }),
  ])
  await openNetwork(page)
  await runSearch(page, 'who is stuck on AI', 'Stuck Person')

  // The stance, not the subject. "Posting about AI" flagged 45% of the warm
  // network, which is the true answer to a useless question.
  await expect(page.getByText('stuck on AI')).toBeVisible()
  await expect(page.getByText('posting about AI')).toHaveCount(0)
  // Someone with no live signal gets no chip at all.
  await expect(page.getByText('Quiet Person')).toBeVisible()
})

// A vendor is never a buyer, and a green chip on one is a lie about what the
// row is for.
test('a row does not badge someone who is selling AI', async ({ page }) => {
  await mockNetworkApis(page, undefined, [
    person(1, { full_name: 'Vendor Person', ...POSTING, intent_stance: 'selling' }),
  ])
  await openNetwork(page)
  await runSearch(page, 'anything', 'Vendor Person')
  await expect(page.getByText(/selling AI/i)).toHaveCount(0)
})

test('the sheet shows the sentence the intent score was read from', async ({ page }) => {
  await mockNetworkApis(page, undefined, [person(1, { full_name: 'Stuck Person', ...POSTING })])
  await page.route('**/api/network/person/**', r =>
    r.fulfill({ json: { ok: true, contact: {}, intelligence: {} } }))
  await openNetwork(page)
  await runSearch(page, 'who is stuck on AI', 'Stuck Person')
  await page.getByText('Stuck Person').click()

  // A score is arguable; a quote can be overruled at a glance. That is the
  // whole reason the evidence is stored and shown.
  await expect(page.getByText(/tier-1 tickets/)).toBeVisible()
  await expect(page.getByRole('link', { name: /read the post/i }))
    .toHaveAttribute('href', POSTING.intent_evidence_url)
})

// A row whose best channel is LinkedIn used to drop the email button entirely:
// the code tested only the best option and nulled it instead of looking past
// it, which silently broke the one promise the row makes.
test('a real email stays one click away even when LinkedIn is the recommended channel', async ({ page }) => {
  await mockNetworkApis(page, undefined, [
    person(1, {
      full_name: 'Both Ways',
      email: 'ada@example.com',
      linkedin_url: 'https://www.linkedin.com/in/ada-lovelace',
      best_channel: 'linkedin_dm',
      reachable_via: ['linkedin_dm', 'email'],
    }),
  ])
  await openNetwork(page)
  await runSearch(page, 'anything', 'Both Ways')

  await expect(page.getByTestId('network-row-reach-linkedin_dm').first()).toBeVisible()
  await expect(page.getByTestId('network-row-reach-email').first()).toBeVisible()
})
