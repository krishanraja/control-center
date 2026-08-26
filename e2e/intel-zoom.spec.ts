import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * Two regressions on the OS → Intel route, both real bugs shipped 2026-08:
 *
 * 1. Ask Marcus stole focus on mount — the only tab-level autofocus in the
 *    app — so on a phone the Intel tab always opened with the keyboard up
 *    inside the fixed no-scroll zoom shell ("it always loads zoomed in").
 *    Focus must arrive only from the user's own tap or ask.
 * 2. MobileShell claimed a fresh full viewport under the OS switcher, so
 *    every OS subtab overflowed the zoom root's clip box by the switcher's
 *    height and the bottom of the page was silently cut off.
 *
 * Catch-alls first — Playwright matches route handlers in reverse
 * registration order.
 */

const SPEND_EMPTY = {
  ok: true, month_usd: 0, avg_3mo_usd: 0, delta_pct: null, ballooning: false,
  months: [], services: [], unmatched: [],
  connections: { ok: 0, low: 0, broken: 0, critical_broken: 0, unchecked: 0, broken_names: [], low_names: [] },
  renewals_due: [], needs_review: 0, meter: null, empty: true, as_of: new Date().toISOString(),
}

const calmMorning = {
  id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green',
  one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false,
}

// The page's clock is frozen here; relative fixture dates hang off it.
const FIXED_NOW = new Date('2026-08-20T18:30:00Z')

async function mock(page: Page) {
  // Fixed afternoon + a completed check-in: the pilot gate must never decide
  // these assertions by wall clock.
  await page.clock.setFixedTime(FIXED_NOW)
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/pilot/timezone', (r: Route) =>
    r.fulfill({ json: { ok: true, timezone: 'America/New_York' } }))
  await page.route('**/api/pilot/checkin*', (r: Route) => {
    const tz = new URL(r.request().url()).searchParams.get('tz') || 'America/New_York'
    return r.fulfill({
      json: {
        ok: true, morning: calmMorning, last_evening: null, evening_done_today: true,
        yesterday: null, timezone: 'America/New_York',
        today: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()),
      },
    })
  })
  await page.route('**/api/spend', (r: Route) => r.fulfill({ json: SPEND_EMPTY }))
  await page.route('**/rest/v1/home_intelligence*', (r: Route) => r.fulfill({
    json: {
      summary: { headline: 'Quiet morning.' },
      external_signals: [],
      metrics: [],
      generated_at: new Date().toISOString(),
    },
  }))
}

