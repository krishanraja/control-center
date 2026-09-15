import { test, expect, type Page, type Route } from '@playwright/test'
import { answerPilotGate } from './pilot-gate-mock'

/**
 * The Hunt lane on People: the roles Krish said Yes to, the person who gets
 * him in, and the one button that does everything that follows from column
 * A. Nothing on the page can send.
 */

const ROLES = {
  ok: true,
  roles: [
    {
      job_id: 'legora:director-of-corporate-development', company: 'Legora',
      title: 'Director of Corporate Development', url: 'https://jobs.ashbyhq.com/legora/a6',
      score: 9, location: 'London', comp: null, status: 'staging',
      package_status: 'Materials staged - bridge first', package_built_at: '2026-09-03T10:00:00Z',
      cv_url: 'https://docs.google.com/document/d/cv/edit', letter_url: 'https://docs.google.com/document/d/cl/edit',
      rejection_reason: null, why_it_fits: 'x',
      bridge: { bridge_id: 'b1', tier: 'current_employee', evidence: 'Ada Nguyen is VP GTM at Legora now; strength 70', ask: '15 minutes?', state: 'proposed' },
      person: { name: 'Ada Nguyen', title: 'VP GTM', company: 'Legora', linkedin_url: 'https://www.linkedin.com/in/ada' },
      application_state: null, applied_at: null,
    },
    {
      job_id: 'fleek:chief-of-staff', company: 'Fleek', title: 'Chief of Staff', url: 'https://jobs.ashbyhq.com/fleek/1',
      score: 9, location: 'New York', comp: null, status: 'staging', package_status: 'Not started',
      package_built_at: null, cv_url: null, letter_url: null, rejection_reason: null, why_it_fits: 'x',
      bridge: null, person: null,
      application_state: null, applied_at: null,
    },
    // Applied, with a person: hunter mirrors Krish's own column A verdict onto the
    // role, and the lane could previously name the role and the person without
    // saying whether he had already gone in.
    {
      job_id: 'anthropic:head-of-enterprise-sales', company: 'Anthropic',
      title: 'Head of Enterprise Sales', url: 'https://boards.greenhouse.io/anthropic/1',
      score: 9, location: 'New York', comp: null, status: 'staging',
      package_status: 'Materials staged', package_built_at: '2026-09-04T10:00:00Z',
      cv_url: 'https://docs.google.com/document/d/cv2/edit',
      letter_url: 'https://docs.google.com/document/d/cl2/edit',
      rejection_reason: null, why_it_fits: 'x',
      bridge: { bridge_id: 'b2', tier: 'current_employee', evidence: 'x', ask: 'y', state: 'proposed' },
      // No stored LinkedIn URL: the name renders as plain text, never as an invented
      // linkedin.com/in/<contact_key> link, which is the bug that put eight dead
      // links on the Pipeline sheet.
      person: { name: 'Sam Okafor', title: 'RevOps Lead', company: 'Anthropic', linkedin_url: null },
      application_state: 'Applied', applied_at: '2026-09-02T09:00:00Z',
    },
  ],
}

const STATUS = {
  ok: true,
  lastRun: { run_at: '2026-09-07T17:00:00Z', status: 'success', outcome: '13 built', cost_usd: 0, error_message: null },
  alert: null, waitingOnKrish: 0, approvedAwaitingBuild: 1, deadApproved: 0, packagesBuilt: 15,
  nextFireUtc: '2026-09-10T08:27:00Z',
}

async function mock(page: Page) {
  await page.clock.setFixedTime(new Date('2026-09-07T18:30:00Z'))
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await answerPilotGate(page)
  await page.route('**/api/goals/ladder*', (r: Route) => r.fulfill({ json: {
    ok: true, horizons: ['os', 'weekly'], by_horizon: { os: [], weekly: [] }, goals: [],
    stale_count: 0, orphan_count: 0, ventures: ['mindmake'], north_star: '', week_of: 'Sep 6-12',
  } }))
  await page.route('**/api/hunter/roles', (r: Route) => r.fulfill({ json: ROLES }))
  await page.route('**/api/hunter/status', (r: Route) => r.fulfill({ json: STATUS }))
  await page.route('**/api/bridges*', (r: Route) => r.fulfill({ json: { ok: true, bridges: [], stateCounts: {} } }))
  await page.route('**/api/people/freshness', (r: Route) => r.fulfill({ json: {
    ok: true, hunt: { at: '2026-09-07T17:00:00Z', by: 'the hunter run' },
    visibility: { at: null, by: 'you' }, room: { at: null, by: 'x' }, network: { at: null, by: 'you' },
  } }))
}

async function openHunt(page: Page) {
  await mock(page)
  await page.goto('/#/people?lane=network')
  await page.getByTestId('people-lane-bridges').click()
  await expect(page.getByTestId('hunt-roles')).toBeVisible()
}

