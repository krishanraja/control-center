import { test, expect, type Page, type Route } from '@playwright/test'
import { growthTables, growthWebInsights, mockGrowthRoutes } from './fixtures/growth'

/**
 * Growth E2E, deterministic: every /api/* and Supabase call is mocked, against
 * populated fixtures shaped on the live numbers (e2e/fixtures/growth.ts).
 *
 * The tab is one move at a time (2026-10-04): the next move by default, then
 * the week, the numbers and the places. Selection goes through test ids
 * (growth-section-<id>, growth-panel-<id>, growth-move-*), never through a
 * visible word, so a copy change cannot take the suite out.
 */

type Kind = 'populated' | 'sparse'

async function mock(page: Page, opts: { kind?: Kind; tablesFail?: boolean; onSlot?: (b: any) => void; onCouncil?: (b: any) => void; onCreative?: (b: any) => void; onAnswer?: (b: any) => void } = {}) {
  const tables = growthTables(opts.kind ?? 'populated')
  // Catch-alls first: Playwright checks handlers in REVERSE registration order.
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/rest/v1/**', (r: Route) => {
    const table = (r.request().url().match(/\/rest\/v1\/([a-z_]+)/) || [])[1] || ''
    if (opts.tablesFail && table.startsWith('growth_')) return r.fulfill({ status: 500, json: { message: 'The growth tables did not answer.' } })
    return r.fulfill({ json: tables[table] ?? [] })
  })
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/api/pilot/timezone', (r: Route) => r.fulfill({ json: { ok: true, timezone: 'Europe/London' } }))
  await page.route('**/api/pilot/checkin*', (r: Route) => r.fulfill({ json: {
    ok: true, evening_done_today: true, last_evening: null, yesterday: null, timezone: 'Europe/London',
    today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()),
    morning: { id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green', one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false },
  } }))
  await mockGrowthRoutes(page)
  await page.route('**/api/growth/web-insights*', (r: Route) => {
    if (r.request().method() !== 'POST') return r.fulfill({ json: growthWebInsights(Date.now()) })
    const body = r.request().postDataJSON()
    if (body?.action !== 'answer') return r.fulfill({ status: 429, json: { ok: false, error: 'too_soon', retry_after_s: 420 } })
    opts.onAnswer?.(body)
    // The route answers with the fresh read, the answered site's action closed.
    const fresh = growthWebInsights(Date.now())
    fresh.properties = fresh.properties.map(p => (p.prefix === body.property ? { ...p, action: null, wait_line: null } : p))
    return r.fulfill({ json: fresh })
  })
  await page.route('**/api/daily-focus/slot*', (r: Route) => { opts.onSlot?.(r.request().postDataJSON()); return r.fulfill({ json: { ok: true, written: 1 } }) })
  await page.route('**/api/growth/council*', (r: Route) => { opts.onCouncil?.(r.request().postDataJSON()); return r.fulfill({ json: { ok: true, cleared: 40 } }) })
  await page.route('**/api/growth/creative*', (r: Route) => {
    const body = r.request().postDataJSON()
    opts.onCreative?.(body)
    const now = new Date().toISOString()
    return r.fulfill({ json: { ok: true, card: { id: 'card-new', stage: 'brief', script: null, shot_notes: null, magic_sentence: null, target_account: null, asset_url: null, posted_url: null, created_by: 'krish', created_at: now, updated_at: now, ...body } } })
  })
}

async function open(page: Page, hash = '/#/growth') {
  await page.goto(hash)
  await expect(page.getByRole('heading', { name: 'Growth' })).toBeVisible()
}

const VIEWS = [
  { id: 'next', label: 'Next move' },
  { id: 'week', label: 'This week' },
  { id: 'numbers', label: 'Numbers' },
  { id: 'places', label: 'Places' },
] as const

