import { test, expect, type Page, type Route } from '@playwright/test'
import { answerPilotGate } from './pilot-gate-mock'

/**
 * The fact gate where Krish approves (content-engine api/_factGate.ts).
 *
 * The engine refuses to move a piece in one of the three sections forward
 * until every fact in its exact text is checked twice. Until this strip only
 * an agent could run the check, so the refusal named a step with no button.
 * These pin the button, the plain-words list of what to fix, and a pass.
 */

const IDEA_ID = '22222222-2222-4222-8222-222222222222'
const IDEA = {
  id: IDEA_ID,
  idea: 'Who picks your AI',
  thesis: 'A switcher picks the brain now.',
  body: 'On 22 September 2026 both big AI companies launched cheaper brains.',
  distribution: [],
  source_type: 'manual',
  state: 'review',
  lane: 'publication',
  lane_slot: 'mind_the_gap',
  transformed_outputs: {},
  meta: {},
  created_at: '2026-09-25T11:00:00.000Z',
  updated_at: '2026-09-25T12:00:00.000Z',
}
const FAILING = {
  ran_at: '2026-09-25T21:40:00.000Z', passed: false, blocking: 1,
  claims: [
    { sentence: 'OpenAI said so on 3 October 2025.', claim: 'x', verdict: 'verified' },
    { sentence: 'Anthropic said Opus 5.5 costs 40% less.', claim: 'y', verdict: 'contradicted', independent: { correct_value: 'about 40% less for work billed by token', url: 'https://www.anthropic.com/claude/opus' } },
  ],
}

async function open(page: Page, gate: { ok: boolean; reason: string | null }, factCheck: unknown, onPost?: () => void) {
  await page.clock.setFixedTime(new Date('2026-09-25T18:30:00Z'))
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await answerPilotGate(page)
  await page.route(/\/rest\/v1\/content_ideas(?:\?|$)/, (r: Route) => r.fulfill({ json: [IDEA] }))
  let state = { gate, factCheck }
  await page.route(`**/api/content-ideas/${IDEA_ID}/fact-check`, async (r: Route) => {
    if (r.request().method() === 'POST') {
      onPost?.()
      state = { gate: { ok: false, reason: '1 claim failed the fact check. Fix or cut it, then run it again.' }, factCheck: FAILING }
      return r.fulfill({ json: { ok: true, passed: false, blocking: 1 } })
    }
    return r.fulfill({ json: { ok: true, gate: state.gate, fact_check: state.factCheck } })
  })
  await page.goto(`/#/content?idea=${IDEA_ID}`)
  await expect(page.getByText(IDEA.idea, { exact: true }).last()).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('composer-rail-cuts').click()
}

test('an unchecked piece offers the check, and lists what to fix in plain words', async ({ page }) => {
  let posts = 0
  await open(page, { ok: false, reason: 'The facts in this piece have not been checked yet. Run the fact check first.' }, null, () => { posts++ })
  const strip = page.getByTestId('fact-check-strip')
  await expect(strip.getByTestId('fact-check-status')).toHaveText('Not checked')
  await expect(strip.getByText('have not been checked yet')).toBeVisible()
  await strip.getByRole('button', { name: 'Check the facts' }).click()
  await expect(strip.getByTestId('fact-check-status')).toHaveText('1 to fix')
  await expect(strip.getByText('"Anthropic said Opus 5.5 costs 40% less."')).toBeVisible()
  await expect(strip.getByText('The sources say otherwise: about 40% less for work billed by token')).toBeVisible()
  await expect(strip.getByText('"OpenAI said so on 3 October 2025."')).toHaveCount(0)
  expect(posts).toBe(1)
})

test('a passed check says so, and offers nothing to press', async ({ page }) => {
  await open(page, { ok: true, reason: null }, { ...FAILING, passed: true, blocking: 0, claims: [FAILING.claims[0]] })
  const strip = page.getByTestId('fact-check-strip')
  await expect(strip.getByTestId('fact-check-status')).toHaveText('Passed')
  await expect(strip.getByText('The one fact in this exact version passed.')).toBeVisible()
  await expect(strip.getByRole('button', { name: 'Check the facts' })).toHaveCount(0)
})