test('the Hunt lane is in the nav and the Pipeline lane is not', async ({ page }) => {
  await openHunt(page)
  await expect(page.getByTestId('people-lane-bridges')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('people-lane-bridges')).toHaveText(/Hunt/)
  await expect(page.getByTestId('people-lane-pipeline')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Hunt' })).toBeVisible()
  await expect(page.getByTestId('freshness-hunt')).toContainText('Last refreshed')
})

test('every Yes role shows its package and the person, or says nobody yet', async ({ page }) => {
  await openHunt(page)
  const rows = page.getByTestId('hunt-role')
  await expect(rows).toHaveCount(3)
  const legora = rows.filter({ hasText: 'Legora' })
  await expect(legora.getByRole('link', { name: 'CV' })).toHaveAttribute('href', 'https://docs.google.com/document/d/cv/edit')
  await expect(legora.getByRole('link', { name: 'Ada Nguyen' })).toHaveAttribute('href', 'https://www.linkedin.com/in/ada')
  const fleek = rows.filter({ hasText: 'Fleek' })
  await expect(fleek.getByText(/Nobody found yet/)).toBeVisible()
  await expect(fleek.getByText(/builds on the next Process run/)).toBeVisible()
})

test('Process my verdicts is the one primary button, and nothing can send', async ({ page }) => {
  await openHunt(page)
  await expect(page.getByTestId('hunter-process')).toHaveText(/Process my verdicts/)
  let posted: string | null = null
  await page.route('**/api/hunter/run', (r: Route) => {
    if (r.request().method() === 'POST') {
      posted = String(r.request().postDataJSON()?.command)
      return r.fulfill({ json: { ok: true, queued: true, dispatched: true, command: { id: 9, command: 'process', state: 'queued', requested_at: '2026-09-07T18:30:00Z', result: null, error: null } } })
    }
    return r.fulfill({ json: { ok: true, commands: [] } })
  })
  await page.getByTestId('hunter-process').click()
  await expect.poll(() => posted).toBe('process')
  await expect(page.getByRole('button', { name: /^Send$/ })).toHaveCount(0)
})


test('an applied role says so, and one not applied does not', async ({ page }) => {
  await openHunt(page)
  const rows = page.getByTestId('hunt-role')
  const anthropic = rows.filter({ hasText: 'Anthropic' })
  await expect(anthropic.getByTestId('hunt-applied')).toContainText('Applied')
  await expect(anthropic.getByTestId('hunt-applied')).toContainText(/Sep 2|2 Sep/)
  // Reaching out about a role he is already in is a follow-up, not an approach.
  await expect(anthropic.getByTestId('hunt-person')).toContainText('Already in, so follow up with')
  const legora = rows.filter({ hasText: 'Legora' })
  await expect(legora.getByTestId('hunt-applied')).toHaveCount(0)
  await expect(legora.getByTestId('hunt-person')).toContainText('Reach out to')
})

test('a person with no stored profile URL renders as a name, never a made-up link', async ({ page }) => {
  await openHunt(page)
  const anthropic = page.getByTestId('hunt-role').filter({ hasText: 'Anthropic' })
  await expect(anthropic.getByTestId('hunt-person')).toContainText('Sam Okafor')
  await expect(anthropic.getByRole('link', { name: 'Sam Okafor' })).toHaveCount(0)
})

test('the Hunt lane cannot be switched off by a stale environment variable', async ({ page }) => {
  // Production carried VITE_BRIDGES_LANE_ENABLED=false from the 2026-09-06 parking
  // while this code was un-parked on the 7th, so the lane Krish asked for back was
  // invisible on every device for eight days. The flag is gone, not defaulted.
  await mock(page)
  await page.goto('/#/people')
  await expect(page.getByTestId('people-lane-bridges')).toBeVisible()
})

// Krish 2026-09-15: "make sure the Hunt tab actually shows in my control center on
// all devices and is uniform in UX UI to the rest of the tab." PeopleTab renders
// MobileBridges below the narrow breakpoint and DesktopBridges above it, two
// different shells around one BridgesBody, so both need proving.
for (const [label, viewport] of [
  ['phone', { width: 390, height: 844 }],
  ['tablet', { width: 820, height: 1180 }],
  ['desktop', { width: 1440, height: 900 }],
] as const) {
  test(`the Hunt lane renders on ${label}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await mock(page)
    await page.goto('/#/people?lane=bridges')
    await expect(page.getByTestId('people-lane-bridges')).toBeVisible()
    await expect(page.getByTestId('hunt-roles')).toBeVisible()
    await expect(page.getByTestId('hunt-role')).toHaveCount(3)
    // The applied marker and the person line survive both shells.
    await expect(page.getByTestId('hunt-applied')).toHaveCount(1)
    await expect(page.getByTestId('hunt-person')).toHaveCount(3)
    // A phone regression that reads as broken rather than tight.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(overflows).toBe(false)
  })
}

