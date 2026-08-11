import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * The morning check-in gate.
 *
 * Two things make this testable at all, and both are why it is worth testing:
 * Playwright's `timezoneId` drives the real `Intl.DateTimeFormat().resolvedOptions()`
 * the app now reads, and `page.clock` fixes the wall clock. Every assertion below
 * is about which civil hour and which civil day the app believes it is in, and
 * those were exactly the two things nothing could previously pin down.
 *
 * The bug this suite exists to prevent: the gate used to be suppressed for 20
 * hours after the last check-in, measured from when it happened rather than from
 * the civil day. A check-in filed at 19:25 silently ate the next morning. Three
 * days went missing from a real ledger before anyone noticed, because a gate
 * that does not appear looks identical to a gate that was answered.
 */

const CHECKIN = '**/api/pilot/checkin*'

interface Options {
  /** Today's morning row, or null for a day not yet answered. */
  morning?: Record<string, unknown> | null
  onPost?: (body: any) => void
  onGet?: (url: URL) => void
}

async function mockPilot(page: Page, opts: Options = {}) {
  // Broadest first. Playwright matches handlers in REVERSE registration order,
  // so the catch-all has to be registered before the specific routes or it wins
  // and the specific ones never run.
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/pilot/timezone', (r: Route) =>
    r.fulfill({ json: { ok: true, timezone: 'America/New_York' } }))

  await page.route(CHECKIN, (r: Route) => {
    const url = new URL(r.request().url())
    if (r.request().method() === 'POST') {
      opts.onPost?.(r.request().postDataJSON())
      return r.fulfill({ json: { ok: true, checkin: {} } })
    }
    opts.onGet?.(url)
    // `today` is computed by the server from the tz the CLIENT sent, so the mock
    // echoes the client's zone back the same way the real route does.
    const tz = url.searchParams.get('tz') || 'America/New_York'
    return r.fulfill({
      json: {
        ok: true,
        morning: opts.morning ?? null,
        last_evening: null,
        evening_done_today: false,
        yesterday: null,
        timezone: 'America/New_York', // deliberately STALE, see the pin test
        today: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()),
      },
    })
  })
}

const GATE = 'How is it, honestly?'
const answeredMorning = { id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green', one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false }

/** A fixed instant, expressed as the wall clock in `zone`. */
function at(zone: string, isoLocal: string) {
  return { timezoneId: zone, time: new Date(`${isoLocal}Z`) }
}

test.describe('the morning window', () => {
  test('appears in the morning when today has no row', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(new Date('2026-08-12T11:00:00Z')) // 07:00 New York
    await mockPilot(page)
    await page.goto('/')
    await expect(page.getByText(GATE)).toBeVisible()
    await ctx.close()
  })

  test('goes straight to the dashboard after midday', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(new Date('2026-08-12T17:30:00Z')) // 13:30 New York
    await mockPilot(page)
    await page.goto('/')
    // Krish: "if I have not logged in by midday then it just goes straight to
    // the dash." No row exists, and the gate still must not appear.
    await expect(page.getByRole('navigation').first()).toBeVisible()
    await expect(page.getByText(GATE)).toHaveCount(0)
    await ctx.close()
  })

  test('does not re-gate at midnight on a session that rolled over', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(new Date('2026-08-12T04:30:00Z')) // 00:30 New York
    await mockPilot(page)
    await page.goto('/')
    // 00:30 is a new civil day with no row, which is what the old 20-hour
    // suppression was really guarding against. The window's 04:00 floor handles
    // it without swallowing the following morning.
    await expect(page.getByText(GATE)).toHaveCount(0)
    await ctx.close()
  })

  test('stays away once today has been answered', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(new Date('2026-08-12T11:00:00Z'))
    await mockPilot(page, { morning: answeredMorning })
    await page.goto('/')
    await expect(page.getByText(GATE)).toHaveCount(0)
    await ctx.close()
  })
})

test.describe('skipping', () => {
  test('writes a skipped row carrying no reading, and opens the dashboard', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(new Date('2026-08-12T11:00:00Z'))
    const posts: any[] = []
    await mockPilot(page, { onPost: b => posts.push(b) })
    await page.goto('/')

    await expect(page.getByText(GATE)).toBeVisible()
    await page.getByRole('button', { name: 'Skip' }).first().click()

    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0].kind).toBe('morning')
    expect(posts[0].skipped).toBe(true)
    // The first version wrote 3/3 here, which opened the gate and then told the
    // capacity layer and tomorrow's recap that he had felt fine on a morning he
    // never answered.
    expect(posts[0].energy).toBeNull()
    expect(posts[0].anxiety).toBeNull()
    await ctx.close()
  })
})

test.describe('the clock follows the device', () => {
  test('sends the device zone, and a stale stored one does not stick across loads', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'Australia/Sydney' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(new Date('2026-08-11T22:00:00Z')) // 08:00 Sydney
    const zones: string[] = []
    await mockPilot(page, { onGet: u => { const z = u.searchParams.get('tz'); if (z) zones.push(z) } })

    // TWO loads, deliberately. The mock answers `timezone: America/New_York` on
    // every GET, the way a stale system_config row would. The old code adopted
    // that value and WROTE IT TO LOCALSTORAGE, so the damage only showed on the
    // next load: this device would then announce itself as New York, and an
    // evening check-in in Sydney got filed under tomorrow's date. A single load
    // cannot see that, because the first request goes out before the response
    // that poisons it comes back.
    await page.goto('/')
    await expect(page.getByText(GATE)).toBeVisible()
    await page.reload()
    await expect(page.getByText(GATE)).toBeVisible()

    expect(zones.length).toBeGreaterThanOrEqual(2)
    expect(new Set(zones)).toEqual(new Set(['Australia/Sydney']))
    await ctx.close()
  })

  test('a device east of the stored zone still gets its own morning', async ({ browser }) => {
    // 22:00 UTC on the 11th is 08:00 Sydney on the 12th and 18:00 New York on
    // the 11th. Under the stored New York zone this is an evening and the gate
    // would never show; under the device zone it is a morning and it must.
    const ctx = await browser.newContext(at('Australia/Sydney', '2026-08-11T22:00:00'))
    const page = await ctx.newPage()
    await page.clock.setFixedTime(new Date('2026-08-11T22:00:00Z'))
    await mockPilot(page)
    await page.goto('/')
    await expect(page.getByText(GATE)).toBeVisible()
    await ctx.close()
  })
})
