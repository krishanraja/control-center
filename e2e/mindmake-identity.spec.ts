import { test, expect, type Browser, type Locator, type Page, type Route } from '@playwright/test'

const AFTERNOON = new Date('2026-08-20T18:30:00Z')
const calmMorning = {
  id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green',
  one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false,
}

const SHIFTS = [
  {
    id: 's-built', slug: 'agents-in-ci', title: 'Agent teams are moving into CI pipelines',
    summary: 'x', implication: 'x', category: 'tools', status: 'active', lane: 'built',
    first_seen_on: '2026-07-01', last_evidence_on: '2026-08-20',
    momentum: 4, momentum_history: [{ week: '2026-W32', momentum: 3 }, { week: '2026-W33', momentum: 4 }],
    day_span_total: 9, source_count_total: 5, story_count: 12, provenance: 'lived', decision: null,
  },
]

const OS_GOALS = [
  { id: 'os:leaders', title: '200+ leaders served by end of 2026' },
  { id: 'os:ops', title: 'Krish under 2 hours/day on ops' },
  { id: 'os:asset', title: 'OS becomes a licensable asset' },
]

function goalRow(id: string, title: string) {
  return {
    id, title, horizon: 'os', parent_id: null, venture: null, status: 'active',
    priority: null, why_now: null, definition_of_done: null, target_horizon: null,
    is_stale: false, orphaned: false, days_since_touch: 1, stale_after_days: 90,
    updated_at: AFTERNOON.toISOString(), created_at: AFTERNOON.toISOString(),
  }
}

async function mockApp(page: Page) {
  // Playwright evaluates page.route handlers in reverse registration order.
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())

  await page.route('**/api/pilot/timezone', (r: Route) =>
    r.fulfill({ json: { ok: true, timezone: 'America/New_York' } }))
  await page.route('**/api/pilot/checkin*', (r: Route) => r.fulfill({ json: {
    ok: true, morning: calmMorning, last_evening: null, evening_done_today: true,
    yesterday: null, timezone: 'America/New_York', today: '2026-08-20',
  } }))
  await page.route('**/api/pilot/worries*', (r: Route) => r.fulfill({ json: {
    ok: true, due: [], calibration: { total_closed: 0, pct_confirmed: 0 },
    open_test_count: 0, cap: 5, today: '2026-08-20',
  } }))
  await page.route('**/api/pilot/ships*', (r: Route) => r.fulfill({ json: {
    ok: true, summary: { this_week: 4, days_since_last: 0, return_rate: 2, last_ten: [] },
  } }))
  const goals = OS_GOALS.map(g => goalRow(g.id, g.title))
  await page.route('**/api/goals/ladder*', (r: Route) => r.fulfill({ json: {
    ok: true, horizons: ['os', 'weekly'], by_horizon: { os: goals, weekly: [] },
    goals, stale_count: 0, orphan_count: 0, ventures: ['mindmake'],
    north_star: '', week_of: 'Aug 17-23',
  } }))
  await page.route('**/rest/v1/shifts*', (r: Route) => r.fulfill({ json: SHIFTS }))
}

async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript(t => {
    localStorage.setItem('cc-theme', t)
    localStorage.setItem('cc-ambient', 'off')
  }, theme)
}

type SeriesMetrics = {
  outerWidth: number
  letterHeight: number
  letterWidth: number
  visibleLetterWidth: number
  letterWidthCoverage: number
  symbolVisible: number
  minOpaqueContrast: number
  opaqueLetterPixels: number
  anchorSize: number
  anchorGlyphSize: number
  horizontalGap: number
  rootLeft: number
  rootRight: number
  viewportWidth: number
  cropContainedByRoot: boolean
}

