import { test, expect } from '@playwright/test'
import {
  assertNoSqueezedText, assertNoRawErrors, assertRendered, assertNothingOverflows,
} from './fixtures/layout'
import { answerPilotGate } from './pilot-gate-mock'

/**
 * The Network filters on a desk.
 *
 * Krish, 2026-09-17: "this still takes up way too much screen space and there
 * are duplicate filters. ON desktop you can remove the duplicate and put
 * Where + Venture on one row, Role and Tier on another."
 *
 * The duplicate was real and worse than it looked: both rows mapped the same
 * VENTURES array, so they rendered identically, but the filter chips narrow an
 * existing query and NetworkTab returns early with no question typed. With an
 * empty field one of the two identical rows did nothing at all.
 */

/** 69 countries, the shape /api/network/geo returns. */
const COUNTRIES = [
  { code: 'GB', name: 'United Kingdom', n: 1840, featured: true },
  { code: 'AU', name: 'Australia', n: 1120, featured: true },
  { code: 'US', name: 'United States', n: 980, featured: true },
  ...Array.from({ length: 66 }, (_, i) => ({
    code: `X${String(i).padStart(2, '0')}`,
    name: `Country ${i + 1}`,
    n: 60 - (i % 50),
    featured: false,
  })),
]

async function openNetwork(page: import('@playwright/test').Page) {
  await page.route('**/realtime/**', r => r.abort())
  await page.route('**/api/**', r => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }))
  // A real facet list, so the overflow button exists. An empty one skips the
  // popover test silently, which is how "+66 opens a phone sheet on a desk"
  // survived a green suite in the first place.
  await page.route('**/api/network/geo', r => r.fulfill({ json: {
    ok: true, total: 10_670, known: 4_212, unknown: 6_458,
    countries: COUNTRIES,
  } }))
  // Last, so it wins: Playwright matches route handlers in reverse
  // registration order, and the `**\/api\/**` catch-all above answers the
  // check-in with `{ ok: true }`, which is not a shape the gate can read.
  //
  // Without this the gate covers the app and every assertion below fails with
  // `element(s) not found`, which reads as a broken Network tab rather than a
  // missing fixture. It is also CLOCK-dependent: the gate only mounts between
  // 04:00 and 12:00 in the operator's civil day, so this spec passed all
  // afternoon and went red at 10:41 UTC on 2026-09-23 against a bundle it had
  // been green on the evening before. Ten failures on main, no code change
  // between them. pilot-gate-mock's own header warned that this had already
  // cost a debugging cycle in August; this is the same one, in the one desk
  // spec that never called it.
  await answerPilotGate(page)
  await page.goto('/#/people?lane=network')
  await assertRendered(page, 'main')
  await expect(page.getByTestId('network-venture-chip-mindmake')).toBeVisible({ timeout: 15_000 })
}

test('there is one venture control, not two', async ({ page }) => {
  await openNetwork(page)
  // The recommender no longer carries its own copy of the same four chips.
  await expect(page.locator('[data-testid^="network-recommend-venture-"]')).toHaveCount(0)
  await expect(page.getByTestId('network-venture-chip-mindmake')).toHaveCount(1)
})

test('picking a venture with nothing typed offers the push mode', async ({ page }) => {
  await openNetwork(page)
  // Before: the filter chips were inert with an empty field.
  await expect(page.getByTestId('network-recommend-go')).toHaveCount(0)
  await page.getByTestId('network-venture-chip-mindmake').click()
  await expect(page.getByTestId('network-recommend-go')).toBeVisible()
})

test('the four dimensions pair off two to a row', async ({ page }) => {
  await openNetwork(page)
  // Read off geometry, not off class names: Where and Venture share a row,
  // Role and Tier share the next one, and the two rows are distinct.
  const tops = await page.evaluate(() => {
    const at = (sel: string) => {
      const el = document.querySelector(sel)
      return el ? Math.round(el.getBoundingClientRect().top) : -1
    }
    return {
      where: at('[data-testid="network-geo-chip-GB"], [data-testid^="network-geo-chip-"]'),
      venture: at('[data-testid="network-venture-chip-mindmake"]'),
      role: at('[data-testid="network-role-chip-buyer"]'),
      tier: at('[data-testid="network-tier-chip-1_reciprocated"]'),
    }
  })
  expect(Math.abs(tops.where - tops.venture), `Where at ${tops.where}, Venture at ${tops.venture}`).toBeLessThanOrEqual(4)
  expect(Math.abs(tops.role - tops.tier), `Role at ${tops.role}, Tier at ${tops.tier}`).toBeLessThanOrEqual(4)
  expect(tops.role, 'Role/Tier must sit below Where/Venture').toBeGreaterThan(tops.venture + 8)
})

test('the country overflow opens where the pointer is, not off the bottom of the screen', async ({ page }) => {
  await openNetwork(page)
  const more = page.getByTestId('network-geo-more')
  await expect(more, 'the fixture must actually overflow, or this proves nothing').toBeVisible()
  await more.click()
  const pop = page.getByTestId('network-geo-popover')
  await expect(pop).toBeVisible()
  const box = (await pop.boundingBox())!
  const h = page.viewportSize()!.height
  expect(box.y, 'a desk popover hangs under its button, not off the bottom edge').toBeLessThan(h / 2)
})

test('nothing is squeezed and nothing raw reaches the reader', async ({ page }) => {
  await openNetwork(page)
  await assertNoSqueezedText(page, 'main')
  await assertNoRawErrors(page, 'main')
  // Scoped to the filter panel. The People shell is a normal scrolling page
  // and every lane on it scrolls; the no-scroll ruling was about Content.
  // What must not overflow is the block of chrome above the results.
  await assertNothingOverflows(page, '[data-testid="network-filters"]')
})
