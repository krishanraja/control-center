import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * The desk is driven with a keyboard, so the keyboard is a contract.
 *
 * Audited 2026-09-17 against the original brief ("whether I am using keyboard
 * and mouse on desktop"). Most of it was already right — all four advertised
 * shortcuts worked and closed on Escape — which is exactly why it is worth
 * pinning before something quietly takes one away. Two things were not:
 *
 *  • the sidebar's "More" was the one control with no focus ring, so a keyboard
 *    user lost the cursor for exactly one stop, the stop that opens the drawer
 *    holding Focus and Subscriptions;
 *  • and the sidebar is ten focusable stops, so reaching the page cost ten Tabs
 *    on every navigation. Hence the skip link, which must stay FIRST.
 */

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date())

async function mock(page: Page) {
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/api/pilot/checkin*', (r: Route) => r.fulfill({
    json: {
      ok: true,
      morning: { id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green', one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false },
      last_evening: null, evening_done_today: true, yesterday: null,
      timezone: 'Australia/Sydney', today,
    },
  }))
}

const anyDialog = (page: Page) =>
  page.evaluate(() => Boolean(document.querySelector('[role="dialog"], [cmdk-root]')))

for (const [name, combo] of [
  ['the command palette', 'Meta+k'],
  ['idea capture', 'Meta+i'],
  ['the inbox', 'Meta+j'],
  ['ask', 'Meta+/'],
] as const) {
  test(`${name} opens on its shortcut and closes on Escape`, async ({ page }) => {
    await mock(page)
    await page.goto('/#/home')
    await expect(page.getByTestId('skip-to-content')).toHaveCount(1, { timeout: 15_000 })

    expect(await anyDialog(page)).toBe(false)
    await page.keyboard.press(combo)

    // Wait for the overlay to be OPEN and LISTENING, not merely present.
    // Polling for presence resolves on its first frame; a key pressed before
    // the overlay's own Escape handler is attached is swallowed, which reads as
    // "Escape does not close this" when Escape is fine. Verified by hand at
    // 1280x800 and 1512x982: Escape closes all four. Two signals, because
    // either alone is racy — the overlay is visible, and focus is inside it.
    const overlay = page.locator('[role="dialog"], [cmdk-root]').first()
    await expect(overlay).toBeVisible()
    await expect.poll(() => page.evaluate(() =>
      Boolean(document.activeElement?.closest('[role="dialog"], [cmdk-root]')))).toBe(true)
    await page.waitForTimeout(250)

    await page.keyboard.press('Escape')
    await expect.poll(() => anyDialog(page)).toBe(false)
  })
}

test('every sidebar control shows where the keyboard is', async ({ page }) => {
  await mock(page)
  await page.goto('/#/home')
  await expect(page.getByTestId('skip-to-content')).toHaveCount(1, { timeout: 15_000 })

  const blind = await page.evaluate(() => {
    const out: string[] = []
    const nav = document.querySelector('aside, nav') ?? document.body
    for (const el of [...nav.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]')]) {
      const b = el.getBoundingClientRect()
      if (b.width < 4 || b.height < 4) continue
      el.focus()
      const cs = getComputedStyle(el)
      const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0
      const shadow = Boolean(cs.boxShadow) && cs.boxShadow !== 'none'
      if (!ring && !shadow) out.push((el.innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30))
    }
    return out
  })
  expect(blind, `sidebar controls with no focus indicator: ${blind.join(', ')}`).toEqual([])
})

test('skip to content is the first stop and lands the keyboard in the page', async ({ page }) => {
  await mock(page)
  await page.goto('/#/home')
  const skip = page.getByTestId('skip-to-content')
  await expect(skip).toHaveCount(1, { timeout: 15_000 })

  await page.keyboard.press('Tab')
  await expect(skip).toBeFocused()

  // It must move FOCUS, not just the scroll position, or the next Tab resumes
  // in the nav and the link has bought nothing.
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() =>
    Boolean(document.activeElement?.closest('main')))).toBe(true)
})