async function measureSeries(identity: Locator): Promise<SeriesMetrics> {
  return identity.evaluate(async root => {
    const image = root.querySelector<HTMLImageElement>('[data-series-wordmark-image="true"]')
    const crop = root.querySelector<HTMLElement>('[data-series-wordmark-crop="true"]')
    const anchor = root.querySelector<HTMLElement>('[data-mindmake-compact="true"]')
    const anchorGlyph = root.querySelector<HTMLElement>('[data-mindmake-mark-glyph="true"]')
    if (!image || !crop || !anchor || !anchorGlyph) throw new Error('series identity projection is incomplete')
    await image.decode()

    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('canvas unavailable')
    ctx.drawImage(image, 0, 0)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data

    const activeRows: number[] = []
    for (let y = 0; y < canvas.height; y++) {
      let active = false
      for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3] > 32) { active = true; break }
      }
      if (active) activeRows.push(y)
    }
    const groups: Array<[number, number]> = []
    for (const y of activeRows) {
      const last = groups[groups.length - 1]
      if (!last || y > last[1] + 1) groups.push([y, y])
      else last[1] = y
    }
    const letters = groups[groups.length - 1]
    if (!letters) throw new Error('series asset has no painted pixels')

    const imageRect = image.getBoundingClientRect()
    const cropRect = crop.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    const anchorRect = anchor.getBoundingClientRect()
    const anchorGlyphRect = anchorGlyph.getBoundingClientRect()
    const scale = imageRect.width / image.naturalWidth
    const letterTop = imageRect.top + letters[0] * scale
    const letterBottom = imageRect.top + (letters[1] + 1) * scale
    const visibleTop = Math.max(letterTop, cropRect.top)
    const visibleBottom = Math.min(letterBottom, cropRect.bottom)
    const letterLeftX = Number(image.dataset.letterLeftX)
    const letterRightX = Number(image.dataset.letterRightX)
    const letterLeft = imageRect.left + letterLeftX * scale
    const letterRight = imageRect.left + (letterRightX + 1) * scale
    const visibleLetterLeft = Math.max(letterLeft, cropRect.left)
    const visibleLetterRight = Math.min(letterRight, cropRect.right)
    const letterWidth = Math.max(0, letterRight - letterLeft)
    const visibleLetterWidth = Math.max(0, visibleLetterRight - visibleLetterLeft)
    const symbolEndY = Number(image.dataset.symbolEndY)
    const symbolBottom = imageRect.top + (symbolEndY + 1) * scale

    const parseRgb = (value: string) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
    const background = parseRgb(getComputedStyle(root).backgroundColor)
    const channel = (value: number) => {
      const s = value / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    const luminance = (rgb: number[]) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
    const contrast = (a: number[], b: number[]) => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (high + 0.05) / (low + 0.05)
    }

    let minOpaqueContrast = Number.POSITIVE_INFINITY
    let opaqueLetterPixels = 0
    for (let y = letters[0]; y <= letters[1]; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4
        if (pixels[i + 3] < 240) continue
        opaqueLetterPixels++
        minOpaqueContrast = Math.min(minOpaqueContrast, contrast(
          [pixels[i], pixels[i + 1], pixels[i + 2]],
          background,
        ))
      }
    }

    return {
      outerWidth: rootRect.width,
      letterHeight: Math.max(0, visibleBottom - visibleTop),
      letterWidth,
      visibleLetterWidth,
      letterWidthCoverage: letterWidth > 0 ? visibleLetterWidth / letterWidth : 0,
      symbolVisible: Math.max(0, symbolBottom - cropRect.top),
      minOpaqueContrast,
      opaqueLetterPixels,
      anchorSize: Math.min(anchorRect.width, anchorRect.height),
      anchorGlyphSize: Math.min(anchorGlyphRect.width, anchorGlyphRect.height),
      horizontalGap: cropRect.left - anchorRect.right,
      rootLeft: rootRect.left,
      rootRight: rootRect.right,
      viewportWidth: window.innerWidth,
      cropContainedByRoot: cropRect.left >= rootRect.left - 0.5 && cropRect.right <= rootRect.right + 0.5,
    }
  })
}

async function screenshotInkMetrics(page: Page, element: Locator) {
  const screenshot = await element.screenshot()
  return page.evaluate(async base64 => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('canvas unavailable')
    ctx.drawImage(image, 0, 0)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    // Locator screenshots are fully composited. Find the dominant quantised
    // colour instead of assuming the first pixel is outside the SVG mask.
    const buckets = new Map<string, { count: number; rgb: number[] }>()
    for (let i = 0; i < pixels.length; i += 4) {
      const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]]
      const key = rgb.map(value => Math.round(value / 8) * 8).join(',')
      const current = buckets.get(key)
      if (current) current.count++
      else buckets.set(key, { count: 1, rgb })
    }
    const background = [...buckets.values()].sort((a, b) => b.count - a.count)[0]?.rgb || [0, 0, 0]
    const channel = (value: number) => {
      const s = value / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    const luminance = (rgb: number[]) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
    const ratio = (a: number[], b: number[]) => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (high + 0.05) / (low + 0.05)
    }
    const paintedContrasts: number[] = []
    for (let i = 0; i < pixels.length; i += 4) {
      const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]]
      const distance = Math.abs(rgb[0] - background[0]) + Math.abs(rgb[1] - background[1]) + Math.abs(rgb[2] - background[2])
      if (distance >= 48) paintedContrasts.push(ratio(rgb, background))
    }
    const highContrastPixels = paintedContrasts.filter(value => value >= 4.5).length
    return {
      paintedPixels: paintedContrasts.length,
      highContrastPixels,
      highContrastShare: paintedContrasts.length > 0 ? highContrastPixels / paintedContrasts.length : 0,
    }
  }, screenshot.toString('base64'))
}

