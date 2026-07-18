import { test, expect, type Page } from '@playwright/test'

/**
 * Growth tab E2E — deterministic: every /api/* and Supabase call is mocked.
 * Covers: tab render with lanes, batch send approval POST shape, autonomy
 * promote 422 criteria checklist, profit governor rendering.
 */

const OVERVIEW = {
  ok: true,
  generated_at: new Date().toISOString(),
  lanes: [
    {
      slug: 'mm_ctrl', name: 'CTRL', active: true, autonomy_level: 'L1',
      autonomy_history: [], wired: true,
      funnel_weeks: [
        { lane: 'mm_ctrl', week: '2026-07-13', captures: 12, paid_added: 1, mrr_added: 8, capture_to_paid_pct: 8.3 },
        { lane: 'mm_ctrl', week: '2026-07-06', captures: 9, paid_added: 0, mrr_added: 0, capture_to_paid_pct: 0 },
      ],
      touches: [
        { lane: 'mm_ctrl', frame_version: 'ctrl-v1', touch_number: 1, status: 'sent', count: 18 },
        { lane: 'mm_ctrl', frame_version: 'ctrl-v1', touch_number: 2, status: 'queued', count: 2 },
      ],
      queued_count: 2, sent_count: 18, paid_count: 3, free_count: 21, mrr_usd: 24,
      churn_queue: [], frames: [
        { lane: 'mm_ctrl', frame_version: 'ctrl-v1', sent: 18, leads_touched: 15, paid: 2 },
      ],
      replies_new: 0,
    },
    {
      slug: 'plinth', name: 'Plinth', active: true, autonomy_level: 'L1',
      autonomy_history: [], wired: false, funnel_weeks: [], touches: [],
      queued_count: 0, sent_count: 0, paid_count: 0, free_count: 0, mrr_usd: 0,
      churn_queue: [], frames: [], replies_new: 0,
    },
  ],
  queued_preview: [],
  unassigned_churn: [],
  content_attribution: [],
}

const QUEUED_SENDS = {
  ok: true,
  sends: [
    { id: 'send-1', lead_id: 'lead-1', lane: 'mm_ctrl', frame_version: 'ctrl-v1', touch_number: 2, rendered_subject: 'What a real decision looks like in CTRL', rendered_body: 'Body one', status: 'queued', sample_required: true, queued_at: new Date().toISOString() },
    { id: 'send-2', lead_id: 'lead-2', lane: 'mm_ctrl', frame_version: 'ctrl-v1', touch_number: 2, rendered_subject: 'Second queued subject', rendered_body: 'Body two', status: 'queued', sample_required: true, queued_at: new Date().toISOString() },
  ],
}

const LANE_DETAIL = {
  ok: true,
  lane: 'mm_ctrl',
  stats: {
    autonomy_level: 'L1', approved_30d: 4, rejected_30d: 0, approved_14d: 4,
    rejected_14d: 0, rejection_rate_30d: 0, rejection_rate_14d: 0,
    queued_awaiting: 2, autonomy_history: [],
  },
  economics: {
    agent_cost_mtd: 0.5, api_cost_mtd: 0.25, fixed_cost_monthly: 0,
    ad_spend_monthly: 0, total_cost_mtd: 0.75, attributed_mrr: 24,
    paid_count: 3, new_paid_mtd: 1, contribution_margin_usd: 23.25,
    cac_usd: 0.75, ltv_estimate_usd: 128,
  },
  budget: { daily_usd: 5, monthly_usd: 50 },
  paused: null,
  costs: [],
  paid_global_cap_usd: 500,
  direction_locked: {
    id: 'd1', lane: 'mm_ctrl', version: 1, status: 'locked',
    positioning: 'Signal over noise, decision-first.', icp: 'Leaders drowning in AI news',
    voice: 'Sharp, anti-hype.', messaging_pillars: [{ pillar: 'Corroborated decisions', proof: 'multi-source' }],
    offers: [], never_say: ['revolutionary'], creative_direction: { sender: 'the CTRL team' },
    channel_priorities: ['seo_geo'], notes: null, locked_at: new Date().toISOString(), locked_by: 'krish',
  },
  direction_draft: null,
  direction_history: [],
}

const PROMOTE_422 = {
  ok: false,
  error: 'promotion criteria not met',
  criteria: [
    { key: 'volume', label: '≥ 20 approved sends in 30d', met: false, actual: 4, required: '>= 20', overridable: true },
    { key: 'rejection', label: 'Rejection rate < 5% (30d)', met: true, actual: 0, required: '< 0.05', overridable: true },
  ],
}

