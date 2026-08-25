import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * Two regressions on the OS → Intel route, both real bugs shipped 2026-08:
 *
 * 1. Ask Marcus stole focus on mount — the only tab-level autofocus in the
 *    app — so on a phone the Intel tab always opened with the keyboard up
 *    inside the fixed no-scroll zoom shell ("it always loads zoomed in").
 *    Focus must arrive only from the user's own tap or ask.
 * 2. MobileShell claimed a fresh full viewport under the OS switcher, so
 *    every OS subtab overflowed the zoom root's clip box by the switcher's
 *    height and the bottom of the page was silently cut off.
 *
 * Catch-alls first — Playwright matches route handlers in reverse
 * registration order.
 */

const SPEND_EMPTY = {
  ok: true, month_usd: 0, avg_3mo_usd: 0, delta_pct: null, ballooning: false,
  months: [], services: [], unmatched: [],
  connections: { ok: 0, low: 0, broken: 0, critical_broken: 0, unchecked: 0, broken_names: [], low_names: [] },
  renewals_due: [], needs_review: 0, meter: null, empty: true, as_of: new Date().toISOString(),
}

async function mock(page: Page) {
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/spend', (r: Route) => r.fulfill({ json: SPEND_EMPTY }))
  await page.route('**/rest/v1/home_intelligence*', (r: Route) => r.fulfill({
    json: {
      summary: { headline: 'Quiet morning.' },
      external_signals: [],
      metrics: [],
      generated_at: new Date().toISOString(),
    },
  }))
}

test.describe('the intel tab does not zoom itself', () => {
  test('mounting Intel on a phone leaves the Ask Marcus box unfocused', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await mock(page)
    await page.goto('/#/os?sub=intel')

    await expect(page.getByPlaceholder(/Ask something pointed/)).toBeVisible()
    const focused = await page.evaluate(() => document.activeElement?.tagName || 'BODY')
    expect(focused).not.toBe('TEXTAREA')
    await ctx.close()
  })

  test('mounting Intel on desktop leaves the Ask Marcus box unfocused', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await mock(page)
    await page.goto('/#/os?sub=intel')

    await expect(page.getByPlaceholder(/Ask something pointed/)).toBeVisible()
    const focused = await page.evaluate(() => document.activeElement?.tagName || 'BODY')
    expect(focused).not.toBe('TEXTAREA')
    await ctx.close()
  })

  for (const sub of ['intel', 'systems'] as const) {
    test(`the ${sub} subtab fits the zoom root's clip box on a phone`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
      const page = await ctx.newPage()
      await mock(page)
      await page.goto(`/#/os?sub=${sub}`)
      await expect(page.getByTestId(`os-sub-${sub}`)).toBeVisible()

      // Every box in the normal flow must end inside the zoom root. Walk the
      // tree but stop at scroll/clip containers: content below the fold of a
      // legitimate inner scroller extends past on purpose, while the old bug
      // (MobileShell claiming a fresh full viewport under the switcher) put
      // the shell's own box ~60 zoomed px past the root, clipping the page
      // bottom with nothing scrollable about it.
      const overflow = await page.evaluate(() => {
        const root = document.querySelector('.mobile-zoom-root')
        if (!root) return 'no zoom root'
        const rootBottom = root.getBoundingClientRect().bottom
        let worst = 0
        const walk = (el: Element) => {
          const style = getComputedStyle(el)
          if (style.position === 'fixed') return
          worst = Math.max(worst, el.getBoundingClientRect().bottom - rootBottom)
          const clips = /(auto|scroll|hidden)/.test(style.overflowY) || /(auto|scroll|hidden)/.test(style.overflow)
          if (clips) return
          for (const child of Array.from(el.children)) walk(child)
        }
        for (const child of Array.from(root.children)) walk(child)
        return worst
      })
      expect(typeof overflow).toBe('number')
      expect(overflow as number).toBeLessThanOrEqual(1)
      await ctx.close()
    })
  }
})