async function openApp(browser: Browser, options: Parameters<Browser['newContext']>[0], theme: 'dark' | 'light') {
  const context = await browser.newContext({ timezoneId: 'America/New_York', ...options })
  const page = await context.newPage()
  await page.clock.setFixedTime(AFTERNOON)
  await setTheme(page, theme)
  await mockApp(page)
  return { context, page }
}

test('375px mobile keeps the real mark and both official series wordmarks legible', async ({ browser }) => {
  const { context, page } = await openApp(browser, { viewport: { width: 375, height: 667 }, hasTouch: true }, 'dark')

  await page.goto('/#/home')
  const homeIdentity = page.getByTestId('mobile-home-identity')
  await expect(homeIdentity).toBeVisible()
  const compact = await homeIdentity.evaluate(root => {
    const glyph = root.querySelector<HTMLElement>('[data-mindmake-mark-glyph="true"]')
    return {
      tileCss: parseFloat(getComputedStyle(root).width),
      tilePixels: root.getBoundingClientRect().width,
      glyphCss: glyph ? parseFloat(getComputedStyle(glyph).width) : 0,
      glyphPixels: glyph?.getBoundingClientRect().width || 0,
    }
  })
  expect(compact.tileCss).toBeGreaterThanOrEqual(36)
  expect(compact.glyphCss).toBeGreaterThanOrEqual(24)
  expect(compact.tilePixels).toBeGreaterThanOrEqual(36)
  expect(compact.glyphPixels).toBeGreaterThanOrEqual(24)

  await page.goto('/#/content')
  await page.getByTestId('content-room-built').click()
  await expect(page.getByRole('tab', { name: /Built With AI/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /The Money of AI/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /^Built$/ })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: /^Paid$/ })).toHaveCount(0)

  for (const series of ['built', 'paid'] as const) {
    await page.getByTestId(`content-room-${series}`).click()
    const identity = page.getByTestId(`series-identity-${series}`)
    await expect(identity).toBeVisible()
    const metrics = await measureSeries(identity)
    expect(metrics.outerWidth).toBeGreaterThanOrEqual(300)
    expect(metrics.letterHeight).toBeGreaterThanOrEqual(16)
    expect(metrics.letterWidth).toBeGreaterThan(0)
    expect(metrics.letterWidthCoverage).toBeGreaterThanOrEqual(0.995)
    expect(metrics.symbolVisible).toBeLessThanOrEqual(0.75)
    expect(metrics.opaqueLetterPixels).toBeGreaterThan(2_000)
    expect(metrics.minOpaqueContrast).toBeGreaterThanOrEqual(4.5)
    expect(metrics.anchorSize).toBeGreaterThanOrEqual(36)
    expect(metrics.anchorGlyphSize).toBeGreaterThanOrEqual(24)
    expect(metrics.horizontalGap).toBeGreaterThan(0)
    expect(metrics.rootLeft).toBeGreaterThanOrEqual(-0.5)
    expect(metrics.rootRight).toBeLessThanOrEqual(metrics.viewportWidth + 0.5)
    expect(metrics.cropContainedByRoot).toBe(true)
    if (process.env.MINDMAKE_CAPTURE) {
      await page.screenshot({ path: test.info().outputPath(`mobile-series-${series}.png`) })
    }
  }

  await context.close()
})