test('one Growth tab, four views, the next move first', async ({ page }) => {
  await mock(page)
  await open(page)
  // Exactly one sidebar entry reads "Growth".
  await expect(page.getByRole('navigation').getByText('Growth', { exact: true })).toHaveCount(1)
  for (const { id, label } of VIEWS) {
    await expect(page.getByTestId(`growth-section-${id}`)).toBeVisible()
    await expect(page.getByTestId(`growth-section-${id}`)).toContainText(label)
  }
  await expect(page.getByTestId('growth-panel-next')).toBeVisible()
  await expect(page.getByTestId('growth-section-next')).toHaveAttribute('aria-current', 'true')
  // The one plain sentence, from the real numbers: 8 of 620 answers, up a run.
  await expect(page.getByTestId('growth-summary')).toHaveText('Hardly anyone is finding you yet, but it ticked up this week.')
  // One card, and the quick choice is first.
  await expect(page.getByTestId('growth-move-card')).toHaveCount(1)
  await expect(page.getByTestId('growth-move-card')).toContainText('What is fulltime.fm for?')
  await expect(page.getByTestId('growth-move-position')).toHaveText(/^1 of \d+$/)
})

test('the old section ids land on the new views', async ({ page }) => {
  await mock(page)
  for (const [old, view] of [['council', 'week'], ['work', 'week'], ['signals', 'numbers'], ['governance', 'numbers'], ['map', 'places']] as const) {
    await page.goto(`/#/growth?section=${old}`)
    await expect(page.getByTestId(`growth-panel-${view}`)).toBeVisible()
  }
})

test('the #/acquisition bookmark lands on Numbers, with spend as one line', async ({ page }) => {
  await mock(page)
  await open(page, '/#/acquisition')
  await expect(page.getByTestId('growth-panel-numbers')).toBeVisible()
  const spend = page.getByTestId('growth-spend-line')
  await expect(spend).toContainText('Spend is $0 for every product this month, apart from Getwaitlist at $15 a month for Pulse, paid for and not connected. Keep or drop it in Intel.')
  await expect(spend.getByRole('link', { name: /Open Intel/ })).toHaveAttribute('href', '#/os?sub=intel')
  // The retired lane control plane is gone with the Spend limits section.
  for (const gone of ['Profit governor', 'Direction studio', 'Connected tools']) await expect(page.getByText(gone)).toHaveCount(0)
})

test('one tap answers the quick choice, and the verdict lands on the card', async ({ page }) => {
  let answer: any = null
  await mock(page, { onAnswer: b => { answer = b } })
  await open(page)
  const card = page.getByTestId('growth-move-card')
  await card.getByRole('button', { name: /Keep it as a proof piece/ }).click()
  await expect.poll(() => answer).not.toBeNull()
  expect(answer).toMatchObject({ action: 'answer', property: 'fulltime', choice: 'proof' })
  await expect(page.getByTestId('growth-move-verdict')).toContainText('Saved: Keep it as a proof piece.')
  // Nothing moves on its own: the card holds still until Next move is pressed.
  await expect(page.getByTestId('growth-move-position')).toHaveText(/^1 of /)
  await page.getByTestId('growth-move-next').click()
  await expect(page.getByTestId('growth-move-card')).toContainText('Is legibility.io live?')
  await expect(page.getByTestId('growth-move-position')).toHaveText(/^2 of /)
})

test('Put on today writes the move and its job, and Undo clears the slot', async ({ page }) => {
  const writes: any[] = []
  await mock(page, { onSlot: b => writes.push(b) })
  await open(page, '/#/growth?section=week')
  await page.getByTestId('growth-week-move').filter({ hasText: 'Move the one drafted approach' }).click()
  await expect(page.getByTestId('growth-panel-next')).toBeVisible()
  await page.getByTestId('growth-move-primary').click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toMatchObject({ slot: 1, text: 'Move the one drafted approach on the Advisory list to sent', job: 'fill_pilots' })
  await expect(page.getByTestId('growth-move-verdict')).toContainText('On today\'s list, slot 1.')
  await page.getByTestId('growth-move-undo').click()
  await expect.poll(() => writes.length).toBe(2)
  expect(writes[1]).toMatchObject({ slot: 1, text: '' })
  await expect(page.getByTestId('growth-move-primary')).toBeVisible()
})

test('why opens the evidence only when asked', async ({ page }) => {
  await mock(page)
  await open(page)
  await expect(page.getByTestId('growth-why')).toHaveCount(0)
  await page.getByTestId('growth-move-why').click()
  const why = page.getByTestId('growth-why')
  await expect(why).toBeVisible()
  await expect(why).toContainText('Why it is asking')
  await expect(why).toContainText('Three of your own notes give it three different jobs')
  await expect(why).toContainText('Visits to fulltime.fm')
})

