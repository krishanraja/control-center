import { test, expect, type Route } from '@playwright/test'

/**
 * The runner roster on the phone's Systems tab, the same block as the desk's
 * (e2e/studio-runners.spec.ts covers the alarm and the switch). Ruling (Krish,
 * 2026-09-28): a second Windows machine is a cold standby with its task
 * disabled, and which runner is active has to be readable from the phone.
 */

const runner = (prefix: string, over: Record<string, unknown> = {}) => ({
  runner_id_prefix: prefix, role: 'active', last_heartbeat_at: new Date().toISOString(),
  heartbeat_age_seconds: 5, fresh: true, runner_status: 'idle', drive_state: 'ready',
  software_commit: '6bf78628a481a61bf16ea3b4deec0d326281eee6', pending_receipts: 0, working: false, ...over,
})

test('the phone shows the active runner and the standby with heartbeat and Drive', async ({ page }) => {
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/api/content-engine/health', (r: Route) => r.fulfill({ json: {
    ok: true, schema_version: 1, commit: 'test', ready: true, jobs: [],
    runner: { state: 'present', heartbeat_age_hours: 0, status: 'idle' },
    runners: {
      fenced: true,
      active: runner('656ae98c'),
      standby: [runner('e4e562cc', { role: 'standby', heartbeat_age_seconds: 1416, fresh: false })],
      unassigned: [], retired_count: 4,
      waiting: { queued_commands: 0, pending_reviews: 0, ready_briefs: 0, expired_brief_leases: 0, total: 0 },
      attention: [],
    },
  } }))
  await page.goto('/#/os?sub=systems')
  const block = page.getByTestId('studio-runners')
  await expect(block).toBeVisible({ timeout: 15_000 })
  await expect(block.getByTestId('studio-runner-active')).toContainText('656ae98c')
  await expect(block.getByTestId('studio-runner-active')).toContainText('Drive ready')
  await expect(block.getByTestId('studio-runner-standby')).toContainText('e4e562cc')
  await expect(block.getByTestId('studio-runner-standby')).toContainText('24 minutes ago')
  // Nothing sits off the side of a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
