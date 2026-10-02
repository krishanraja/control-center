import { test, expect, type Page } from '@playwright/test'
import { mockAudit, auditTables } from './fixtures/audit'

/**
 * The piece composer, on the phone.
 *
 * Krish, 2026-10-02, with a screenshot of an approved piece: "some buttons
 * just fall off the mobile screen." The composer's tool row (Cleo, Outputs,
 * Materials, Research, Edit, and the voice check) was one line of pills that
 * ran about 250px past the right edge of a 390px screen, in every state. No
 * phone spec ever opened the composer, so nothing caught it.
 *
 * The rule pinned here is the plain one: on a phone, no control in the
 * composer leaves the screen.
 */

const IDEA_ID = '6cb0d213-1aa6-44d3-8dc2-0b91d8dde4df'
const BODY = [
  'Two shops looked at the same shopping robot in the same week and gave opposite answers.',
  '',
  '## WHO GETS PAID',
  '',
  'Amazon earns when you look. Shopify earns when you buy.',
  '',
  '## OUR PREDICTION',
  '',
  'By 30 June 2027, Amazon opens an authorised route for shopping agents.',
  '',
  'How sure we are: 70%.',
].join('\n')
const PIECE = {
  id: IDEA_ID, idea: 'Same agent, opposite answers', thesis: 'Amazon blocked Muse; Shopify let it in.', body: BODY,
  distribution: [], source_type: 'manual', lane: 'publication', lane_slot: 'follow_the_money',
  transformed_outputs: {}, meta: {}, created_at: '2026-09-24T11:00:00.000Z', updated_at: '2026-10-02T10:58:47.000Z',
}
const APPROVED = {
  state: 'approved',
  meta: { production_approval: { schema_version: 1, approved_by: 'Krish', approved_at: '2026-10-02T10:58:47.000Z', content_revision_hash: 'a'.repeat(64) } },
}

async function open(page: Page, over: Record<string, unknown>) {
  const tables = auditTables() as Record<string, unknown[]>
  tables.content_ideas = [{ ...PIECE, ...over }]
  await mockAudit(page, tables as never)
  await page.goto(`/#/content?idea=${IDEA_ID}`)
  await expect(page.getByTestId('composer-tools')).toBeVisible({ timeout: 20_000 })
}

/** Every visible control, by label, whose box is not wholly on the screen. */
async function offScreen(page: Page, scope = 'body') {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel) || document.body
    const bad: string[] = []
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('button, a[href], [role="button"], input, textarea'))) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.left < -1 || r.right > innerWidth + 1) {
        bad.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 32)} at ${Math.round(r.left)}..${Math.round(r.right)} of ${innerWidth}`)
      }
    }
    return bad
  }, scope)
}

for (const [name, over] of [['drafting', { state: 'drafting' }], ['review', { state: 'review' }], ['approved', APPROVED]] as const) {
  test(`a ${name} piece keeps every composer control on the screen`, async ({ page }) => {
    await open(page, over)
    expect(await offScreen(page)).toEqual([])
    // Each tool is a real touch target, not a sliver.
    for (const box of await page.getByTestId('composer-tools').locator('button').evaluateAll(els => els.map(e => e.getBoundingClientRect().height))) {
      expect(box).toBeGreaterThanOrEqual(44)
    }
  })
}

test('the header names the subchannel, never its database slug', async ({ page }) => {
  await open(page, APPROVED)
  await expect(page.getByText(/follow\.the\.money/).first()).toBeVisible()
  await expect(page.getByText(/follow_the_money/)).toHaveCount(0)
})

test("Cleo's suggestions wrap on the phone instead of running off the edge", async ({ page }) => {
  await open(page, APPROVED)
  await page.getByTestId('composer-tools').getByRole('button', { name: 'Cleo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'What am I missing?' })).toBeVisible()
  expect(await offScreen(page)).toEqual([])
})
