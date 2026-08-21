import { test, expect, type Page } from '@playwright/test'

/**
 * Adding a person to the network from a screenshot.
 *
 * The subject is not the happy path — it is the three ways this flow is allowed
 * to be honest and must not quietly succeed:
 *
 *   1. a low-confidence read is flagged BEFORE anything is written
 *   2. a person who is already in the network is offered as a merge, and a
 *      NAME-only match is not preselected
 *   3. an API that is out of credits stops the run and says so, rather than
 *      writing a half-enriched record and marking it enriched
 *
 * Every /api/* call is mocked, so no model call, no scrape and no embedding is
 * ever spent by this spec.
 *
 * Requires the preview build to carry VITE_UI_V2_ENABLED=true; without it the
 * network lane renders the pre-v2 list and none of this surface exists.
 */

const SCREENSHOT = {
  name: 'linkedin.png',
  mimeType: 'image/png',
  // A 1×1 PNG. The scan route is mocked, so the bytes only have to be a valid
  // image for the file input to accept them.
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
}

function scanned(over: Record<string, unknown> = {}) {
  return {
    full_name: 'Ryan Slipakoff',
    headline: 'Co-Founder, President & Commercial Lead',
    title: 'Co-Founder, President & Commercial Lead',
    company: 'United Logic',
    location: 'Greater Philadelphia',
    linkedin_url: null,
    linkedin_handle: null,
    email: null,
    followers: 20882,
    mutuals: 48,
    source_kind: 'linkedin_profile',
    confidence: 'high',
    other_people: [],
    notes: null,
    ...over,
  }
}

interface MockOpts {
  scan?: { status?: number; json: Record<string, unknown> }
  add?: { status?: number; json: Record<string, unknown> }
  enrich?: { status?: number; json: Record<string, unknown> }
  onAdd?: (body: Record<string, unknown>) => void
}

async function mockApis(page: Page, o: MockOpts = {}) {
  // Catch-alls FIRST: Playwright matches route handlers in REVERSE
  // registration order, so anything registered after this shadows it. Getting
  // this backwards makes the component render against a null row forever and
  // reads as a broken component rather than a missing fixture.
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', r => r.abort())
  await page.route('**/api/network/geo', r =>
    r.fulfill({ json: { ok: true, countries: [], unknown: 0, known: 0, total: 0 } }))

  await page.route('**/api/network/scan-card', r => r.fulfill({
    status: o.scan?.status ?? 200,
    json: o.scan?.json ?? { ok: true, usable: true, person: scanned(), existing: null },
  }))
  await page.route('**/api/network/add-person', r => {
    o.onAdd?.(r.request().postDataJSON())
    return r.fulfill({
      status: o.add?.status ?? 201,
      json: o.add?.json ?? { ok: true, contact_id: 'c-new', created: true, merged: false, searchable: true, warning: null, blocked: [] },
    })
  })
  await page.route('**/api/network/enrich-person', r => r.fulfill({
    status: o.enrich?.status ?? 200,
    json: o.enrich?.json ?? {
      ok: true, contact_id: 'c-new', status: 'enriched', searchable: true,
      who: 'Runs commercial for an agentic web delivery platform.',
      why_them: 'Buys and sells the exact category Mindmaker teaches.',
      hook: 'His platform pitches 10x speed on cross-CMS delivery.',
      confidence: 'high', used: ['peopledatalabs', 'apify', 'perplexity'],
      skipped: [], degraded: [],
    },
  }))
}

async function openFlow(page: Page) {
  await page.goto('/#/relationships')
  await page.getByTestId('network-add-person-open').click()
  await expect(page.getByTestId('network-add-person-capture')).toBeVisible()
}

async function dropScreenshot(page: Page) {
  await page.locator('input[type=file]').setInputFiles(SCREENSHOT)
  await expect(page.getByTestId('network-add-person-review')).toBeVisible()
}

test('a screenshot becomes an editable person that is not saved until confirmed', async ({ page }) => {
  let addCalled = false
  await mockApis(page, { onAdd: () => { addCalled = true } })
  await openFlow(page)
  await dropScreenshot(page)

  await expect(page.getByTestId('field-full-name')).toHaveValue('Ryan Slipakoff')
  await expect(page.getByTestId('field-company')).toHaveValue('United Logic')
  await expect(page.getByTestId('field-location')).toHaveValue('Greater Philadelphia')
  // The review step is a review: nothing has been written yet.
  expect(addCalled).toBe(false)

  await page.getByTestId('network-add-person-save').click()
  await expect(page.getByTestId('network-add-person-result')).toBeVisible()
  expect(addCalled).toBe(true)
})

test('an edit in the review card is what gets saved, not what was read', async ({ page }) => {
  let sent: Record<string, unknown> = {}
  await mockApis(page, { onAdd: b => { sent = b } })
  await openFlow(page)
  await dropScreenshot(page)

  await page.getByTestId('field-company').fill('United Logic Group')
  await page.getByTestId('field-note').fill('Met at the Philadelphia CDP dinner')
  await page.getByTestId('network-add-person-save').click()
  await expect(page.getByTestId('network-add-person-result')).toBeVisible()

  expect(sent.company).toBe('United Logic Group')
  expect(sent.note).toBe('Met at the Philadelphia CDP dinner')
})

test('a low-confidence read is flagged before the save button', async ({ page }) => {
  await mockApis(page, {
    scan: { json: { ok: true, usable: true, existing: null, person: scanned({ confidence: 'low', notes: 'Header is cropped.' }) } },
  })
  await openFlow(page)
  await dropScreenshot(page)

  await expect(page.getByText(/read with/i)).toBeVisible()
  await expect(page.getByText(/Header is cropped/)).toBeVisible()
})

