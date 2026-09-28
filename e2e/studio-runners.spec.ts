import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * The Studio's Windows runners, on the health surfaces Control Center already
 * has: the roster in OS, Systems, and the alert mark when a runner needs a
 * person.
 *
 * Ruling (Krish, 2026-09-28): a second Windows machine is a cold standby with
 * its task disabled. Only the active runner is given work, so this pins that
 * Control Center says which runner is active and which is the standby, when
 * each last heartbeated and whether its Drive is ready; that the alarm shows
 * when the active runner is silent with work waiting; and that the switch
 * reports the engine's refusal in words and changes nothing.
 */

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date())
const PRIMARY = '656ae98c' + '0'.repeat(56)
const STANDBY = 'e4e562cc' + '1'.repeat(56)

const runner = (prefix: string, over: Record<string, unknown> = {}) => ({
  runner_id_prefix: prefix,
  role: 'active',
  last_heartbeat_at: new Date().toISOString(),
  heartbeat_age_seconds: 5,
  fresh: true,
  runner_status: 'idle',
  drive_state: 'ready',
  software_commit: '6bf78628a481a61bf16ea3b4deec0d326281eee6',
  pending_receipts: 0,
  working: false,
  ...over,
})

function health(runners: Record<string, unknown>) {
  return {
    ok: true,
    schema_version: 1,
    commit: 'test',
    ready: true,
    jobs: [],
    runner: { state: 'present', heartbeat_age_hours: 0, status: 'idle' },
    runners: {
      fenced: true,
      active: runner('656ae98c'),
      standby: [runner('e4e562cc', { role: 'standby', heartbeat_age_seconds: 1416, fresh: false })],
      unassigned: [],
      retired_count: 4,
      waiting: { queued_commands: 0, pending_reviews: 0, ready_briefs: 0, expired_brief_leases: 0, total: 0 },
      attention: [],
      ...runners,
    },
  }
}

async function mock(page: Page, runners: Record<string, unknown> = {}) {
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/api/fleet/**', (r: Route) =>
    r.fulfill({ json: { ok: true, lastRunAt: new Date().toISOString(), workflows: [] } }))
  await page.route('**/api/pilot/checkin*', (r: Route) => r.fulfill({
    json: {
      ok: true,
      morning: { id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green', one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false },
      last_evening: null, evening_done_today: true, yesterday: null,
      timezone: 'Australia/Sydney', today,
    },
  }))
  await page.route('**/api/content-engine/health', (r: Route) => r.fulfill({ json: health(runners) }))
}

test('OS, Systems says which runner is active and which is the standby, with heartbeat and Drive', async ({ page }) => {
  await mock(page)
  await page.goto('/#/os?sub=systems')
  const block = page.getByTestId('studio-runners')
  await expect(block).toBeVisible({ timeout: 15_000 })
  const active = block.getByTestId('studio-runner-active')
  await expect(active).toContainText('Active')
  await expect(active).toContainText('656ae98c')
  await expect(active).toContainText('5 seconds ago')
  await expect(active).toContainText('Drive ready')
  const standby = block.getByTestId('studio-runner-standby')
  await expect(standby).toContainText('Standby')
  await expect(standby).toContainText('e4e562cc')
  await expect(standby).toContainText('24 minutes ago')
  await expect(block).toContainText('Only the active runner is given work.')
  // A cold standby with its task off is never offered the active role.
  await expect(page.getByTestId('studio-runner-switch-open')).toHaveCount(0)
  // Nothing is wrong, so there is no alarm.
  await expect(page.getByTestId('critical-alert-mark')).toHaveCount(0)
})

test('the alarm shows when the active runner is silent with work waiting, and the drawer says so', async ({ page }) => {
  const line = 'The active Studio runner 656ae98c has been silent for 48 hours with 1 item waiting.'
  await mock(page, {
    active: runner('656ae98c', { heartbeat_age_seconds: 172_800, fresh: false }),
    waiting: { queued_commands: 1, pending_reviews: 0, ready_briefs: 0, expired_brief_leases: 0, total: 1 },
    attention: [{ code: 'active_runner_silent_with_work_waiting', line }],
  })
  await page.goto('/#/home')
  const mark = page.getByTestId('critical-alert-mark')
  await expect(mark).toBeVisible({ timeout: 15_000 })
  await mark.click()
  const drawer = page.getByTestId('critical-alert-drawer')
  await expect(drawer.getByTestId('engine-runner-attention')).toContainText(line)
  await expect(drawer).toContainText('The runners and the switch are in OS, under Systems.')
})

test('a refused switch says why in words and changes nothing; an accepted one says which runner is active', async ({ page }) => {
  await mock(page, {
    active: runner('656ae98c', { heartbeat_age_seconds: 300, fresh: false }),
    standby: [runner('e4e562cc', { role: 'standby' })],
    attention: [{ code: 'standby_heartbeating_while_active_down', line: 'Standby runner e4e562cc is heartbeating while the active runner is not. It takes no work until the active role is switched to it.' }],
  })
  let answer: { status: number; json: unknown } = { status: 409, json: { ok: false, error: { code: 'active_runner_holds_work' } } }
  const posted: unknown[] = []
  await page.route('**/api/video-studio/session', (r: Route) => r.fulfill({
    json: { ok: true, schema_version: 1, csrf_token: 'v1.9999999999.synthetic', expires_at: new Date(Date.now() + 600_000).toISOString() },
  }))
  await page.route('**/api/video-studio/runner-roles', (r: Route) => {
    if (r.request().method() === 'POST') {
      posted.push(r.request().postDataJSON())
      return r.fulfill({ status: answer.status, json: answer.json })
    }
    return r.fulfill({ json: {
      ok: true, schema_version: 1, fenced: true,
      active: { runner_id_hash: PRIMARY, runner_id_prefix: '656ae98c', role: 'active' },
      standby: [{ runner_id_hash: STANDBY, runner_id_prefix: 'e4e562cc', role: 'standby' }],
      unassigned: [], retired: [], events: [],
    } })
  })

  await page.goto('/#/os?sub=systems')
  await page.getByTestId('studio-runner-switch-open').click({ timeout: 15_000 })
  const confirm = page.getByTestId('studio-runner-switch-confirm')
  await expect(confirm).toBeDisabled()
  await page.getByTestId('studio-runner-switch-reason').fill('Failover: the primary is stopped and disabled.')
  await confirm.click()
  await expect(page.getByTestId('studio-runner-switch-refusal')).toHaveText(
    'Work is still leased to the active runner. It must finish that work before the role can move.')
  expect(posted).toEqual([{
    schema_version: 1,
    action: 'switch_active',
    to_runner_id_hash: STANDBY,
    expected_active_runner_id_hash: PRIMARY,
    reason: 'Failover: the primary is stopped and disabled.',
  }])

  answer = { status: 200, json: { ok: true, schema_version: 1, changed: 'switch_active' } }
  await confirm.click()
  await expect(page.getByText('Runner e4e562cc is now the active runner.')).toBeVisible()
})
