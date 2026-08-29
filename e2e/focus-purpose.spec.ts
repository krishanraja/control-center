import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * The Focus & Purpose home (#/focus). Three things are worth pinning:
 *
 * 1. The tab renders its spine (the daily ask) and quiet sections without the
 *    dock that used to float over every tab: the removal is the feature, so a
 *    spec asserts the dock's labels appear nowhere on an ordinary tab.
 * 2. The anxious-day auto-route: an answered morning with anxiety >= 4 on a
 *    green day must land on #/focus with Steady unfolded, not on the intent
 *    tab. This is the pilot gate contract most likely to be "simplified" away.
 * 3. Committing an ask posts it, with the prediction on record.
 *
 * Same mocking pattern as pilot-gate.spec.ts: catch-alls first (Playwright
 * matches in reverse registration order), then the specific routes.
 */

const CHECKIN = '**/api/pilot/checkin*'
const ASKS = '**/api/pilot/asks*'

interface Options {
  morning?: Record<string, unknown> | null
  todayAsk?: Record<string, unknown> | null
  onAskPost?: (body: any) => void
}

async function mock(page: Page, opts: Options = {}) {
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/pilot/timezone', (r: Route) =>
    r.fulfill({ json: { ok: true, timezone: 'America/New_York' } }))

  await page.route(CHECKIN, (r: Route) => {
    if (r.request().method() !== 'GET') return r.fulfill({ json: { ok: true, checkin: {} } })
    const tz = new URL(r.request().url()).searchParams.get('tz') || 'America/New_York'
    return r.fulfill({
      json: {
        ok: true,
        morning: opts.morning ?? null,
        last_evening: null,
        evening_done_today: true,
        yesterday: null,
        timezone: 'America/New_York',
        today: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()),
      },
    })
  })

  await page.route(ASKS, (r: Route) => {
    if (r.request().method() === 'POST') {
      opts.onAskPost?.(r.request().postDataJSON())
      return r.fulfill({ json: { ok: true, ask: { id: 'a1' } } })
    }
    if (r.request().method() === 'PATCH') return r.fulfill({ json: { ok: true, ask: {} } })
    return r.fulfill({
      json: { ok: true, today_ask: opts.todayAsk ?? null, unresolved: null, today: '2026-08-20' },
    })
  })
}

const calmMorning = {
  id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green',
  one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false,
}
// Anxiety 5 computes red; mode 'green' records the operator's override, which
// is the one green path an anxious reading has.
const anxiousMorning = { ...calmMorning, id: 'm2', anxiety: 5, one_word: 'wired' }

// Afternoon, so the morning window is closed and the gate never renders.
const AFTERNOON = new Date('2026-08-20T18:30:00Z') // 14:30 New York

test.describe('the focus & purpose home', () => {
  test('renders the spine and the quiet sections at #/focus', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page, { morning: calmMorning })
    await page.goto('/#/focus')

    await expect(page.getByRole('heading', { name: 'Today’s ask' })).toBeVisible()
    await expect(page.getByText('Steady yourself')).toBeVisible()
    await expect(page.getByText('Before you speak')).toBeVisible()
    await expect(page.getByText('Test an idea')).toBeVisible()
    // The two homed actions render as quiet footer buttons, not a floating dock.
    await expect(page.getByRole('button', { name: 'compile a worry' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'shutdown' })).toBeVisible()
    await ctx.close()
  })

  test('the dock no longer floats over other tabs', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page, { morning: calmMorning })
    await page.goto('/#/content')

    await expect(page.getByRole('navigation').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'compile a worry' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'shutdown', exact: true })).toHaveCount(0)
    await ctx.close()
  })

  test('an anxious green morning opens the day on focus with steady unfolded', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page, { morning: anxiousMorning })
    await page.goto('/')

    await expect(page).toHaveURL(/#\/focus\?steady=1/)
    // Steady arrives open: its trap chips are already on screen.
    await expect(page.getByRole('button', { name: 'Avoiding an ask' })).toBeVisible()
    await ctx.close()
  })

  test('home keeps a door into focus', async ({ browser }) => {
    // The regression this pins: the 2026-08-20 Home recompose rebuilt Home as a
    // no-scroll canon, which dropped the mounts of the original FocusEntryCard,
    // and a follow-up commit then deleted the component as unmounted. For a
    // stretch main had NO way into the hub from Home at all, and the docs still
    // described the deleted card. The door is a requirement, not a decoration;
    // the next Home redesign has to keep one.
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page, { morning: calmMorning })
    await page.goto('/#/home')

    await page.getByTestId('vitals-focus').click()
    await expect(page.getByRole('heading', { name: 'Today’s ask' })).toBeVisible({ timeout: 15_000 })
    await ctx.close()
  })

  test('a calm morning does not get routed to focus', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    await mock(page, { morning: calmMorning })
    await page.goto('/')

    await expect(page.getByRole('navigation').first()).toBeVisible()
    expect(page.url()).not.toContain('focus')
    await ctx.close()
  })

  test('committing an ask posts the text and the prediction', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York' })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(AFTERNOON)
    const posts: any[] = []
    await mock(page, { morning: calmMorning, onAskPost: b => posts.push(b) })
    await page.goto('/#/focus')

    await page.getByPlaceholder(/Would you be willing/).fill('Would you be willing to introduce me to Sam? If not, no issue.')
    await page.getByRole('button', { name: 'Lean no' }).click()
    await page.getByRole('button', { name: 'Save the ask' }).click()

    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0].ask_text).toContain('introduce me to Sam')
    expect(posts[0].predicted_no_pct).toBe(60)
    expect(posts[0].mark_sent).toBeFalsy()
    await ctx.close()
  })
})
