import { test, expect, type Page } from '@playwright/test'

/**
 * Growth tab E2E, deterministic: every /api/* and Supabase call is mocked.
 *
 * Covers the merged tab (one "Growth", five sections: Map, Work, Signals,
 * Council, Governance): the `#/acquisition` alias, the section nav, the
 * Governance lane control plane (profit governor, autonomy 422 checklist,
 * direction lock, tool registry) and the Signals measurement surface.
 *
 * The send-approval test that used to live here went with the deck: cold email
 * outbound is retired and acquisition_sends holds no rows.
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
      slug: 'legibility', name: 'Legibility', active: true, autonomy_level: 'L1',
      autonomy_history: [], wired: false, funnel_weeks: [], touches: [],
      queued_count: 0, sent_count: 0, paid_count: 0, free_count: 0, mrr_usd: 0,
      churn_queue: [], frames: [], replies_new: 0,
    },
  ],
  queued_preview: [],
  unassigned_churn: [],
  content_attribution: [],
  integrations: [
    { tool: 'PostHog', category: 'analytics', job: 'Product analytics', status: 'wired', lanes: [], monthly_usd: 0, usage_metered: false, gated_reason: null, notes: null },
    { tool: 'Getwaitlist', category: 'waitlist', job: 'Waitlist loop', status: 'pending', lanes: ['fractionl_pulse'], monthly_usd: 15, usage_metered: false, gated_reason: null, notes: null },
    { tool: 'Affonso', category: 'affiliate', job: 'Referrals', status: 'gated', lanes: ['mm_ctrl'], monthly_usd: 19, usage_metered: false, gated_reason: 'unlock at $100 MRR/lane', notes: null },
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
  promoteResponse?: { status: number; body: any },
  onLanePost?: (body: any) => void,
) {
  await page.route('**/api/acquisition/overview*', r => r.fulfill({ json: OVERVIEW }))
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
  // Anon Supabase traffic (growth tables, SEO sweep, realtime auth): return
  // empty sets so panels settle on their honest empty states without a live
  // database. Specs that need rows override a single table below.
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', r => r.abort())
}

/** Open the merged Growth tab and switch to one of its five sections. */
async function openSection(page: Page, label: string, hash = '/#/growth') {
  await page.goto(hash)
  await expect(page.getByRole('heading', { name: 'Growth' })).toBeVisible()
  await page.getByRole('button', { name: label, exact: true }).click()
}

