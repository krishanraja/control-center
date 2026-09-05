import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * The no-scroll contract (2026-08-20 recompose).
 *
 * Home is where Krish locks in on what matters — OS goals → this week's
 * objectives → today's 3 — and its charter says the whole thing fits the
 * viewport with no page scroll on ANY device. This spec pins that: at four
 * representative viewports, in the empty state (cold start: CTA visible) and
 * the full state (3/3/3), nothing inside the home frame overflows or scrolls.
 *
 * "No scroll" is asserted structurally: the home frame's scrollHeight must not
 * exceed its clientHeight (that catches clipping AND scrolling), and no
 * descendant may be an actually-overflowing scroll container.
 */

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const OS_GOALS = [
  { id: 'os:leaders', title: '200+ leaders served by end of 2026' },
  { id: 'os:ops', title: 'Krish under 2 hours/day on ops' },
  { id: 'os:asset', title: 'OS becomes a licensable asset' },
]
const WEEKLY = [
  { id: 'weekly:refresher', title: 'Ship the product-truth refresher', parent: 'os:leaders' },
  { id: 'weekly:invoices', title: 'Send the three open invoices', parent: 'os:ops' },
  { id: 'weekly:license-memo', title: 'Draft the licensing one-pager', parent: 'os:asset' },
]

function goalRow(id: string, title: string, horizon: 'os' | 'weekly', parent: string | null) {
  return {
    id, title, horizon, parent_id: parent, venture: null, status: 'active',
    priority: null, why_now: null, definition_of_done: null, target_horizon: null,
    is_stale: false, orphaned: false, days_since_touch: 1, stale_after_days: horizon === 'weekly' ? 10 : 90,
    updated_at: new Date().toISOString(), created_at: new Date().toISOString(),
  }
}

async function mockHome(page: Page, state: 'empty' | 'full') {
  // Generic floors first; specific routes registered later win.
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))

  await page.route('**/api/pilot/worries*', (r: Route) => r.fulfill({ json: {
    ok: true, due: [], calibration: { total_closed: 0, pct_confirmed: 0 }, open_test_count: 0, cap: 5,
    today: new Intl.DateTimeFormat('en-CA').format(new Date()),
  } }))

  await page.route('**/api/pilot/checkin*', (r: Route) => r.fulfill({ json: {
    ok: true,
    morning: { id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green', one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false },
    last_evening: null, evening_done_today: true, yesterday: null,
    timezone: 'Australia/Sydney',
    today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date()),
  } }))

  await page.route('**/api/pilot/ships*', (r: Route) => r.fulfill({ json: {
    ok: true,
    summary: state === 'full'
      ? { this_week: 4, days_since_last: 0, return_rate: 2, last_ten: [
          { id: 's1', occurred_at: new Date().toISOString(), description: 'Sent the licensing memo', channel: 'email', source: 'manual' },
        ] }
      : { this_week: 0, days_since_last: null, return_rate: null, last_ten: [] },
  } }))

  // The scorecard line. Populated in the full state with the widest plausible
  // digits so the band is measured with real numbers, empty (all zero) on a
  // cold start.
  const full = state === 'full'
  const week = (w: string, v: number[] | null) => ({
    week_ending: w, frozen_at: v ? new Date().toISOString() : null, plan_sent: v ? 5 : null, variance_note: null,
    approaches_sent: v ? v[0] : null, calls_taken: v ? v[1] : null, paid_rooms: v ? v[2] : null,
    cash_invoiced_gbp: v ? v[3] : null, pieces_published: v ? v[4] : null, unasked_hours: v ? v[5] : null,
    unasked_measured: Boolean(v),
    override_approaches_sent: null, override_calls_taken: null, override_paid_rooms: null,
    override_cash_invoiced_gbp: null, override_pieces_published: null, override_unasked_hours: null,
  })
  const targets = { approaches_sent: 25, calls_taken: 5, paid_rooms: 1, cash_invoiced_gbp: 15000, pieces_published: 12, unasked_hours: 0 }
  const totals = full
    ? { approaches_sent: 13, calls_taken: 2, paid_rooms: 1, cash_invoiced_gbp: 15000, pieces_published: 4, unasked_hours: 12.5 }
    : { approaches_sent: 0, calls_taken: 0, paid_rooms: 0, cash_invoiced_gbp: 0, pieces_published: 0, unasked_hours: 0 }
  await page.route('**/api/scorecard*', (r: Route) => r.fulfill({ json: {
    ok: true,
    week_ending: '2026-09-25',
    current: { week_ending: '2026-09-25', approaches_sent: full ? 3 : 0, calls_taken: 0, paid_rooms: 0, cash_invoiced_gbp: 0, pieces_published: 1, unasked_hours: full ? 12.5 : 0, unasked_measured: full, commits: full ? 25 : 0 },
    weeks: [
      week('2026-09-11', full ? [5, 1, 0, 0, 1, 0] : [0, 0, 0, 0, 0, 0]),
      week('2026-09-18', full ? [5, 1, 1, 15000, 2, 0] : [0, 0, 0, 0, 0, 0]),
      week('2026-09-25', full ? [3, 0, 0, 0, 1, 12.5] : [0, 0, 0, 0, 0, 0]),
      ...['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30', '2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27'].map(w => week(w, null)),
    ],
    targets,
    totals,
    gap: { approaches_sent: 25 - totals.approaches_sent, calls_taken: 5 - totals.calls_taken, paid_rooms: 1 - totals.paid_rooms, cash_invoiced_gbp: 15000 - totals.cash_invoiced_gbp, pieces_published: 12 - totals.pieces_published, unasked_hours: totals.unasked_hours },
    stop_rule: { on: '2026-10-05', reads: 'Fewer than 2 of 25 took a call, or no paid room. The network advantage is not real for this offer.' },
    day_90: '2026-12-05',
    unasked_measured: full,
  } }))

  const os = OS_GOALS.map(g => goalRow(g.id, g.title, 'os', null))
  const weekly = state === 'full' ? WEEKLY.map(g => goalRow(g.id, g.title, 'weekly', g.parent)) : []
  await page.route('**/api/goals/ladder*', (r: Route) => r.fulfill({ json: {
    ok: true,
    horizons: ['os', 'weekly'],
    by_horizon: { os, weekly },
    goals: [...os, ...weekly],
    stale_count: 0, orphan_count: 0,
    ventures: ['mindmaker'],
    north_star: '',
    week_of: 'Aug 17–23',
  } }))

  if (state === 'full') {
    // Today's 3, locked, one done. The route echoes the date the client asked
    // for, so the browser's civil day never has to match the test host's.
    await page.route('**/rest/v1/daily_focus*', (r: Route) => {
      const url = new URL(r.request().url())
      const dateParam = (url.searchParams.get('focus_date') || '').replace('eq.', '')
      const row = {
        id: 'df1', focus_date: dateParam, status: 'calibrated',
        target_1_text: 'Record the refresher walkthrough', target_1_concept_id: null, target_1_source: 'krish_added', target_1_replaced_marcus_pick: null, target_1_completed_at: new Date().toISOString(), target_1_goal_id: 'weekly:refresher',
        target_2_text: 'Invoice AdFixus', target_2_concept_id: null, target_2_source: 'krish_added', target_2_replaced_marcus_pick: null, target_2_completed_at: null, target_2_goal_id: 'weekly:invoices',
        target_3_text: 'Email the licensing draft to counsel', target_3_concept_id: null, target_3_source: 'krish_added', target_3_replaced_marcus_pick: null, target_3_completed_at: null, target_3_goal_id: 'weekly:license-memo',
        calibrated_at: new Date().toISOString(), completed_at: null, carried_from_date: null,
        relevance_index: {}, marcus_suggestions: [],
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
      // useDailyFocus asks for today and yesterday; only today gets a row.
      const isYesterday = dateParam < new Intl.DateTimeFormat('en-CA').format(new Date())
      return r.fulfill({ json: isYesterday ? null : row })
    })
    await page.route('**/rest/v1/decisions_waiting*', (r: Route) => r.fulfill({ json: [
      { kind: 'task', id: 't1', title: 'Approve the Vera correction batch', description: null, priority: 'high', agent: 'vera', status: 'waiting', sort_at: new Date().toISOString(), meta: {}, route_target: null },
      { kind: 'task', id: 't2', title: 'Rule on the returned capture', description: null, priority: 'normal', agent: null, status: 'waiting', sort_at: new Date().toISOString(), meta: {}, route_target: null },
    ] }))
  }
}

