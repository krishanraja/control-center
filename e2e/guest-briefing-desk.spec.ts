import { test, expect, type Page, type Route } from '@playwright/test'
import { answerPilotGate } from './pilot-gate-mock'

/**
 * The speaker briefing, read in Control Center.
 *
 * Ruling (Krish, 2026-10-05): agents report to Control Center and never write
 * a Google Doc into his Drive. The briefing moved from a Doc the card linked
 * out to, into `guests.briefing_md`, opened in a panel beside the guest.
 *
 * These pin the three states that decide whether the capability survived the
 * move: a briefing written here opens and renders its sections; a guest
 * briefed before the move still reaches its old Doc and is labelled as such;
 * and a guest with no briefing is offered one. Without the second, the
 * migration would quietly strip the history off every guest briefed before
 * today, which is the exact failure this whole change is meant to avoid.
 */

const BRIEFING = [
  '## Who they are',
  'Runs a show with a standing audience, now building in AI tooling.',
  '',
  '## Angles, best first',
  '1. **The creator economy was never an economy** and why that earns the seat.',
  '2. **Live video is a distribution tax** and what the listener takes away.',
  '',
  '## Avoid',
  'Nothing in the record.',
].join('\n')

const BASE = {
  podcast_target: 'signal_noise',
  one_liner: 'Host and founder.',
  why_fit: 'Mid pivot into AI tooling.',
  fit_score: 80,
  triage_score: 80,
  triage_reason: null,
  quality_score: null,
  attainability_score: null,
  notes: null,
  raw_data: null,
  source: 'manual',
  email: null,
  linkedin_url: null,
  twitter_handle: null,
  personal_url: null,
  format: null,
  briefing_requested_at: null,
  briefing_generated_at: '2026-10-05T08:00:00.000Z',
  scheduled_at: null,
  recorded_at: null,
  published_at: null,
  cascade_fired_at: null,
  origin: 'user',
  buried_at: null,
  created_at: '2026-10-01T09:00:00.000Z',
  updated_at: '2026-10-05T08:00:00.000Z',
}

const GUESTS = [
  {
    ...BASE,
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Written Here',
    status: 'enriched',
    briefing_status: 'ready',
    briefing_md: BRIEFING,
    briefing_doc_url: null,
  },
  {
    ...BASE,
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Briefed Before The Move',
    status: 'enriched',
    briefing_status: 'ready',
    briefing_md: null,
    briefing_doc_url: 'https://docs.google.com/document/d/old-one/edit',
  },
  {
    ...BASE,
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Never Briefed',
    status: 'enriched',
    briefing_status: 'none',
    briefing_md: null,
    briefing_doc_url: null,
  },
]

async function open(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-05T09:00:00Z'))
  // Catch-alls first: Playwright matches routes in reverse registration order.
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  // The morning check-in mounts ahead of every tab, so a spec that skips it
  // asserts against a page that never reached the surface under test.
  await answerPilotGate(page)
  await page.route(/\/rest\/v1\/guests(?:\?|$)/, (r: Route) => r.fulfill({ json: GUESTS }))
  await page.goto('/#/people?lane=visibility')
  await page.waitForFunction(() => (document.getElementById('root')?.innerText || '').length > 50)
}

test('a briefing written here opens in Control Center, with its sections', async ({ page }) => {
  await open(page)
  const card = page.locator('article').filter({ hasText: 'Written Here' }).first()
  await card.getByRole('button', { name: 'View briefing' }).click()

  const panel = page.getByRole('dialog')
  await expect(panel).toBeVisible()
  // The headings survive the render, so the reader gets the shape the prompt
  // asked for rather than one wall of text.
  await expect(panel.getByText('Who they are')).toBeVisible()
  await expect(panel.getByText('Angles, best first')).toBeVisible()
  await expect(panel.getByText(/never an economy/)).toBeVisible()
  // Nothing leaks the raw markup.
  await expect(panel).not.toContainText('##')
  await expect(panel).not.toContainText('**')
  if (process.env.BRIEFING_SHOT) await page.screenshot({ path: process.env.BRIEFING_SHOT })
})

test('a guest briefed before the move keeps its Doc, and says so', async ({ page }) => {
  await open(page)
  const card = page.locator('article').filter({ hasText: 'Briefed Before The Move' }).first()
  const link = card.getByRole('link', { name: /View briefing \(old Doc\)/ })
  await expect(link).toHaveAttribute('href', 'https://docs.google.com/document/d/old-one/edit')
})

test('a guest with no briefing is offered one', async ({ page }) => {
  await open(page)
  const card = page.locator('article').filter({ hasText: 'Never Briefed' }).first()
  await expect(card.getByRole('button', { name: 'Generate briefing' })).toBeVisible()
})
