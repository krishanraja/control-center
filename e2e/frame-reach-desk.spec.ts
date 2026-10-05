import { test } from '@playwright/test'
import { mockAudit } from './fixtures/audit'
import { assertBodyReachesFrame, assertRendered } from './fixtures/layout'

/**
 * Every scrolling desk tab reaches the bottom of the screen.
 *
 * #389 found the Content tab stopping 96px short: the shell reserved the ⌘I /
 * ⌘/ pill gutter by SHORTENING the frame, so the one scroller ended above the
 * bottom of the window, sliced its last row through and left dead paper under
 * it. `e2e/content-desk.spec.ts` guards Content. The same wrapper in `App.tsx`
 * held Customers, People, OS and Focus, and every scroller in them measured the
 * same defect at 1440x900 on 2026-10-05: bottom edge at 804 in a 900px window.
 * Focus had no scroller at all, so anything past 804 was clipped.
 *
 * The clearance now lives INSIDE each scroller (AppFrame `capturePills`, or
 * `CAPTURE_PILLS_PAD` on a split pane). This walks every one of them, so the
 * defect cannot come back on any tab without this file going red.
 *
 * Proved able to fail: with the wrapper's bottom padding put back to
 * `pb-[calc(1.5rem+var(--capture-gutter))]`, every check below fails at a gap
 * of 96px (see the PR that added this file).
 *
 * People > Visibility is deliberately absent: it is owned by a parallel rework
 * and keeps the old clearance (PeopleTab), so it is not yet a scroller that
 * reaches the frame. Add it here when its AppFrame takes `capturePills`.
 */

const SCROLLERS: Array<{ name: string; hash: string; bodies: string[] }> = [
  { name: 'Customers', hash: '#/customers', bodies: ['subscriptions-stage'] },
  { name: 'People · Network', hash: '#/people?lane=network', bodies: ['network-scroll'] },
  { name: 'People · Hunt', hash: '#/people?lane=bridges', bodies: ['hunt-scroll'] },
  { name: 'People · Advisory', hash: '#/people?lane=pilots', bodies: ['pilots-scroll'] },
  { name: 'OS · Org', hash: '#/os?sub=org', bodies: ['org-left', 'org-right'] },
  { name: 'OS · Intel', hash: '#/os?sub=intel', bodies: ['intel-scroll'] },
  { name: 'OS · Flows', hash: '#/os?sub=flows', bodies: ['flows-scroll'] },
  { name: 'OS · Systems', hash: '#/os?sub=systems', bodies: ['systems-scroll'] },
  { name: 'Focus', hash: '#/focus', bodies: ['focus-scroll'] },
]

for (const s of SCROLLERS) {
  test(`${s.name}: the scroller reaches the bottom of the frame`, async ({ page }) => {
    await mockAudit(page)
    await page.goto(`/${s.hash}`)
    await page.locator(`[data-testid="${s.bodies[0]}"]`).waitFor({ timeout: 15_000 })
    await page.waitForTimeout(600)
    await assertRendered(page, 'main')
    for (const b of s.bodies) {
      await assertBodyReachesFrame(page, `[data-testid="${b}"]`, 'main')
    }
  })
}