for (const theme of ['dark', 'light'] as const) {
  test(`desktop expanded identity uses the official theme-aware wordmark in ${theme}`, async ({ browser }) => {
    const { context, page } = await openApp(browser, { viewport: { width: 1280, height: 800 } }, theme)
    await page.goto('/#/content')

    const identity = page.getByTestId('desktop-sidebar-identity')
    await expect(identity).toBeVisible()
    const wordmark = identity.locator('[data-mindmake-wordmark="true"]')
    const width = await wordmark.evaluate(el => el.getBoundingClientRect().width)
    const mask = await wordmark.evaluate(el => {
      const style = getComputedStyle(el)
      return style.maskImage || style.webkitMaskImage
    })
    expect(width).toBeGreaterThanOrEqual(132)
    expect(mask).toContain('mindmake-wordmark.svg')

    const ink = await screenshotInkMetrics(page, wordmark)
    expect(ink.paintedPixels).toBeGreaterThan(250)
    expect(ink.highContrastPixels).toBeGreaterThan(250)
    // Antialiased edge pixels are necessarily blends; require a majority of
    // the actually painted wordmark to clear text contrast after compositing.
    expect(ink.highContrastShare).toBeGreaterThanOrEqual(0.55)

    const series = page.getByTestId('series-identity-built')
    await expect(series).toBeVisible()
    const metrics = await measureSeries(series)
    expect(metrics.outerWidth).toBeGreaterThanOrEqual(320)
    expect(metrics.letterHeight).toBeGreaterThanOrEqual(16)
    expect(metrics.letterWidthCoverage).toBeGreaterThanOrEqual(0.995)
    expect(metrics.minOpaqueContrast).toBeGreaterThanOrEqual(4.5)
    expect(metrics.rootLeft).toBeGreaterThanOrEqual(-0.5)
    expect(metrics.rootRight).toBeLessThanOrEqual(metrics.viewportWidth + 0.5)
    expect(metrics.cropContainedByRoot).toBe(true)
    if (process.env.MINDMAKE_CAPTURE) {
      await page.screenshot({ path: test.info().outputPath(`desktop-${theme}-content.png`) })
    }
    await context.close()
  })
}

test('coarse-pointer desktop can control the sidebar without hover and reduced motion is still', async ({ browser }) => {
  const { context, page } = await openApp(
    browser,
    { viewport: { width: 1024, height: 768 }, hasTouch: true, reducedMotion: 'reduce' },
    'light',
  )
  await page.goto('/#/home')

  const sidebar = page.getByTestId('desktop-sidebar')
  const toggle = page.getByTestId('desktop-sidebar-toggle')
  await expect(sidebar).toHaveAttribute('data-expanded', 'true')
  await expect(toggle).toHaveAccessibleName('Collapse sidebar')
  const reducedDurations = await Promise.all([
    toggle.evaluate(el => parseFloat(getComputedStyle(el).transitionDuration) || 0),
    sidebar.evaluate(el => parseFloat(getComputedStyle(el).transitionDuration) || 0),
  ])
  expect(Math.max(...reducedDurations)).toBeLessThanOrEqual(0.001)

  await toggle.click()
  await expect(sidebar).toHaveAttribute('data-expanded', 'false')
  await expect(toggle).toHaveAccessibleName('Expand sidebar')
  expect((await sidebar.boundingBox())?.width).toBeLessThanOrEqual(73)
  await expect(page.getByRole('button', { name: 'Content', exact: true })).toBeVisible()

  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(sidebar).toHaveAttribute('data-expanded', 'true')
  await expect(toggle).toHaveAccessibleName('Collapse sidebar')
  await context.close()
})

test('fine-pointer hover remains an optional sidebar convenience after explicit collapse', async ({ browser }) => {
  const { context, page } = await openApp(browser, { viewport: { width: 1280, height: 800 } }, 'dark')
  await page.goto('/#/home')
  const sidebar = page.getByTestId('desktop-sidebar')
  await page.getByTestId('desktop-sidebar-toggle').click()
  await expect(sidebar).toHaveAttribute('data-expanded', 'false')

  await page.mouse.move(600, 200)
  await page.mouse.move(20, 120)
  await expect(sidebar).toHaveAttribute('data-expanded', 'true')
  await expect(page.getByTestId('desktop-sidebar-toggle')).toHaveAccessibleName('Keep sidebar open')

  await page.mouse.move(600, 200)
  await expect(sidebar).toHaveAttribute('data-expanded', 'false')
  await context.close()
})

const MOBILE_DESTINATIONS = ['home', 'content', 'people', 'growth', 'os', 'focus', 'customers'] as const