async function mockGrowthApis(
  page: Page,
  onSendsPost?: (body: any) => void,
  promoteResponse?: { status: number; body: any },
  onLanePost?: (body: any) => void,
) {
  await page.route('**/api/acquisition/overview*', r => r.fulfill({ json: OVERVIEW }))
  await page.route('**/api/acquisition/replies*', r =>
    r.request().method() === 'GET' ? r.fulfill({ json: { ok: true, replies: [] } }) : r.fulfill({ json: { ok: true } }))
  await page.route('**/api/acquisition/sends*', r => {
    if (r.request().method() === 'GET') return r.fulfill({ json: QUEUED_SENDS })
    const body = r.request().postDataJSON()
    onSendsPost?.(body)
    return r.fulfill({ json: { ok: true, action: body?.action, affected: body?.ids?.length ?? 0, skipped: 0, dispatched: true } })
  })
  await page.route('**/api/acquisition/lanes/**', r => {
    if (r.request().method() === 'GET') return r.fulfill({ json: LANE_DETAIL })
    const body = r.request().postDataJSON()
    onLanePost?.(body)
    if (body?.action === 'promote' && promoteResponse) {
      return r.fulfill({ status: promoteResponse.status, json: promoteResponse.body })
    }
    if (body?.action === 'direction_lock') {
      return r.fulfill({ json: { ok: true, version: 2, stale_sends: 3, cascaded: true } })
    }
    return r.fulfill({ json: { ok: true, version: 2, status: 'draft' } })
  })
  // Anon Supabase traffic (venture registry, zara signals, realtime auth) —
  // return empty sets so panels settle without a live database.
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', r => r.abort())
}

test('growth tab renders lanes, funnel and honest empties', async ({ page }) => {
  await mockGrowthApis(page)
  await page.goto('/#/acquisition')
  await expect(page.getByRole('heading', { name: 'Growth' })).toBeVisible()
  // Lane chips: wired CTRL first, unwired Plinth present
  await expect(page.getByRole('button', { name: /CTRL/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Plinth/ }).first()).toBeVisible()
  // Funnel rows from the mocked view
  await expect(page.getByText('12', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Frame leaderboard')).toBeVisible()
  // Summary line reflects mocked totals
  await expect(page.getByText(/2 sends queued · 18 sent · 3 paid/)).toBeVisible()
})

test('send deck batch-approves with the full id set', async ({ page }) => {
  let posted: any = null
  await mockGrowthApis(page, body => { posted = body })
  await page.goto('/#/acquisition')
  await expect(page.getByText('What a real decision looks like in CTRL')).toBeVisible()
  await page.getByRole('button', { name: 'Approve all 2' }).click()
  await expect.poll(() => posted).not.toBeNull()
  expect(posted.action).toBe('approve')
  expect(posted.ids).toEqual(['send-1', 'send-2'])
})

test('promote shows the mechanical 422 criteria checklist', async ({ page }) => {
  await mockGrowthApis(page, undefined, { status: 422, body: PROMOTE_422 })
  await page.goto('/#/acquisition')
  await page.getByRole('button', { name: 'Promote', exact: true }).click()
  await expect(page.getByText('≥ 20 approved sends in 30d')).toBeVisible()
  await expect(page.getByText('Rejection rate < 5% (30d)')).toBeVisible()
  // Unmet-but-overridable criteria expose the force option
  await expect(page.getByRole('button', { name: 'Force promote' })).toBeVisible()
})

test('profit governor renders margin, cost stack and burn bar', async ({ page }) => {
  await mockGrowthApis(page)
  await page.goto('/#/acquisition')
  await expect(page.getByText('Profit governor')).toBeVisible()
  await expect(page.getByText('+$23.25/mo')).toBeVisible()
  await expect(page.getByText('Attributed MRR')).toBeVisible()
  await expect(page.getByText('Monthly budget burn')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause lane' })).toBeVisible()
})

test('direction studio shows the locked direction and locks a new version', async ({ page }) => {
  let lanePost: any = null
  await mockGrowthApis(page, undefined, undefined, body => { lanePost = body })
  await page.goto('/#/acquisition')
  // Locked direction is visible with its version badge and positioning
  await expect(page.getByText('Direction studio')).toBeVisible()
  await expect(page.getByText('v1 locked')).toBeVisible()
  await expect(page.getByText('Signal over noise, decision-first.')).toBeVisible()
  // Edit -> lock round-trip posts direction_lock
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: /Lock this/ }).click()
  await expect.poll(() => lanePost).not.toBeNull()
  expect(lanePost.action).toBe('direction_lock')
})
