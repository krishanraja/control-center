import type { Page, Route } from '@playwright/test'
import { answerPilotGate } from '../pilot-gate-mock'

/**
 * The Advisory lane's deals, and the routes that serve them.
 *
 * Lifted out of e2e/pilots-noscroll.spec.ts so the desk spec measures the same
 * deals the phone spec does. A second copy would have drifted, and the point of
 * the desk spec is that the lane was never rendered above 390px at all.
 */

const now = new Date().toISOString()
const recent = new Date(Date.now() - 6 * 86_400_000).toISOString()

const CONTACT = (id: string, name: string, title: string, company: string) => ({
  id, full_name: name, first_name: name.split(' ')[0], email: `${id}@example.com`, company, title,
  linkedin_url: `https://www.linkedin.com/in/${id}`,
})

const base = {
  sent_at: null, replied_at: null, call_booked_at: null, call_taken_at: null,
  pilot_booked_at: null, pilot_paid_at: null, not_now_at: null, cash_gbp: null,
  sourced_by: 'os', notes: null, listed_at: now, created_at: now, updated_at: now,
  ask_kind: null, ask_line: null,
  intent_score: null, intent_stance: null, intent_evidence: null, intent_evidence_url: null,
  intent_topics: null, last_post_at: null, followers: null, is_influencer: null,
  is_creator: null, completeness: null,
}

/** A listed deal whose only "why now" is the stored intent quote, which is
 *  the case that used to read "No live trigger found". */
export const LISTED = {
  ...base,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  contact_id: 'c1',
  why_face: 'Runs a PE backed adtech business and has not said out loud what the next two quarters do to it.',
  trigger_signal: null, trigger_source_url: null, trigger_found_at: null,
  draft_subject: null, draft_body: null, draft_url: null, drafted_at: null,
  state: 'listed',
  ask_kind: 'intro',
  ask_line: 'Ask Alex who else should see this.',
  intent_score: 72,
  intent_stance: 'struggling',
  intent_evidence: 'We have three AI pilots running and no honest read on which of them is actually working.',
  intent_evidence_url: 'https://www.linkedin.com/posts/alex-morgan-abc',
  last_post_at: recent,
  followers: 12400,
  is_influencer: true,
  completeness: 88,
  contact: CONTACT('c1', 'Alex Morgan', 'CEO', 'Northline Media'),
}

/** The tallest card the lane can render. */
export const DRAFTED = {
  ...base,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  contact_id: 'c2',
  why_face: 'Chief data officer at a broadcaster mid restructure, with the budget and the problem in the same place.',
  trigger_signal: 'In August the company cut a fifth of its data team and said AI would cover the gap.',
  trigger_source_url: 'https://example.com/news',
  trigger_found_at: now,
  draft_subject: 'A quiet word before the next quarter',
  draft_body: 'Sam, saw the news about the team.\n\nI have been running a short private review for a few leaders I know well, on where they actually stand and what is coming.\n\nWorth twenty minutes?\n\nKrish',
  draft_url: 'https://mail.google.com/mail/u/0/#drafts/abc',
  drafted_at: now,
  state: 'drafted',
  ask_kind: 'buyer',
  ask_line: 'Ask Sam for twenty minutes this month.',
  contact: CONTACT('c2', 'Sam Patel', 'Chief Data Officer', 'Eastcast'),
}

export type PilotState = 'empty' | 'one' | 'full'

export async function mockPilots(page: Page, state: PilotState) {
  await page.clock.setFixedTime(new Date('2026-09-16T18:30:00Z'))
  // Catch-alls FIRST: Playwright checks route handlers in reverse
  // registration order, so the specific mocks below win (AGENTS.md).
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await answerPilotGate(page)
  await page.route('**/api/goals/ladder*', (r: Route) => r.fulfill({ json: {
    ok: true, horizons: ['os', 'weekly'], by_horizon: { os: [], weekly: [] }, goals: [],
    stale_count: 0, orphan_count: 0, ventures: ['mindmake'], north_star: '', week_of: 'Sep 13-19',
  } }))

  const targets = state === 'empty' ? [] : state === 'one' ? [DRAFTED] : [LISTED, DRAFTED]
  const stateCounts = state === 'empty' ? {}
    : state === 'one' ? { drafted: 1 }
      : { listed: 1, drafted: 1, sent: 3, not_now: 2 }
  const body = { ok: true, targets, stateCounts }

  // The empty lane auto-seeds once, so the seed must answer or the lane sits
  // in a spinner and the frame is measured mid-skeleton.
  await page.route('**/api/pilot-deals/seed', (r: Route) =>
    r.fulfill({ json: { ok: true, proposals: [], degraded: [], held_back: 0, inserted: 0 } }))
  await page.route('**/api/pilot-deals', (r: Route) => r.fulfill({ json: body }))
  await page.route('**/api/pilot-deals?*', (r: Route) => r.fulfill({ json: body }))
}

