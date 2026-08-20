import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * The loading contract.
 *
 * Every assertion here corresponds to a defect that shipped, because each one
 * is invisible in code review and only shows up on a real render:
 *
 *  • The splash hid on React's first commit, which ToastProvider satisfies with
 *    an empty toast container while the pilot read was still in flight. A cold
 *    load went splash, blank, pop, and nothing in the source said so.
 *  • `.skeleton` was hardcoded rgba(255,255,255,…) in a system where every other
 *    muted tier routes through --fg. On the light theme's #F2F1F8 paper that is
 *    a one-value difference, so every skeleton in the app was an invisible gap
 *    in daylight. It looked perfect in dark mode, which is where it was built.
 *  • animate-spin and animate-pulse were never in the reduced-motion block, so
 *    two thirds of the app's animation ignored the OS preference.
 *  • Nothing gated a fast load, so a cached read flashed a placeholder for a
 *    few frames, which reads as a rendering bug rather than as feedback.
 *  • The splash gradient landed on a different colour from the app behind it,
 *    which only became visible once the splash started fading INTO content.
 */

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function mock(page: Page, delayMs: number) {
  await page.route('**/rest/v1/**', async (r: Route) => { await sleep(delayMs); await r.fulfill({ json: [] }) })
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/**', async (r: Route) => { await sleep(delayMs); await r.fulfill({ json: { ok: true } }) })
  await page.route('**/api/pilot/checkin*', async (r: Route) => {
    await sleep(delayMs)
    await r.fulfill({ json: {
      ok: true,
      morning: { id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green', one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false },
      last_evening: null, evening_done_today: false, yesterday: null,
      timezone: 'Australia/Sydney',
      today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date()),
    } })
  })
}

const setTheme = (page: Page, theme: 'dark' | 'light') =>
  page.addInitScript((t) => { try { localStorage.setItem('cc-theme', t) } catch { /* private mode */ } }, theme)

for (const theme of ['dark', 'light'] as const) {
  test(`the splash holds until something has painted behind it (${theme})`, async ({ page }) => {
    await setTheme(page, theme)
    await mock(page, 2500)
    await page.goto('/', { waitUntil: 'commit' })
    await page.waitForTimeout(900)
    // Pilot state has not resolved, so PilotGate is still rendering null and the
    // splash is the only thing that can be on screen. If this fails, the user is
    // looking at a blank page.
    await expect(page.locator('#brand-splash')).toBeVisible()
  })

  test(`skeletons are visible on this theme's ground (${theme})`, async ({ page }) => {
    await setTheme(page, theme)
    await mock(page, 6000)
    await page.goto('/')
    const sk = page.locator('.skeleton').first()
    await sk.waitFor({ timeout: 15_000 })
    const [fill, ground] = await sk.evaluate(el => [
      getComputedStyle(el).backgroundColor,
      getComputedStyle(document.body).backgroundColor,
    ])
    expect(fill).not.toBe('rgba(0, 0, 0, 0)')
    // The real test: the placeholder must differ from the page behind it. A
    // white fill on white paper passes any "is it set" check and is still
    // invisible.
    expect(fill).not.toBe(ground)
  })

  test(`the splash gradient lands on the app's own ground (${theme})`, async ({ page }) => {
    await setTheme(page, theme)
    await mock(page, 2500)
    await page.goto('/', { waitUntil: 'commit' })
    await page.waitForTimeout(400)
    const { splashEnd, ground } = await page.evaluate(() => {
      const el = document.getElementById('brand-splash')
      const image = el ? getComputedStyle(el).backgroundImage : ''
      // The last rgb() in the gradient is the colour it resolves to at the edges.
      const stops = image.match(/rgb\([^)]*\)/g) || []
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim()
      return { splashEnd: stops[stops.length - 1] || '', ground: `rgb(${raw.split(/\s+/).join(', ')})` }
    })
    // Now that the splash fades INTO content rather than onto a blank screen,
    // any disagreement between the two grounds is a visible shift at handoff.
    expect(splashEnd).toBe(ground)
  })
}

test('no placeholder is painted inside the anti-flash gate', async ({ page }) => {
  await setTheme(page, 'dark')
  await mock(page, 0)

  // Measured from inside the page rather than by sleeping and looking, because
  // "wait 150ms then count" is a race against machine load, not an assertion
  // about the gate. This records when React first committed anything and when
  // the first .skeleton node was actually inserted, and compares the two.
  await page.addInitScript(() => {
    const w = window as unknown as { __firstCommit?: number; __firstSkeleton?: number }
    const root = () => document.getElementById('root')
    const obs = new MutationObserver(() => {
      const r = root()
      if (!r) return
      if (w.__firstCommit === undefined && r.childElementCount > 0) w.__firstCommit = performance.now()
      if (w.__firstSkeleton === undefined && document.querySelector('.skeleton')) {
        w.__firstSkeleton = performance.now()
      }
    })
    document.addEventListener('DOMContentLoaded', () => {
      obs.observe(document.documentElement, { childList: true, subtree: true })
    })
  })

  await page.goto('/')
  await page.waitForTimeout(1200)
  const { firstCommit, firstSkeleton } = await page.evaluate(() => {
    const w = window as unknown as { __firstCommit?: number; __firstSkeleton?: number }
    return { firstCommit: w.__firstCommit ?? null, firstSkeleton: w.__firstSkeleton ?? null }
  })

  expect(firstCommit).not.toBeNull()
  // Nothing painted at all is the ideal outcome on an instant load. If anything
  // did, it must have waited out the gate first: a component's own mount is at
  // or after the first commit, so this bound holds for every one of them.
  if (firstSkeleton !== null) {
    expect(firstSkeleton - (firstCommit as number)).toBeGreaterThanOrEqual(190)
  }
})

test('reduced motion holds every animation still', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await setTheme(page, 'dark')
  await mock(page, 6000)
  await page.goto('/')
  await page.waitForSelector('.skeleton', { timeout: 15_000 })
  const moving = await page.evaluate(() =>
    Array.from(document.querySelectorAll('*')).filter((el) => {
      const own = getComputedStyle(el).animationName
      const after = getComputedStyle(el, '::after').animationName
      return (own && own !== 'none') || (after && after !== 'none')
    }).map(el => `${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 40)}`))
  expect(moving, `still animating: ${moving.join(', ')}`).toEqual([])
  await ctx.close()
})

test('a depleted day slows the wait rather than hurrying it', async ({ page }) => {
  await setTheme(page, 'dark')
  await mock(page, 6000)
  await page.goto('/')
  await page.waitForSelector('.skeleton', { timeout: 15_000 })
  // Stamped after the app has settled: theme.ts applyCapacity strips the
  // attribute on a steady day, which is correct behaviour, so anything set
  // earlier is gone by the time the first skeleton paints.
  const dial = await page.evaluate(() => {
    document.documentElement.setAttribute('data-capacity', 'low')
    return getComputedStyle(document.documentElement).getPropertyValue('--dur-skeleton').trim()
  })
  expect(dial).toBe('2.2s')
})
