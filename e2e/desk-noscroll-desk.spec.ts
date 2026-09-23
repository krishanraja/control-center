import { test, expect, type Page } from '@playwright/test'
import { mockAudit, AUDIT_ROUTES } from './fixtures/audit'

/**
 * Every desk surface is one screen, and everything on it is reachable.
 *
 * `layout-audit-desk.spec.ts` is the instrument — it measures and reports and
 * never fails. This is the gate: the three invariants that must not come back,
 * asserted on every desktop surface with populated fixtures.
 *
 * 1. **The window never scrolls.** The shell is `h-[100dvh] overflow-hidden`,
 *    so a tab that grows past it does not scroll the page — it is cut off.
 * 2. **Nothing is clipped.** This is the invariant the no-scroll shell can
 *    break quietly. A surface laid out in normal flow inside an
 *    `overflow-hidden` frame has its overflow simply removed: nothing scrolls,
 *    nothing overlaps, the screenshot looks tidy, and the missing rows are not
 *    in it either. Measured 2026-09-23, Systems was 225px over with 60
 *    elements past the bottom edge and every other probe green.
 * 3. **No surface shows an error boundary.** Two of fifteen did, both from a
 *    timestamp the code had not proved was a timestamp.
 *
 * Runs at 1440x900 and 1920x1080, because the rails and focus columns hang off
 * a 1400px breakpoint and a suite that only ever rendered 1280 never saw them.
 */

/** Content laid out past the bottom of the frame with no scroller to reach it. */
async function clipped(page: Page) {
  return page.evaluate(() => {
    const frame = document.querySelector('main') as HTMLElement | null
    if (!frame) return ['NO MAIN']
    const fb = frame.getBoundingClientRect().bottom
    const bad: string[] = []
    const walk = (el: Element) => {
      const he = el as HTMLElement
      const cs = getComputedStyle(he)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return
      if (he !== frame) {
        let n: HTMLElement | null = he.parentElement
        while (n && n !== frame) {
          const pcs = getComputedStyle(n)
          if (pcs.overflowY === 'auto' || pcs.overflowY === 'scroll') return
          n = n.parentElement
        }
      }
      const own = Array.from(he.childNodes).filter(t => t.nodeType === Node.TEXT_NODE)
        .map(t => t.textContent || '').join(' ').trim()
      if (own) {
        const r = he.getBoundingClientRect()
        if (r.top > fb + 2) bad.push(`"${own.slice(0, 40)}" ${Math.round(r.top - fb)}px past the frame`)
      }
      for (const c of Array.from(he.children)) walk(c)
    }
    walk(frame)
    return Array.from(new Set(bad)).slice(0, 6)
  })
}

test.describe.configure({ mode: 'serial' })

for (const route of AUDIT_ROUTES) {
  test(`${route.name} is one screen, whole`, async ({ page }) => {
    await mockAudit(page)
    await page.goto(`/${route.hash}`)
    await page.waitForTimeout(2200)

    const crashed = await page.evaluate(() => {
      const t = document.querySelector('main')?.textContent || ''
      return /failed to render|Minified React error|Something went wrong/i.test(t) ? t.slice(0, 160) : null
    })
    expect(crashed, `${route.name} is showing an error boundary: ${crashed}`).toBeNull()

    const windowScroll = await page.evaluate(() => Math.max(
      document.documentElement.scrollHeight - innerHeight,
      document.body.scrollHeight - innerHeight, 0))
    expect(windowScroll, `${route.name} scrolls the window by ${windowScroll}px`).toBeLessThanOrEqual(2)

    const cut = await clipped(page)
    expect(cut, `${route.name} has content cut off below the frame:\n${cut.join('\n')}`).toEqual([])
  })
}
