import { test, expect, type Page, type Route } from '@playwright/test'
import { answerPilotGate } from './pilot-gate-mock'

/**
 * The composer, for a weekly brief.
 *
 * There was no content coverage at all when this was written, which is part of
 * why the surface drifted: contentEngine.ts held 26 one-click edits, the piece
 * composer rendered every one, and the separate v2 brief editor kept its own
 * four-item list on the surface where the weekly work actually happens.
 * Nothing was broken, so nothing caught it.
 *
 * These specs pin the things that were actually wrong, in the user's terms:
 * the brief opens in the composer, the rail is there and its tabs are legible,
 * and the palette on a brief is the whole palette rather than four chips.
 */

const WEEK = '2026-W33'

// A brief shaped like the real one: bold clue leads carrying endnote markers,
// which is the exact content that used to make highlight-to-edit fail.
const BODY = [
  '# The model is free. The machine that runs it will cost you everything.',
  '',
  'This week, a16z published production data showing buyers can no longer name the model running their workflows.',
  '',
  '## The clues',
  '',
  '- **The model stopped being the story. Here is what replaced it.** [1] What it tells you: when operators running millions of automated tasks monthly cannot name their underlying model, the model has become a commodity input.',
  '',
  '## Sources',
  '[1] https://example.com/a16z',
].join('\n')

const BRIEF = {
  ok: true,
  brief: {
    id: 'b1',
    week: WEEK,
    title: 'The model is free. The machine that runs it will cost you everything.',
    status: 'in_review',
    sections: {},
    body_md: BODY,
    versions: [{ v: 1, at: new Date().toISOString(), source: 'assemble' }],
    stats: {},
    formats: [],
    assembled_at: new Date().toISOString(),
    approved_at: null,
    pushed_at: null,
  },
}


async function mock(page: Page) {
  // Fixed afternoon + a completed check-in: the pilot gate must never decide
  // these assertions by wall clock (it fires its morning check-in over any
  // route when the container crosses into morning hours).
  await page.clock.setFixedTime(new Date('2026-08-20T18:30:00Z'))
  // Playwright checks route handlers in REVERSE registration order, so the
  // catch-all goes first and the specific ones after it. Registered the other
  // way round, `**/api/**` shadows the brief and the composer renders forever
  // against a null brief, which looks exactly like a broken component.
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await answerPilotGate(page)
  await page.route('**/api/briefs/notes', (r: Route) => r.fulfill({ json: { ok: true, notes: [] } }))
  await page.route(`**/api/briefs/${WEEK}`, (r: Route) => r.fulfill({ json: BRIEF }))
}

async function openBrief(page: Page) {
  await mock(page)
  await page.goto(`/#/content?brief=${WEEK}`)
  await expect(page.getByText(`Weekly brief · ${WEEK}`)).toBeVisible()
}

test('a brief opens in the composer, with the rail', async ({ page }) => {
  await openBrief(page)
  // The rail is the half of CONTENT-ENGINE-V2-SPEC.md:75 that never shipped.
  await expect(page.getByTestId('composer-rail-refine')).toBeVisible()
  await expect(page.getByTestId('composer-rail-history')).toBeVisible()
})

test('the rail tabs carry their labels, not just icons', async ({ page }) => {
  await openBrief(page)
  // OBS-029: labels appeared only on the selected tab, which left Refine as an
  // unlabelled wand. "Tab-style without labels is divination."
  await expect(page.getByTestId('composer-rail-refine')).toContainText('Refine')
  await expect(page.getByTestId('composer-rail-history')).toContainText('History')
})

test('the brief gets the whole palette, not four chips', async ({ page }) => {
  await openBrief(page)
  const chips = page.locator('[data-testid^="edit-chip-"]')
  // 28 at the time of writing. The assertion is deliberately "many more than
  // four" rather than an exact count, so adding a preset does not fail it.
  expect(await chips.count()).toBeGreaterThan(20)
})

test('every humour register is reachable on a brief', async ({ page }) => {
  await openBrief(page)
  // Six registers with a dedicated examples-driven prompt behind them, none of
  // which the brief could reach: its route never imported _humor.ts.
  for (const r of ['witty', 'sarcastic', 'absurd', 'satirical', 'deadpan', 'periodic']) {
    await expect(page.getByTestId(`edit-chip-humor-${r}`)).toBeVisible()
  }
})

test('the analogy and video edits are there', async ({ page }) => {
  await openBrief(page)
  await expect(page.getByTestId('edit-chip-feedback-analogy-add')).toBeVisible()
  await expect(page.getByTestId('edit-chip-feedback-analogy-break')).toBeVisible()
  // 15 seconds to 20 minutes, each with its own structure.
  for (const d of ['15s', '60s', '20min']) {
    await expect(page.getByTestId(`edit-chip-video-${d}`)).toBeVisible()
  }
})

test('a brief is never offered the two edits it cannot answer', async ({ page }) => {
  await openBrief(page)
  // The brief is the master that gets fanned out to Paid and Built at push, so
  // "turn this into a Paid piece" is not a question it can answer, and deep
  // research runs against a content piece.
  await expect(page.getByTestId('edit-chip-feedback-adapt-paid')).toHaveCount(0)
  await expect(page.getByTestId('edit-chip-deepen-paid')).toHaveCount(0)
  await expect(page.getByTestId('edit-chip-channel-substack')).toHaveCount(0)
})

test('the citations toggle keeps working past the first press', async ({ page }) => {
  // The regression this pins: setEditable() emitted a TipTap update, onUpdate
  // re-canonicalized the buffer from the citations-OFF rendering (sources
  // stripped), and the second press had nothing to re-attach. The label kept
  // flipping while the document froze — "works once, then never again".
  await openBrief(page)
  // Scoped to the canvas: the tab behind the overlay and the reading-view
  // banner both contain the word "sources".
  const sources = page.locator('.brief-canvas').getByRole('heading', { name: 'Sources' })
  await expect(sources).toBeVisible()

  await page.getByRole('button', { name: 'Citations on' }).click()
  await expect(sources).toHaveCount(0)

  await page.getByRole('button', { name: 'Citations off' }).click()
  await expect(sources).toBeVisible()

  // And around again, because "toggle" means indefinitely, not twice.
  await page.getByRole('button', { name: 'Citations on' }).click()
  await expect(sources).toHaveCount(0)
  await page.getByRole('button', { name: 'Citations off' }).click()
  await expect(sources).toBeVisible()
})

test('the mobile edit palette is a sheet that actually closes', async ({ browser }) => {
  // The regression this pins: the palette was an inline footer panel whose only
  // dismiss control was the toggle chip, and the chip disabled itself while a
  // revise ran — up to 90 seconds with no way out. It is a real bottom sheet
  // now: close button, backdrop, swipe; the close path is never disabled.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await openBrief(page)

  await page.getByRole('button', { name: 'More edits' }).click()
  await expect(page.getByRole('button', { name: 'Close edit options' })).toBeVisible()
  // The full palette is inside.
  await expect(page.getByTestId('edit-chip-humor-witty')).toBeVisible()

  await page.getByRole('button', { name: 'Close edit options' }).click()
  await expect(page.getByRole('button', { name: 'Close edit options' })).toHaveCount(0)

  // Reopens cleanly.
  await page.getByRole('button', { name: 'More edits' }).click()
  await expect(page.getByRole('button', { name: 'Close edit options' })).toBeVisible()
  await ctx.close()
})