test('one Growth tab, five sections, Map first', async ({ page }) => {
  await mockGrowthApis(page)
  await page.goto('/#/growth')
  await expect(page.getByRole('heading', { name: 'Growth' })).toBeVisible()
  // Exactly one sidebar entry reads "Growth". The old "Growth map" twin is gone.
  await expect(page.getByRole('navigation').getByText('Growth', { exact: true })).toHaveCount(1)
  await expect(page.getByText('Growth map')).toHaveCount(0)
  for (const label of ['Map', 'Work', 'Signals', 'Council', 'Governance']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  // Map is the landing section: the touchpoint spine, honest about an empty read.
  await expect(page.getByText('Touchpoint map')).toBeVisible()
})

test('the #/acquisition bookmark lands on Growth, on Governance', async ({ page }) => {
  await mockGrowthApis(page)
  await page.goto('/#/acquisition')
  await expect(page.getByRole('heading', { name: 'Growth' })).toBeVisible()
  // The old deck's lane controls are what those links pointed at, so that is
  // where the alias drops you.
  await expect(page.getByText('Profit governor')).toBeVisible()
  await expect(page.getByRole('button', { name: /CTRL/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Legibility/ }).first()).toBeVisible()
})

test('the retired outbound machinery is not on the tab', async ({ page }) => {
  await mockGrowthApis(page)
  await page.goto('/#/acquisition')
  await expect(page.getByText('Profit governor')).toBeVisible()
  for (const gone of ['Send queue', 'Reply inbox', 'Nurture funnel', 'Touch progress', 'AI-answer citations']) {
    await expect(page.getByText(gone)).toHaveCount(0)
  }
})

test('work says plainly that the board is empty', async ({ page }) => {
  await mockGrowthApis(page)
  await openSection(page, 'Work')
  await expect(page.getByText('Creative board')).toBeVisible()
  await expect(page.getByText(/No creative cards yet/)).toBeVisible()
  await expect(page.getByText(/Nothing queued for this week/)).toBeVisible()
})

test('promote shows the mechanical 422 criteria checklist', async ({ page }) => {
  await mockGrowthApis(page, { status: 422, body: PROMOTE_422 })
  await openSection(page, 'Governance')
  await page.getByRole('button', { name: 'Promote', exact: true }).click()
  await expect(page.getByText('≥ 20 approved sends in 30d')).toBeVisible()
  await expect(page.getByText('Rejection rate < 5% (30d)')).toBeVisible()
  // Unmet-but-overridable criteria expose the force option
  await expect(page.getByRole('button', { name: 'Force promote' })).toBeVisible()
})

test('profit governor renders margin, cost stack and burn bar', async ({ page }) => {
  await mockGrowthApis(page)
  await openSection(page, 'Governance')
  await expect(page.getByText('Profit governor')).toBeVisible()
  await expect(page.getByText('+$23.25/mo')).toBeVisible()
  await expect(page.getByText('Attributed MRR')).toBeVisible()
  await expect(page.getByText('Monthly budget burn')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause lane' })).toBeVisible()
})

test('direction studio shows the locked direction and locks a new version', async ({ page }) => {
  let lanePost: any = null
  await mockGrowthApis(page, undefined, body => { lanePost = body })
  await openSection(page, 'Governance')
  // Locked direction is visible with its version badge and positioning
  await expect(page.getByText('Direction studio')).toBeVisible()
  await expect(page.getByText('v1 locked')).toBeVisible()
  await expect(page.getByText('Signal over noise, decision-first.')).toBeVisible()
  // Edit then lock round-trip posts direction_lock
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: /Lock this/ }).click()
  await expect.poll(() => lanePost).not.toBeNull()
  expect(lanePost.action).toBe('direction_lock')
})

test('signals merges the GEO citation rate with the SEO rank sweep', async ({ page }) => {
  await mockGrowthApis(page)
  // Specific override wins over the '**/rest/v1/**' catch-all (last route first).
  await page.route('**/rest/v1/maya_striking_distance*', r =>
    r.fulfill({
      json: [
        { id: 'r1', product: 'mm_ctrl', query: 'AI news aggregator', current_position: 8, previous_position: 12, search_volume: 170, priority: 60, last_checked_at: new Date().toISOString() },
        { id: 'r2', product: 'fractionl_pulse', query: 'AI tools for executives', current_position: null, previous_position: null, search_volume: 2400, priority: 40, last_checked_at: new Date().toISOString() },
      ],
    }))
  await openSection(page, 'Signals')
  // GEO leads the section and stays honest when no probe has run.
  await expect(page.getByText('GEO probes')).toBeVisible()
  await expect(page.getByText(/No GEO probes have been run yet/)).toBeVisible()
  // The SEO sweep sits under it, cross-product, each row labelled with its lane.
  await expect(page.getByText('SEO rank')).toBeVisible()
  await expect(page.getByText('AI news aggregator')).toBeVisible()
  await expect(page.getByText('#8')).toBeVisible()
  await expect(page.getByText('not ranking')).toBeVisible()
  await expect(page.getByText('mm-ctrl')).toBeVisible()
  await expect(page.getByText('Fractionl Pulse')).toBeVisible()
})

test('integrations panel groups tools by status and shows gated reasons', async ({ page }) => {
  await mockGrowthApis(page)
  await openSection(page, 'Governance')
  await expect(page.getByText('Integrations')).toBeVisible()
  // Org-shared wired tool shows on the lane
  await expect(page.getByText('PostHog')).toBeVisible()
  // Gated tool shows its unlock reason (mm_ctrl is the selected lane)
  await expect(page.getByText('Affonso')).toBeVisible()
  await expect(page.getByText('unlock at $100 MRR/lane')).toBeVisible()
})
