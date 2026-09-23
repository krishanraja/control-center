import type { Page, Route } from '@playwright/test'

/**
 * The Focus & Purpose tab's fixtures.
 *
 * Focus is unusual among the desks: its three tools are static content from
 * `src/content/focusTheory.ts`, so the only thing a mock has to supply is the
 * pilot state that decides which face the spine wears (compose, sent, waiting
 * on a reply). That makes an empty-looking Focus tab a real possibility to
 * guard against rather than a theoretical one — `assertFixturesLanded` below is
 * what stops a layout spec passing against a page that rendered nothing.
 *
 * Route order matters and is not a style preference: Playwright matches
 * handlers in REVERSE registration order, so the catch-alls go FIRST and the
 * specific routes after them. The other way round the catch-all shadows the
 * specific mock and the card renders against a null row forever.
 */

/** Afternoon in New York, so the morning check-in window is shut and the
 *  PilotGate never renders over the tab under test. */
export const FOCUS_AFTERNOON = new Date('2026-08-20T18:30:00Z')

export const CALM_MORNING = {
  id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green',
  one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false,
}

interface FocusFixtureOptions {
  /** The day's ask, if one is already written. Null means the compose face. */
  todayAsk?: Record<string, unknown> | null
  /** An ask from a past day still waiting on reality. */
  unresolved?: Record<string, unknown> | null
}

export async function mockFocus(page: Page, opts: FocusFixtureOptions = {}) {
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())

  await page.route('**/api/pilot/timezone', (r: Route) =>
    r.fulfill({ json: { ok: true, timezone: 'America/New_York' } }))

  await page.route('**/api/pilot/checkin*', (r: Route) => {
    if (r.request().method() !== 'GET') return r.fulfill({ json: { ok: true, checkin: {} } })
    return r.fulfill({
      json: {
        ok: true,
        morning: CALM_MORNING,
        last_evening: null,
        evening_done_today: true,
        yesterday: null,
        timezone: 'America/New_York',
        today: '2026-08-20',
      },
    })
  })

  await page.route('**/api/pilot/asks*', (r: Route) => {
    const method = r.request().method()
    if (method === 'POST') return r.fulfill({ json: { ok: true, ask: { id: 'a1' } } })
    if (method === 'PATCH') return r.fulfill({ json: { ok: true, ask: {} } })
    return r.fulfill({
      json: {
        ok: true,
        today_ask: opts.todayAsk ?? null,
        unresolved: opts.unresolved ?? null,
        today: '2026-08-20',
      },
    })
  })
}
