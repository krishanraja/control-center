import { test, expect } from '@playwright/test'
import { mockAudit, auditTables, VISIBILITY_TARGETS } from './fixtures/audit'
import { standDownTriage, gotoSpeakingLane } from './visibilityStandard'

/**
 * Evidence, not a gate.
 *
 * Writes the screenshots of Nova's surface at 1280x800, the `default` project's width and in both themes,
 * plus the no-scroll measurements, into `shots/`. Behind VISIBILITY_SHOTS=1 so
 * CI does not pay for it, exactly like the layout audit: a suite that fails
 * hides the numbers, and here the numbers and the pixels ARE the point.
 *
 *   VISIBILITY_SHOTS=1 npx playwright test visibility-shots --project=desk-1440
 *
 * Dark is the default; light is reached through `cc-theme`, the same key
 * src/lib/theme.ts reads, so this photographs the real theme rather than a
 * forced colour scheme. (It is `cc-theme` with a hyphen. The triage flag next
 * to it is `cc:triage-dismissed` with a colon, and writing the wrong one here
 * produced two identical "light" and "dark" sets on the first pass.)
 */

const RUN = process.env.VISIBILITY_SHOTS === '1'

async function measure(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const windowScroll = Math.max(
      document.documentElement.scrollHeight - window.innerHeight,
      document.body.scrollHeight - window.innerHeight,
      0,
    )
    const root = (document.querySelector('.mobile-zoom-root') as HTMLElement | null)
      || (document.querySelector('main') as HTMLElement | null)
    const fb = root ? root.getBoundingClientRect().bottom : 0
    // The same clipping question the two gates ask, reported rather than failed.
    // Matches e2e/desk-noscroll-desk.spec.ts: a node inside a scroller BELOW
    // the frame is reachable and is not clipped, so the walk stops there. The
    // first version of this probe counted them and reported 650 "past the
    // frame" on a board the real gate passes, which is the same mistake the
    // original clipping probe made in the other direction.
    let pastFrame = 0
    if (root) {
      const inScroller = (el: Element): boolean => {
        let p: Element | null = el.parentElement
        while (p && p !== root) {
          const o = getComputedStyle(p).overflowY
          if (o === 'auto' || o === 'scroll') return true
          p = p.parentElement
        }
        return false
      }
      const walk = (el: Element) => {
        const s = getComputedStyle(el)
        if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return
        if (s.position === 'fixed') return
        const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && (n.textContent || '').trim())
        if (own && !inScroller(el)) {
          const r = el.getBoundingClientRect()
          if (r.top > fb + 2) pastFrame++
        }
        for (const c of Array.from(el.children)) walk(c)
      }
      walk(root)
    }
    const hero = document.querySelector('[data-testid="worth-taking"], [data-testid="worth-taking-empty"]')
    const hr = hero?.getBoundingClientRect()
    return {
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      windowScroll,
      elementsPastFrame: pastFrame,
      heroHeight: hr ? Math.round(hr.height) : null,
      heroBottomWithinFrame: hr ? Math.round(fb - hr.bottom) : null,
    }
  })
}

for (const theme of ['dark', 'light'] as const) {
  test(`visibility surface, ${theme}`, async ({ page }, info) => {
    test.skip(!RUN, 'VISIBILITY_SHOTS=1 to capture evidence')
    await standDownTriage(page)
    await page.addInitScript(t => {
      try { localStorage.setItem('cc-theme', t) } catch { /* private mode */ }
    }, theme)
    await mockAudit(page)
    await gotoSpeakingLane(page)
    await expect(page.getByTestId('worth-taking')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(900)

    const vp = page.viewportSize()
    const tag = `${vp?.width}x${vp?.height}-${theme}`
    await page.screenshot({ path: `shots/visibility-${tag}.png` })
    const m = await measure(page)
    console.log(`SHOT visibility-${tag} ${JSON.stringify(m)}`)

    // The refusals open, because that is the half of the claim about honesty.
    await page.getByTestId('refused-by-standard').getByRole('button', { name: /Refused by the standard/ }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `shots/visibility-refused-${tag}.png` })
    console.log(`SHOT visibility-refused-${tag} ${JSON.stringify(await measure(page))}`)

    info.annotations.push({ type: 'measure', description: JSON.stringify(m) })
  })

  test(`visibility empty state, ${theme}`, async ({ page }) => {
    test.skip(!RUN, 'VISIBILITY_SHOTS=1 to capture evidence')
    await standDownTriage(page)
    await page.addInitScript(t => {
      try { localStorage.setItem('cc-theme', t) } catch { /* private mode */ }
    }, theme)
    // Every row refused, which is where the live corpus actually stands today.
    await mockAudit(page, {
      ...auditTables(),
      visibility_targets: VISIBILITY_TARGETS.map(t => ({
        ...t, score_version: 1, verdict: 'rejected',
        reject_reason: 'visibility_wrong_audience',
        room_score: 24, standing_score: 70, only_him_score: 31, visibility_score: 24,
      })),
    })
    await gotoSpeakingLane(page)
    await expect(page.getByTestId('worth-taking-empty')).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(700)
    const vp = page.viewportSize()
    const tag = `${vp?.width}x${vp?.height}-${theme}`
    await page.screenshot({ path: `shots/visibility-empty-${tag}.png` })
    console.log(`SHOT visibility-empty-${tag} ${JSON.stringify(await measure(page))}`)
  })
}
