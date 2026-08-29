import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * Built vs Paid must actually differ. Twenty of the register's shifts carry no
 * lane on purpose (governance, security and org cut across both formats), and
 * they used to render in BOTH rooms unlabelled — which read as one duplicated
 * room. The contract now: a room leads with its own shifts, and cross-cutting
 * shifts follow under a header that says why they repeat.
 */

const SHIFTS = [
  {
    id: 's-built', slug: 'agents-in-ci', title: 'Agent teams are moving into CI pipelines',
    summary: 'x', implication: 'x', category: 'tools', status: 'active', lane: 'built',
    first_seen_on: '2026-07-01', last_evidence_on: '2026-08-20',
    momentum: 4, momentum_history: [{ week: '2026-W32', momentum: 3 }, { week: '2026-W33', momentum: 4 }],
    day_span_total: 9, source_count_total: 5, story_count: 12, provenance: 'lived', decision: null,
  },
  {
    id: 's-cross', slug: 'veto-power', title: 'Governments claim pre-release veto power over frontier AI',
    summary: 'x', implication: 'x', category: 'governance', status: 'proposed', lane: null,
    first_seen_on: '2026-07-10', last_evidence_on: '2026-08-21',
    momentum: 3, momentum_history: [{ week: '2026-W33', momentum: 3 }],
    day_span_total: 7, source_count_total: 4, story_count: 9, provenance: 'lived', decision: null,
  },
]

const calmMorning = {
  id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green',
  one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false,
}
const AFTERNOON = new Date('2026-08-20T18:30:00Z')

async function mock(page: Page) {
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/pilot/timezone', (r: Route) =>
    r.fulfill({ json: { ok: true, timezone: 'America/New_York' } }))
  await page.route('**/api/pilot/checkin*', (r: Route) => {
    const tz = new URL(r.request().url()).searchParams.get('tz') || 'America/New_York'
    return r.fulfill({
      json: {
        ok: true, morning: calmMorning, last_evening: null, evening_done_today: true,
        yesterday: null, timezone: 'America/New_York',
        today: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()),
      },
    })
  })
  await page.route('**/rest/v1/shifts*', (r: Route) => r.fulfill({ json: SHIFTS }))
}

test.describe('the content rooms', () => {
  test('Built leads with its own shift, then labels the cross-cutting one', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page)
    await page.goto('/#/content')

    await page.getByTestId('content-room-built').click()
    await expect(page.getByText('Agent teams are moving into CI pipelines')).toBeVisible()
    await expect(page.getByTestId('shifts-cross-cutting')).toBeVisible()
    await expect(page.getByText('Governments claim pre-release veto power over frontier AI')).toBeVisible()
    await ctx.close()
  })

  test('tapping a shift on a phone opens the dossier as a sheet', async ({ browser }) => {
    // The dossier used to expand in place BELOW the whole card grid, which on
    // a phone meant off-screen: a tap visibly did nothing. It must own the
    // screen as a bottom sheet, with the ruling actions reachable.
    const ctx = await browser.newContext({
      timezoneId: 'America/New_York',
      viewport: { width: 390, height: 844 },
    })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page)
    await page.goto('/#/content')

    await page.getByTestId('content-room-built').click()
    await page.getByText('Agent teams are moving into CI pipelines').click()
    await expect(page.getByTestId('shift-dossier')).toBeVisible()
    await expect(page.getByText(/For your org:/)).toBeVisible()
    await ctx.close()
  })

  test('on the desk the dossier still expands in place', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page)
    await page.goto('/#/content')

    await page.getByTestId('content-room-built').click()
    await page.getByText('Governments claim pre-release veto power over frontier AI').click()
    await expect(page.getByTestId('shift-dossier')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible()
    await ctx.close()
  })

  test('Paid does not silently repeat Built: no own shifts is said out loud', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page)
    await page.goto('/#/content')

    await page.getByTestId('content-room-paid').click()
    await expect(page.getByTestId('shifts-own-empty')).toBeVisible()
    await expect(page.getByText('Agent teams are moving into CI pipelines')).toHaveCount(0)
    await expect(page.getByTestId('shifts-cross-cutting')).toBeVisible()
    await expect(page.getByText('Governments claim pre-release veto power over frontier AI')).toBeVisible()
    await ctx.close()
  })
})