test('a review move becomes a clip filed into this loop week', async ({ page }) => {
  let card: any = null
  await mock(page, { onCreative: b => { card = b } })
  await open(page, '/#/growth?section=week')
  await page.getByTestId('growth-week-move').filter({ hasText: 'Write a free AI use policy template page' }).click()
  await page.getByTestId('growth-move-secondary').click()
  await expect.poll(() => card).not.toBeNull()
  expect(card.product_slug).toBe('ctrl')
  expect(card.title).toBe('Write a free AI use policy template page with CTRL named in it')
  expect(card.brief).toMatch(/^From the weekly review, week of /)
  expect(card.batch_week).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  await expect(page.getByTestId('growth-move-verdict')).toContainText('Added to this week\'s clips, 1 of 3.')
})

test('this week clears the older weeks in one tap', async ({ page }) => {
  let body: any = null
  await mock(page, { onCouncil: b => { body = b } })
  await open(page, '/#/growth?section=week')
  await expect(page.getByTestId('growth-week-reviews').getByTestId('growth-week-review')).toHaveCount(5)
  await page.getByTestId('growth-clear-old').click()
  await expect.poll(() => body).toEqual({ action: 'clear_old' })
  await expect(page.getByTestId('growth-cleared')).toContainText('Cleared. 40 older reviews are history now')
})

test('a weekly review opens whole, with its evidence folded', async ({ page }) => {
  await mock(page)
  await open(page, '/#/growth?section=week')
  await page.getByTestId('growth-week-review').filter({ hasText: 'CTRL' }).click()
  const detail = page.getByTestId('growth-review-detail')
  await expect(detail).toContainText('No AI answer named CTRL in 124 tries.')
  await expect(detail.getByText('0 of 124 answers named CTRL.')).toHaveCount(0)
  await detail.getByTestId('growth-review-evidence').click()
  await expect(detail.getByText('0 of 124 answers named CTRL.', { exact: false })).toBeVisible()
})

test('numbers shows the questions a product was missed on, on demand', async ({ page }) => {
  await mock(page)
  await open(page, '/#/growth?section=numbers')
  await expect(page.getByTestId('growth-numbers-ai')).toContainText('8')
  await expect(page.getByTestId('growth-missed-questions')).toHaveCount(0)
  await page.getByTestId('growth-missed-ctrl').click()
  const missed = page.getByTestId('growth-missed-questions')
  await expect(missed).toBeVisible()
  await expect(missed).toContainText('AI use policy template for a small business')
})

test('a numbers-only week says why it is short', async ({ page }) => {
  await mock(page, { kind: 'sparse' })
  await open(page)
  await expect(page.getByTestId('growth-move-card')).toBeVisible()
  await expect(page.getByTestId('growth-short-week')).toContainText('Sunday\'s review had numbers only, so it added no moves.')
})

test('when the growth tables fail, the site moves stay and Try again is offered', async ({ page }) => {
  await mock(page, { tablesFail: true })
  await open(page)
  await expect(page.getByTestId('growth-read-error')).toBeVisible()
  await expect(page.getByTestId('growth-read-error').getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(page.getByTestId('growth-move-card')).toContainText('What is fulltime.fm for?')
})

test('the panel never carries an em dash', async ({ page }) => {
  await mock(page)
  for (const view of ['next', 'week', 'numbers', 'places']) {
    await page.goto(`/#/growth?section=${view}`)
    await expect(page.getByTestId(`growth-panel-${view}`)).toBeVisible()
    expect(await page.getByTestId('growth-tab').innerText()).not.toContain('—')
  }
})

/** On a phone a place is added through the one + button, in the house editor. */
test('on a phone, adding a place goes through the + sheet', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await mock(page)
  await page.goto('/#/growth')
  await expect(page.getByTestId('growth-panel-next')).toBeVisible()
  // No inline create button on a narrow viewport.
  await expect(page.getByTestId('growth-place-add')).toHaveCount(0)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: /Add a place/ }).click()
  await expect(page.getByTestId('growth-panel-places')).toBeVisible()
  const sheet = page.getByRole('dialog').filter({ hasText: 'Add a place' })
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('select')).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'Add the place' })).toBeInViewport({ ratio: 1 })
  await ctx.close()
})