/**
 * True when el (or any descendant) holds more content than it shows — i.e.
 * something would need to scroll or is being clipped.
 */
async function assertNothingOverflows(page: Page, frameSelector: string) {
  const offender = await page.evaluate((sel) => {
    const frame = document.querySelector(sel)
    if (!frame) return 'FRAME NOT FOUND'
    const bad: string[] = []
    const check = (el: Element) => {
      const he = el as HTMLElement
      // 2px of tolerance for subpixel rounding.
      if (he.scrollHeight > he.clientHeight + 2 && he.clientHeight > 0) {
        const cs = getComputedStyle(he)
        const lineClamped = (cs as unknown as { webkitLineClamp?: string }).webkitLineClamp
          && (cs as unknown as { webkitLineClamp?: string }).webkitLineClamp !== 'none'
        // A hidden/auto/scroll container with more content than height is a
        // real overflow whether it clips or scrolls. line-clamp is the one
        // sanctioned clip: a deliberately truncated title is not an overflow.
        if (cs.overflowY !== 'visible' && !lineClamped) {
          bad.push(`${he.tagName}.${String(he.className).slice(0, 80)} scroll=${he.scrollHeight} client=${he.clientHeight}`)
        }
      }
      for (const c of Array.from(el.children)) check(c)
    }
    check(frame)
    return bad.length ? bad.join(' | ') : null
  }, frameSelector)
  expect(offender, `overflowing element inside home: ${offender}`).toBeNull()
}

const VIEWPORTS = [
  { w: 1440, h: 900, shell: 'desktop' as const },
  { w: 1280, h: 800, shell: 'desktop' as const },
  { w: 390, h: 844, shell: 'mobile' as const },
  { w: 360, h: 800, shell: 'mobile' as const },
]

for (const vp of VIEWPORTS) {
  for (const state of ['empty', 'full'] as const) {
    test(`home fits without scroll at ${vp.w}×${vp.h} (${state} canon)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h })
      await mockHome(page, state)
      await page.goto('/#/home')
      // Let the skeleton settle into live data.
      await page.getByText('200+ leaders served by end of 2026').first().waitFor({ timeout: 15_000 })
      await sleep(400)

      // The three layers are on screen (scoped by section label — the sidebar
      // has an OS tab too).
      await expect(page.getByLabel('OS goals')).toBeVisible()
      await expect(page.getByLabel("This week's objectives")).toBeVisible()
      await expect(page.getByLabel('Today', { exact: true })).toBeVisible()

      if (state === 'empty') {
        // Cold start: the ONE contextual ask points at the week.
        await expect(page.getByRole('button', { name: /Set this week/ })).toBeVisible({ timeout: 15_000 })
      } else {
        await expect(page.getByText('Record the refresher walkthrough')).toBeVisible()
      }

      // …and nothing scrolls or clips. main is the app's no-scroll region; the
      // home frame is its first element child on both shells.
      await assertNothingOverflows(page, 'main')
    })
  }
}
