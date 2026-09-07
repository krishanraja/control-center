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
    },
    {
      job_id: 'fleek:chief-of-staff', company: 'Fleek', title: 'Chief of Staff', url: 'https://jobs.ashbyhq.com/fleek/1',
      score: 9, location: 'New York', comp: null, status: 'staging', package_status: 'Not started',
      package_built_at: null, cv_url: null, letter_url: null, rejection_reason: null, why_it_fits: 'x',
      bridge: null, person: null,
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
  await expect(rows).toHaveCount(2)
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