test.describe('the intel tab does not zoom itself', () => {
  test('mounting Intel on a phone leaves the Ask Marcus box unfocused', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await mock(page)
    await page.goto('/#/os?sub=intel')

    await expect(page.getByPlaceholder(/Ask something pointed/)).toBeVisible()
    const focused = await page.evaluate(() => document.activeElement?.tagName || 'BODY')
    expect(focused).not.toBe('TEXTAREA')
    await ctx.close()
  })

  test('mounting Intel on desktop leaves the Ask Marcus box unfocused', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await mock(page)
    await page.goto('/#/os?sub=intel')

    await expect(page.getByPlaceholder(/Ask something pointed/)).toBeVisible()
    const focused = await page.evaluate(() => document.activeElement?.tagName || 'BODY')
    expect(focused).not.toBe('TEXTAREA')
    await ctx.close()
  })

  test('the full console fits two mobile screen-lengths', async ({ browser }) => {
    // Krish's hard cap (2026-08-26): the phone console must fit in at most
    // two screen-lengths of scroll — depth lives behind the tiles and door
    // rows, not down the page. Measured on a FULL fixture (headline, signals,
    // metrics, synthesis, spend, bets) so the pin can never pass on emptiness.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await mock(page)
    await page.route('**/rest/v1/home_intelligence*', (r: Route) => r.fulfill({
      json: {
        summary: { headline: 'Circle funds the month.', body: 'A paragraph of read.', recommended_focus: 'Decide the CTRL bet.' },
        external_signals: [],
        metrics: JSON.stringify([
          { id: 'mrr', label: 'Committed MRR', value: '$15', target: '$500', progress_pct: 3 },
          { id: 'subs', label: 'Retained subscribers', value: '2', target: '10', progress_pct: 20 },
        ]),
        assessment: 'One insight. | Another insight.',
        generated_at: new Date().toISOString(),
      },
    }))
    await page.route('**/rest/v1/marcus_synthesis*', (r: Route) => r.fulfill({
      json: {
        id: 's1', week_of: '2026-08-24',
        insights: ['One insight.', 'Another insight.'],
        org_focus: 'One revenue conversation per day.',
        cleo_recommendations: 'Publish the teardown.',
        generated_at: new Date().toISOString(),
      },
    }))
    await page.route('**/rest/v1/bets*', (r: Route) => r.fulfill({
      json: [{
        id: 'b1', hypothesis: 'H', success_criterion: 'S', kind: 'other', time_box_days: 14,
        status: 'live', agent_owner: 'krish', est_mrr_impact_usd: null, actual_mrr_impact_usd: null,
        learning: null, replaces_bet_id: null, started_at: new Date(FIXED_NOW.getTime() - 20 * 86_400_000).toISOString(),
        decided_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }],
    }))
    await page.route('**/api/spend', (r: Route) => r.fulfill({
      json: {
        ok: true, month_usd: 544, avg_3mo_usd: 512, delta_pct: 6, ballooning: false,
        months: [{ month: '2026-07', total_usd: 502 }, { month: '2026-08', total_usd: 544 }],
        services: [{
          key: 'fmp', name: 'FMP', category: 'data', criticality: 'standard', month_usd: 29, avg_usd: 29,
          cadence: 'monthly', plan_label: null, last_paid_at: null, next_renewal_on: null, status: 'exhausted',
          balance: null, balance_unit: null, balance_low: false, last_checked_at: new Date().toISOString(),
          top_up_url: 'https://example.com', dashboard_url: null,
          limit_note: 'Starter plan: 300 calls/min.', usage: null,
        }],
        unmatched: [],
        connections: { ok: 34, low: 0, broken: 1, critical_broken: 0, unchecked: 1, broken_names: ['FMP'], low_names: [] },
        renewals_due: [{ key: 'relume', name: 'Relume', amount: 480, currency: 'USD', on: new Date(FIXED_NOW.getTime() + 11 * 86_400_000).toISOString().slice(0, 10) }],
        needs_review: 1, meter: { usd_mtd: 41, calls_mtd: 1204 }, empty: false, as_of: new Date().toISOString(),
      },
    }))
    await page.goto('/#/os?sub=intel')
    await expect(page.getByTestId('spend-panel')).toBeVisible()

    // "Two screen-lengths" measured literally: the whole tab column (header
    // included, from the top of the zoom root to the bottom of the scrolled
    // content) against two heights of the phone screen.
    const screens = await page.getByTestId('tab-scroll').evaluate(el => {
      const root = document.querySelector('.mobile-zoom-root')!
      const screen = root.getBoundingClientRect().height
      const offsetTop = el.getBoundingClientRect().top - root.getBoundingClientRect().top
      return (offsetTop + el.scrollHeight) / screen
    })
    expect(screens).toBeGreaterThan(0.9) // the fixture is full — a broken mock must not pass as short
    expect(screens).toBeLessThanOrEqual(2)
    await ctx.close()
  })

  for (const sub of ['intel', 'systems'] as const) {
    test(`the ${sub} subtab fits the zoom root's clip box on a phone`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
      const page = await ctx.newPage()
      await mock(page)
      await page.goto(`/#/os?sub=${sub}`)
      await expect(page.getByTestId(`os-sub-${sub}`)).toBeVisible()

      // Every box in the normal flow must end inside the zoom root. Walk the
      // tree but stop at scroll/clip containers: content below the fold of a
      // legitimate inner scroller extends past on purpose, while the old bug
      // (MobileShell claiming a fresh full viewport under the switcher) put
      // the shell's own box ~60 zoomed px past the root, clipping the page
      // bottom with nothing scrollable about it.
      const overflow = await page.evaluate(() => {
        const root = document.querySelector('.mobile-zoom-root')
        if (!root) return 'no zoom root'
        const rootBottom = root.getBoundingClientRect().bottom
        let worst = 0
        const walk = (el: Element) => {
          const style = getComputedStyle(el)
          if (style.position === 'fixed') return
          worst = Math.max(worst, el.getBoundingClientRect().bottom - rootBottom)
          const clips = /(auto|scroll|hidden)/.test(style.overflowY) || /(auto|scroll|hidden)/.test(style.overflow)
          if (clips) return
          for (const child of Array.from(el.children)) walk(child)
        }
        for (const child of Array.from(root.children)) walk(child)
        return worst
      })
      expect(typeof overflow).toBe('number')
      expect(overflow as number).toBeLessThanOrEqual(1)
      await ctx.close()
    })
  }
})
