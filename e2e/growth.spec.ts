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

// The five section ids, which are stable, paired with the labels currently
// rendered. Selection goes through data-testid; the labels are only asserted as
// content. The previous version clicked visible text and went red the moment
// those labels were rewritten (AGENTS.md documented 7 of 9 specs failing on it).
// In the order they render, which is the order one causes the next: the Sunday
// review produces the week's clips, the clips produce the signals. The two
// references sit after the loop rather than inside it.
const SECTIONS = [
  { id: 'council', label: 'Review' },
  { id: 'work', label: 'To do' },
  { id: 'signals', label: "What's moving" },
  { id: 'map', label: 'Where they are' },
  { id: 'governance', label: 'Spend limits' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

/** Open the merged Growth tab and switch to one of its five sections. */
async function openSection(page: Page, id: SectionId, hash = '/#/growth') {
  await page.goto(hash)
  await expect(page.getByRole('heading', { name: 'Growth' })).toBeVisible()
  await page.getByTestId(`growth-section-${id}`).click()
}

test('one Growth tab, five sections, the week first', async ({ page }) => {
  await mockGrowthApis(page)
  await page.goto('/#/growth')
  await expect(page.getByRole('heading', { name: 'Growth' })).toBeVisible()
  // The desk says what the tab is for, in words, before any control. The phone
  // does not: there it costs the top of the screen and the hero already says
  // what to do (see the phone spec at the foot of this file).
  await expect(page.getByText(/Find buyers where they already are/)).toBeVisible()
  // Exactly one sidebar entry reads "Growth". The old "Growth map" twin is gone.
  await expect(page.getByRole('navigation').getByText('Growth', { exact: true })).toHaveCount(1)
  await expect(page.getByText('Growth map')).toHaveCount(0)
  for (const { id, label } of SECTIONS) {
    const tab = page.getByTestId(`growth-section-${id}`)
    await expect(tab).toBeVisible()
    await expect(tab).toHaveText(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  // The week's work is the landing section. The sections are ordered by what
  // causes what (the Sunday review produces the clips), and opening Growth is
  // almost always about what to make this week rather than reference data.
  // Asserted by which panel mounted, not by a word inside it.
  await expect(page.getByTestId('growth-panel-work')).toBeVisible()
  await expect(page.getByTestId('growth-section-work')).toHaveAttribute('aria-current', 'true')
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

test('work says plainly that the board is empty, once', async ({ page }) => {
  await mockGrowthApis(page)
  await openSection(page, 'work')
  // Selected by test id, not by the words. This spec asserted three literal
  // strings and broke the moment the copy moved, which is how the suite went
  // from 9 of 9 to 2 of 9 the last time these labels were renamed.
  await expect(page.getByTestId('growth-panel-work')).toBeVisible()
  await expect(page.getByTestId('board-empty')).toBeVisible()
  // One empty state, not two. The batch strip already carries the week and the
  // count, so the note used to repeat both and admit emptiness a second time.
  await expect(page.getByTestId('board-empty')).toHaveCount(1)
})

test('promote shows the mechanical 422 criteria checklist', async ({ page }) => {
  await mockGrowthApis(page, { status: 422, body: PROMOTE_422 })
  await openSection(page, 'governance')
  await page.getByRole('button', { name: 'Promote', exact: true }).click()
  await expect(page.getByText('≥ 20 approved sends in 30d')).toBeVisible()
  await expect(page.getByText('Rejection rate < 5% (30d)')).toBeVisible()
  // Unmet-but-overridable criteria expose the force option
  await expect(page.getByRole('button', { name: 'Force promote' })).toBeVisible()
})

test('profit governor renders margin, cost stack and burn bar', async ({ page }) => {
  await mockGrowthApis(page)
  await openSection(page, 'governance')
  await expect(page.getByText('Profit governor')).toBeVisible()
  await expect(page.getByText('+$23.25/mo')).toBeVisible()
  await expect(page.getByText('Attributed MRR')).toBeVisible()
  await expect(page.getByText('Monthly budget burn')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause lane' })).toBeVisible()
})

test('direction studio shows the locked direction and locks a new version', async ({ page }) => {
  let lanePost: any = null
  await mockGrowthApis(page, undefined, body => { lanePost = body })
  await openSection(page, 'governance')
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
  await openSection(page, 'signals')
  // GEO leads the section and stays honest when no probe has run.
  await expect(page.getByRole('heading', { name: 'Do AI answers mention you?' })).toBeVisible()
  await expect(page.getByText(/Nobody has asked the engines yet/)).toBeVisible()
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
  await openSection(page, 'governance')
  await expect(page.getByText('Connected tools')).toBeVisible()
  // Org-shared wired tool shows on the lane
  await expect(page.getByText('PostHog')).toBeVisible()
  // Gated tool shows its unlock reason (mm_ctrl is the selected lane), in full,
  // on its own line under the name: never truncated beside it.
  await expect(page.getByText('Affonso')).toBeVisible()
  await expect(page.getByText('Locked: unlock at $100 MRR/lane')).toBeVisible()
})

const REVIEW = {
  id: 'rv1', week_start: '2026-08-31', product_slug: 'ctrl', krish_decision: null, decided_at: null,
  created_at: '2026-09-06T17:00:00Z',
  findings: {
    headline: 'Landed traffic flatlined at 15 a week for two straight weeks, and four specced channels sit unshipped.',
    traffic: 'Landed events: 380, 45, 15, 15 across the last four weeks.',
    geo: '0 of 8 GEO citations, but the probe ran while the crawlers were blocked.',
    measured: 'landed 15 this week | signups 0 | GEO 0/8 cited',
  },
  kill_list: [],
  double_down: ['Rerun the 8-probe GEO citation test now.', 'Ship SEO Wave 1 plus the weekly Decision Teardown series.'],
}

/**
 * The review leads with the sentence and the moves, and each move can become
 * today's work or a clip without leaving the card. The evidence stays folded
 * until asked for: the first version rendered the headline as one "key:
 * value" row among eight and read as a wall on a phone.
 */
test('weekly review leads with the headline and puts a move on today', async ({ page }) => {
  await mockGrowthApis(page)
  await page.route('**/rest/v1/growth_council_reviews*', r => r.fulfill({ json: [REVIEW] }))
  const slotWrites: any[] = []
  await page.route('**/api/daily-focus/slot', r => { slotWrites.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true } }) })
  await page.route('**/api/daily-focus/today*', r => r.fulfill({ json: { ok: true, today: null, carry_over: null } }))
  await openSection(page, 'council')
  await expect(page.getByText(/Landed traffic flatlined/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Do next' })).toBeVisible()
  // Evidence is folded: the traffic finding is not on screen until opened.
  await expect(page.getByText(/Landed events: 380/)).toHaveCount(0)
  await page.getByRole('button', { name: /the evidence/ }).click()
  await expect(page.getByText(/Landed events: 380/)).toBeVisible()
  // A move becomes today's work through the one Today write path.
  await page.getByRole('button', { name: 'Put on today' }).first().click()
  await expect.poll(() => slotWrites.length).toBe(1)
  expect(slotWrites[0].slot).toBe(1)
  expect(slotWrites[0].text).toBe('Rerun the 8-probe GEO citation test now.')
})

/**
 * The hero's button has to do something when the section it names is already
 * open. It used to only call setSection, so pressing "Read the review" while
 * Review was the open section set the section to the section it was already on:
 * a no-op, at the one moment the button is most likely to be pressed (Krish,
 * 2026-09-11, "the Do this next, read the review button doesn't actually work").
 * It now points at the first review that still owes a ruling and opens the box
 * the ruling is typed into.
 */
test('the hero acts even when its own section is already open', async ({ browser }) => {
  // On a phone, because that is where it was reported and where the ruling box
  // starts closed. On the desk the box is open from the start, so the press has
  // nothing visible left to do there.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await mockGrowthApis(page)
  await page.route('**/rest/v1/growth_council_reviews*', r => r.fulfill({ json: [REVIEW] }))
  await page.route('**/api/daily-focus/today*', r => r.fulfill({ json: { ok: true, today: null, carry_over: null } }))
  await page.route('**/api/pilot/timezone', r => r.fulfill({ json: { ok: true, timezone: 'America/New_York' } }))
  await page.route('**/api/pilot/checkin*', r => r.fulfill({ json: {
    ok: true, evening_done_today: true, last_evening: null, yesterday: null, timezone: 'America/New_York',
    today: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()),
    morning: { id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green', one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false },
  } }))
  await page.goto('/#/growth')
  await page.getByTestId('growth-section-council').click()
  await expect(page.getByTestId('growth-panel-council')).toBeVisible()

  const waiting = page.getByTestId('growth-review-waiting')
  await expect(waiting).toHaveCount(1)
  // The section the hero names is already the open one, which is exactly the
  // case that used to be dead, and the ruling box is still shut.
  await expect(page.getByTestId('growth-section-council')).toHaveAttribute('aria-current', 'true')
  await expect(waiting.getByRole('textbox')).toHaveCount(0)

  await page.getByTestId('growth-hero').getByRole('button').first().click()
  await expect(waiting.getByRole('textbox')).toBeVisible()
  await ctx.close()
})

/**
 * Adding a place on a phone opens a sheet with one question and chips, not
 * the desktop grid inline. The Add action rides the sheet's footer, so it is
 * on screen without scrolling the tab.
 */
test('on a phone, adding a place opens a sheet with the action on screen', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await mockGrowthApis(page)
  await page.route('**/api/pilot/timezone', r => r.fulfill({ json: { ok: true, timezone: 'America/New_York' } }))
  await page.route('**/api/pilot/checkin*', r => r.fulfill({ json: {
    ok: true, evening_done_today: true, last_evening: null, yesterday: null, timezone: 'America/New_York',
    today: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()),
    morning: { id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green', one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false },
  } }))
  await page.goto('/#/growth')
  // On a phone the purpose sentence is gone: the title, the purpose, the counts,
  // the hero, the pills and the section line filled the top half of the screen
  // before any content. The hero is what tells you what to do, so it is what is
  // pinned here; the purpose line stays asserted on the desk (see above).
  await expect(page.getByTestId('growth-hero')).toBeVisible()
  await expect(page.getByText(/Find buyers where they already are/)).toHaveCount(0)
  // The map is a reference section now, after the three steps of the week, so
  // this reaches it by its pill rather than assuming it is where Growth opens.
  await page.getByTestId('growth-section-map').click()
  await expect(page.getByTestId('growth-panel-map')).toBeVisible()
  await page.getByRole('button', { name: 'Add a place' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add a place' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('What are they already asking?')).toBeVisible()
  // No native select anywhere in the sheet; the score and coverage are chips under More.
  await expect(sheet.locator('select')).toHaveCount(0)
  // The whole action button inside the viewport once the slide-up settles,
  // without scrolling anything: the footer is pinned, the middle scrolls.
  const add = sheet.getByRole('button', { name: 'Add to the map' })
  await expect(add).toBeInViewport({ ratio: 1 })
  await ctx.close()
})
