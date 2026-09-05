import { test, expect, type Page, type Route } from '@playwright/test'
import { answerPilotGate } from './pilot-gate-mock'

/**
 * The Room lane on People (job 1 of the one swing).
 *
 * Three things are pinned, in Krish's terms: the lane control switches to
 * the Room, a target with no cited trigger says so on its face rather than
 * showing invented news, and every card carries exactly one primary action
 * so the next step is never a choice between two buttons.
 */

const CONTACT = (id: string, name: string, title: string, company: string) => ({
  id, full_name: name, first_name: name.split(' ')[0], email: null, company, title, linkedin_url: null,
})

const now = new Date().toISOString()

const base = {
  sent_at: null, replied_at: null, call_booked_at: null, call_taken_at: null,
  room_booked_at: null, room_paid_at: null, not_now_at: null, cash_gbp: null,
  sourced_by: 'os', notes: null, listed_at: now, created_at: now, updated_at: now,
}

const ROOM = {
  ok: true,
  targets: [
    {
      ...base,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      contact_id: 'c1',
      why_face: 'Runs a PE backed adtech business and has not said out loud what the next two quarters do to it.',
      trigger_signal: null, trigger_source_url: null, trigger_found_at: null,
      draft_subject: null, draft_body: null, draft_url: null, drafted_at: null,
      state: 'listed',
      contact: CONTACT('c1', 'Alex Morgan', 'CEO', 'Northline Media'),
    },
    {
      ...base,
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      contact_id: 'c2',
      why_face: 'Chief data officer at a broadcaster mid restructure.',
      trigger_signal: 'In August the company cut a fifth of its data team and said AI would cover the gap.',
      trigger_source_url: 'https://example.com/news',
      trigger_found_at: now,
      draft_subject: 'A quiet word before the next quarter',
      draft_body: 'Sam, saw the news about the team. Worth twenty minutes? Krish',
      draft_url: 'https://mail.google.com/mail/u/0/#drafts/abc',
      drafted_at: now,
      state: 'drafted',
      contact: CONTACT('c2', 'Sam Patel', 'Chief Data Officer', 'Eastcast'),
    },
  ],
  stateCounts: { listed: 1, drafted: 1 },
}

async function mock(page: Page) {
  await page.clock.setFixedTime(new Date('2026-09-07T18:30:00Z'))
  // Catch-alls first: Playwright checks route handlers in reverse
  // registration order, so the specific mocks below win.
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await answerPilotGate(page)
  await page.route('**/api/goals/ladder*', (r: Route) => r.fulfill({ json: {
    ok: true, horizons: ['os', 'weekly'], by_horizon: { os: [], weekly: [] }, goals: [],
    stale_count: 0, orphan_count: 0, ventures: ['mindmake'], north_star: '', week_of: 'Sep 6-12',
  } }))
  await page.route('**/api/room', (r: Route) => r.fulfill({ json: ROOM }))
  await page.route('**/api/room?*', (r: Route) => r.fulfill({ json: ROOM }))
}

async function openRoom(page: Page) {
  await mock(page)
  await page.goto('/#/people?lane=pipeline')
  await page.getByTestId('people-lane-room').click()
  await expect(page.getByTestId('room-counts')).toBeVisible()
}

test('the people-lane-room control switches to the Room', async ({ page }) => {
  await openRoom(page)
  await expect(page.getByTestId('people-lane-room')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: 'The Room' })).toBeVisible()
  await expect(page.getByTestId('room-counts')).toContainText('1 listed, 1 drafted')
})

test('a target with no cited trigger says so, and never shows news', async ({ page }) => {
  await openRoom(page)
  const cards = page.getByTestId('room-card')
  await expect(cards).toHaveCount(2)
  const listed = cards.filter({ hasText: 'Alex Morgan' })
  await expect(listed.getByText('No live trigger found')).toBeVisible()
  await expect(listed.getByText('Why now:')).toHaveCount(0)
  // The cited one carries its source link.
  const drafted = cards.filter({ hasText: 'Sam Patel' })
  await expect(drafted.getByText(/Why now:/)).toBeVisible()
  await expect(drafted.getByRole('link', { name: 'source' })).toHaveAttribute('href', 'https://example.com/news')
})

test('every card has exactly one primary action', async ({ page }) => {
  await openRoom(page)
  const cards = page.getByTestId('room-card')
  const n = await cards.count()
  expect(n).toBeGreaterThan(0)
  for (let i = 0; i < n; i++) {
    await expect(cards.nth(i).getByTestId('room-primary')).toHaveCount(1)
  }
  await expect(cards.filter({ hasText: 'Alex Morgan' }).getByTestId('room-primary')).toHaveText(/Draft it/)
  await expect(cards.filter({ hasText: 'Sam Patel' }).getByTestId('room-primary')).toHaveText(/I sent it/)
  // And nothing on the page can send: the draft opens in Gmail, where Krish presses send.
  await expect(page.getByRole('link', { name: 'Open in Gmail' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Send$/ })).toHaveCount(0)
})
