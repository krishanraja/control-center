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

async function open(page: Page, gate: { ok: boolean; reason: string | null }, factCheck: unknown, onPost?: () => void, extra: Record<string, unknown> = {}) {
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
    return r.fulfill({ json: { ok: true, gate: state.gate, fact_check: state.factCheck, ...extra } })
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

// The rest of Krish's rulings that a machine can check (content-engine
// api/_publishChecks.ts). The engine refuses approval until the blocking ones
// pass, so the strip says which are left, in his words, before he presses
// Approve. The checks below are the engine's real output for piece 2's text.
test('the checklist says what is left before approval, and a warning does not hold it up', async ({ page }) => {
  const checks = [
    { id: 'FACTS', name: 'Every fact checked twice', blocking: true, ok: true, detail: 'This exact version passed the fact check.' },
    { id: 'R2', name: 'No "Not X, Y"', blocking: true, ok: true, detail: 'None found.' },
    { id: 'NO_EM_DASH', name: 'No em dashes', blocking: true, ok: true, detail: 'None found.' },
    { id: 'NO_EXCLAMATION', name: 'No exclamation marks', blocking: true, ok: true, detail: 'None found.' },
    { id: 'R7', name: 'Reading age 12', blocking: false, ok: false, detail: 'Reads at about age 12.5, a little above 12. Shorten the longest sentences.' },
    { id: 'CALL', name: 'A dated prediction with a confidence', blocking: true, ok: false, detail: 'The prediction has no confidence yet. Krish sets how sure we are, as a percentage.' },
    { id: 'R6', name: 'Plain words', blocking: false, ok: false, detail: 'Make sure each is explained where it first appears: model routing, token, prompt, API.' },
  ]
  await open(page, { ok: true, reason: null }, { ...FAILING, passed: true, blocking: 0, claims: [FAILING.claims[0]] }, undefined, { checks, ready: false })
  const strip = page.getByTestId('fact-check-strip')
  const list = strip.getByRole('list', { name: 'House rules checklist' })
  await expect(strip.getByTestId('house-rules-status')).toHaveText('1 to go')
  await expect(list.getByRole('listitem')).toHaveCount(7)
  await expect(list.getByText('Krish sets how sure we are, as a percentage.')).toBeVisible()
  await expect(list.getByText('a little above 12')).toBeVisible()
})

test('a piece that keeps every rule says it is ready', async ({ page }) => {
  const checks = [{ id: 'CALL', name: 'A dated prediction with a confidence', blocking: true, ok: true, detail: 'Has a date to check by and a confidence.' }]
  await open(page, { ok: true, reason: null }, { ...FAILING, passed: true, blocking: 0, claims: [FAILING.claims[0]] }, undefined, { checks, ready: true })
  await expect(page.getByTestId('house-rules-status')).toHaveText('Ready')
})