test('other people seen in the image are named rather than silently discarded', async ({ page }) => {
  await mockApis(page, {
    scan: { json: { ok: true, usable: true, existing: null, person: scanned({ other_people: ['Scott Saccal'] }) } },
  })
  await openFlow(page)
  await dropScreenshot(page)
  await expect(page.getByText(/Scott Saccal/)).toBeVisible()
})

test('a missing LinkedIn URL is stated, because enrichment is weaker without it', async ({ page }) => {
  await mockApis(page)
  await openFlow(page)
  await dropScreenshot(page)
  await expect(page.getByText(/never guessed/i)).toBeVisible()
})

test('a hard identifier match preselects the merge; a name-only match does not', async ({ page }) => {
  await mockApis(page, {
    scan: {
      json: {
        ok: true, usable: true, person: scanned(),
        existing: { id: 'c-existing', full_name: 'Ryan Slipakoff', company: 'United Logic', title: 'Co-Founder', consent_tier: 'warm', enrichment_status: 'none', matched_on: 'name_only' },
      },
    },
  })
  await openFlow(page)
  await dropScreenshot(page)

  await expect(page.getByTestId('network-add-person-existing')).toBeVisible()
  // A name is not an identity, so the merge is offered and NOT preselected.
  await expect(page.getByText(/name match, not a hard identifier/i)).toBeVisible()
  await expect(page.getByTestId('network-add-person-save')).toContainText('Add + enrich')

  await page.getByTestId('network-add-person-merge').click()
  await expect(page.getByTestId('network-add-person-save')).toContainText('Update + enrich')
})

test('an API out of credits stops the run and says which one, instead of half enriching', async ({ page }) => {
  await mockApis(page, {
    enrich: {
      status: 402,
      json: {
        ok: false, error: 'api_credits', contact_id: 'c-new', status: 'blocked_quota',
        blocked: [{ api: 'peopledatalabs', status: 'exhausted', httpStatus: 402 }],
        used: ['apollo'], skipped: [],
        alert: 'peopledatalabs: out of credits/quota [HTTP 402]',
        alert_sent: true,
        detail: 'Nothing was written. The contact is unchanged and still marked un-enriched.',
      },
    },
  })
  await openFlow(page)
  await dropScreenshot(page)
  await page.getByTestId('network-add-person-save').click()

  const problem = page.getByTestId('network-add-person-problem')
  await expect(problem).toBeVisible()
  await expect(problem).toContainText('not enough API credits')
  // The specific provider and reason, not a generic failure.
  await expect(problem).toContainText('peopledatalabs')
  await expect(problem).toContainText('out of credits/quota')
  await expect(problem).toContainText('Alert sent to your Telegram')
  // And the record is explicitly NOT presented as finished.
  await expect(problem).toContainText('blocked_quota')
  // No enrichment brief is rendered on this path.
  await expect(page.getByTestId('network-add-person-brief')).toHaveCount(0)
})

test('a failed Telegram alert says the panel is the only notice', async ({ page }) => {
  await mockApis(page, {
    enrich: {
      status: 402,
      json: {
        ok: false, error: 'api_credits', status: 'blocked_quota',
        blocked: [{ api: 'openai', status: 'exhausted' }],
        alert: 'openai: out of credits/quota', alert_sent: false,
        detail: 'Nothing was written.',
      },
    },
  })
  await openFlow(page)
  await dropScreenshot(page)
  await page.getByTestId('network-add-person-save').click()
  await expect(page.getByTestId('network-add-person-problem')).toContainText('only notice')
})

test('a person saved but not indexable is not reported as searchable', async ({ page }) => {
  await mockApis(page, {
    add: {
      status: 201,
      json: {
        ok: true, contact_id: 'c-new', created: true, merged: false, searchable: false,
        warning: 'Saved, but NOT yet searchable: openai: out of credits/quota [HTTP 429].',
        blocked: [{ api: 'openai', status: 'exhausted' }], alert_sent: true,
      },
    },
    enrich: { json: { ok: true, contact_id: 'c-new', status: 'enriched', searchable: false, used: [], skipped: [], degraded: [] } },
  })
  await openFlow(page)
  await dropScreenshot(page)
  await page.getByTestId('network-add-person-save').click()

  const result = page.getByTestId('network-add-person-result')
  await expect(result).toContainText('NOT searchable yet')
  await expect(result).toContainText('out of credits')
})

test('an enrichment that found nothing says so rather than showing an empty brief', async ({ page }) => {
  await mockApis(page, {
    enrich: {
      json: {
        ok: true, contact_id: 'c-new', status: 'no_evidence',
        used: [], skipped: ['peopledatalabs', 'apollo'], degraded: [],
        detail: 'No provider returned anything. Not configured: peopledatalabs, apollo.',
      },
    },
  })
  await openFlow(page)
  await dropScreenshot(page)
  await page.getByTestId('network-add-person-save').click()

  const brief = page.getByTestId('network-add-person-brief')
  await expect(brief).toContainText('No evidence found')
  await expect(brief).toContainText('Not configured: peopledatalabs, apollo')
})

test('an unreadable image keeps the operator on the capture step with a reason', async ({ page }) => {
  await mockApis(page, {
    scan: { json: { ok: true, usable: false, person: scanned({ full_name: null }), reason: 'No identifiable person in the image.' } },
  })
  await openFlow(page)
  await page.locator('input[type=file]').setInputFiles(SCREENSHOT)

  await expect(page.getByTestId('network-add-person-capture')).toBeVisible()
  await expect(page.getByTestId('network-add-person-problem')).toContainText('No identifiable person')
})