for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  test(`${viewport.width}px mobile shell contains every destination and keeps its controls physical`, async ({ browser }) => {
    const { context, page } = await openApp(browser, { viewport, hasTouch: true }, 'dark')

    for (const destination of MOBILE_DESTINATIONS) {
      await page.goto(`/#/${destination}`)
      const nav = page.getByRole('navigation', { name: 'Primary' })
      await expect(nav).toBeVisible()
      await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeVisible()

      const shell = await page.evaluate(() => {
        const scrolling = document.scrollingElement as HTMLElement
        const root = document.getElementById('root')!
        return {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          pageWidth: scrolling.scrollWidth,
          pageHeight: scrolling.scrollHeight,
          rootWidth: root.getBoundingClientRect().width,
          rootHeight: root.getBoundingClientRect().height,
        }
      })
      expect(shell.pageWidth, `${destination} caused page-level horizontal overflow`).toBeLessThanOrEqual(shell.viewportWidth + 1)
      expect(shell.pageHeight, `${destination} caused page-level vertical scroll`).toBeLessThanOrEqual(shell.viewportHeight + 1)
      expect(shell.rootWidth).toBeLessThanOrEqual(shell.viewportWidth + 1)
      expect(shell.rootHeight).toBeLessThanOrEqual(shell.viewportHeight + 1)

      const navBox = await nav.boundingBox()
      expect(navBox).not.toBeNull()
      expect(navBox!.x).toBeGreaterThanOrEqual(0)
      expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(viewport.width)
      expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(viewport.height)

      const navSurface = nav.locator(':scope > div')
      const material = await navSurface.evaluate(el => {
        const style = getComputedStyle(el)
        return { background: style.backgroundColor, backdrop: style.backdropFilter || style.webkitBackdropFilter }
      })
      expect(material.background).not.toMatch(/rgba\([^)]*,\s*0(?:\.|\))/)
      expect(material.backdrop).toBe('none')

      const navButtons = nav.getByRole('button')
      for (let index = 0; index < await navButtons.count(); index += 1) {
        const box = await navButtons.nth(index).boundingBox()
        expect(box?.height || 0).toBeGreaterThanOrEqual(44)
      }
      const createBox = await page.getByRole('button', { name: 'Create', exact: true }).boundingBox()
      expect(createBox?.width || 0).toBeGreaterThanOrEqual(48)
      expect(createBox?.height || 0).toBeGreaterThanOrEqual(48)
      if (process.env.MINDMAKE_CAPTURE && viewport.width === 390 && ['home', 'content', 'people', 'growth'].includes(destination)) {
        await page.screenshot({ path: test.info().outputPath(`mobile-${destination}.png`) })
      }
    }

    await context.close()
  })
}

test('reduced motion and low capacity calm the shared shell rather than changing its structure', async ({ browser }) => {
  const { context, page } = await openApp(
    browser,
    { viewport: { width: 375, height: 667 }, hasTouch: true, reducedMotion: 'reduce' },
    'light',
  )
  await page.goto('/#/home')
  const nav = page.getByRole('navigation', { name: 'Primary' })
  await expect(nav).toBeVisible()

  const motion = await page.evaluate(() => {
    document.documentElement.removeAttribute('data-ambient')
    const ambient = document.querySelector<HTMLElement>('.ambient-field')!
    const navButton = document.querySelector<HTMLElement>('nav[aria-label="Primary"] button')!
    const create = document.querySelector<HTMLElement>('button[aria-label="Create"]')!
    const normalOpacity = Number.parseFloat(getComputedStyle(ambient).opacity)
    document.documentElement.setAttribute('data-capacity', 'low')
    const lowOpacity = Number.parseFloat(getComputedStyle(ambient).opacity)
    const longest = (value: string) => Math.max(...value.split(',').map(part => Number.parseFloat(part) || 0))
    return {
      normalOpacity,
      lowOpacity,
      ambientAnimation: getComputedStyle(ambient).animationName,
      navTransition: longest(getComputedStyle(navButton).transitionDuration),
      createTransition: longest(getComputedStyle(create).transitionDuration),
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    }
  })
  expect(motion.normalOpacity).toBeCloseTo(0.16, 2)
  expect(motion.lowOpacity).toBeCloseTo(0.07, 2)
  expect(motion.lowOpacity).toBeLessThan(motion.normalOpacity)
  expect(motion.ambientAnimation).toBe('none')
  expect(motion.navTransition).toBeLessThanOrEqual(0.001)
  expect(motion.createTransition).toBeLessThanOrEqual(0.001)
  expect(motion.scrollBehavior).toBe('auto')

  await page.getByRole('button', { name: 'More', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'More' })
  await expect(dialog).toBeVisible()
  const dialogTransition = await dialog.evaluate(el => Math.max(...getComputedStyle(el).transitionDuration.split(',').map(part => Number.parseFloat(part) || 0)))
  expect(dialogTransition).toBeLessThanOrEqual(0.001)
  await context.close()
})
