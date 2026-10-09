import { test, expect } from '@playwright/test'
import { mockAudit, auditTables } from './fixtures/audit'
import { assertRendered } from './fixtures/layout'

/**
 * Every tab Growth's standard was carried to leads with one move
 * (src/lib/surfaceMoves.ts, rendered through shared/DoThisNextHero), and the
 * evidence for it opens only when asked, in place, under the instruction.
 *
 * The rules themselves (which move wins) are pinned without a browser in
 * tests/api/surfaceMoves.test.ts. This file proves each surface actually
 * renders its move against populated data, and that the move is the thing at
 * the top: above the board it was decided from, not beneath it.
 */

const RULING = {
  kind: 'task', id: 'task-0', title: 'Decide whether to run the Sifted play this week',
  description: 'Nova has the evidence for both angles. What is missing is which one leads.',
  agent: 'nova', status: 'waiting', priority: 'normal',
  sort_at: new Date(Date.now() - 86_400_000).toISOString(),
  url: null, source_table: 'tasks', meta: {}, route_target: null,
}

async function open(page: import('@playwright/test').Page, hash: string, extra: Record<string, unknown[]> = {}) {
  await mockAudit(page, { ...auditTables(), ...extra })
  await page.route('**/api/network/review*', r => r.fulfill({ json: { ok: true, counts: { contact_merge: 3, contact_link: 2 }, items: [] } }))
  await page.goto(`/${hash}`)
}

const CASES: Array<{ name: string; hash: string; move: string; board: string; text: RegExp }> = [
  { name: 'Subscriptions', hash: '#/customers', move: 'subscriptions-move', board: 'subscriptions-stage', text: /Stripe/ },
  { name: 'People · Network', hash: '#/people?lane=network', move: 'network-move', board: 'network-scroll', text: /Tell the network who is who/ },
  { name: 'People · Hunt', hash: '#/people?lane=bridges', move: 'hunt-move', board: 'hunt-scroll', text: /hunt/i },
  { name: 'People · Advisory', hash: '#/people?lane=pilots', move: 'pilots-move', board: 'pilots-scroll', text: /pilot|five/i },
  { name: 'OS · Flows', hash: '#/os?sub=flows', move: 'flows-move', board: 'flows-scroll', text: /failed on its last run/ },
  { name: 'OS · Systems', hash: '#/os?sub=systems', move: 'systems-move', board: 'systems-scroll', text: /need a look/ },
]

for (const c of CASES) {
  test(`${c.name} leads with one move, above its board`, async ({ page }) => {
    await open(page, c.hash)
    const move = page.getByTestId(c.move)
    await expect(move).toBeVisible({ timeout: 15_000 })
    await assertRendered(page, 'main')
    await expect(move).toContainText(c.text)
    await expect(page.locator('[aria-label="Do this next"]')).toHaveCount(1)
    const m = await move.boundingBox()
    const b = await page.getByTestId(c.board).boundingBox()
    expect(m && b && m.y < b.y, `${c.move} sits above ${c.board}`).toBe(true)
  })
}

test('OS · Org leads with the ruling an agent is waiting on, answered in place', async ({ page }) => {
  await open(page, '#/os?sub=org', { decisions_waiting: [RULING] })
  const move = page.getByTestId('org-move')
  await expect(move).toContainText('Decide whether to run the Sifted play this week', { timeout: 15_000 })
  await expect(move).toContainText('Nova is waiting on you.')
  await expect(move.getByRole('button', { name: 'Approve' })).toBeVisible()
  // The roster says what each agent is doing, not only who it is.
  await expect(page.getByTestId('org-left')).toContainText('of its last')
})

test('the evidence opens only when asked, in place, and closes again', async ({ page }) => {
  await open(page, '#/os?sub=org', { decisions_waiting: [RULING] })
  const why = page.getByTestId('org-move-why')
  await expect(why).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('org-move-why-body')).toHaveCount(0)
  await why.click()
  await expect(page.getByTestId('org-move-why-body')).toContainText('What is missing is which one leads.')
  await expect(why).toHaveAttribute('aria-expanded', 'true')
  await why.click()
  await expect(page.getByTestId('org-move-why-body')).toHaveCount(0)
})

test('OS · Intel opens on the question that needs him, not always the last one', async ({ page }) => {
  // No spend read in the audit fixture, so nothing is red: the pane falls back
  // to "What should I decide?", the rail's last row. The urgency path is the
  // branch above it in BusinessIntelTab and is exercised by the token tones.
  await open(page, '#/os?sub=intel')
  await expect(page.getByTestId('bi-pane')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('bi-pane')).toContainText('What should I decide?')
  // A zero said in words, not as a mono figure.
  await expect(page.getByTestId('bi-pane')).toContainText('No live bets')
})

test('OS · Org leads with a rung change the weekly review proposed, approved or rejected in place', async ({ page }) => {
  await mockAudit(page, { ...auditTables(), decisions_waiting: [] })
  await page.route('**/api/network/review*', r => r.fulfill({ json: { ok: true, counts: { contact_merge: 3, contact_link: 2 }, items: [] } }))
  await page.route('**/api/autonomy/promotions', r => r.fulfill({ json: { ok: true, pending: [
    { id: '11111111-2222-4333-8444-555555555555', surface: 'strategist_ask', label: 'the ask', from: 'propose', to: 'assist',
      reason: '23 of 29 ruled asks taken as proposed up to 2026-10-05, at or above 60%.', created_at: '2026-10-05T15:50:00Z' },
  ] } }))
  const verdicts: unknown[] = []
  await page.route('**/api/suggestions/verdict', r => { verdicts.push(r.request().postDataJSON()); r.fulfill({ json: { ok: true, id: 'v1', round: 1, applied: true } }) })
  await page.goto('/#/os?sub=org')
  const move = page.getByTestId('org-move')
  await expect(move).toContainText('Let the OS prepare the ask before you see it?', { timeout: 15_000 })
  await expect(move).toContainText('23 of 29 ruled asks')
  await expect(page.getByTestId('org-promotion-reject')).toBeVisible()
  await page.getByTestId('org-promotion-approve').click()
  await expect.poll(() => verdicts.length).toBe(1)
  expect(verdicts[0]).toEqual({ suggestion_id: '11111111-2222-4333-8444-555555555555', verdict: 'accepted' })
  // Ruled, it leaves the hero; the next move is the roster's.
  await expect(page.getByTestId('org-promotion-approve')).toHaveCount(0)
})
