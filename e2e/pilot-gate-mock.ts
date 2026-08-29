import type { Page, Route } from '@playwright/test'

/**
 * Answer the morning check-in so the pilot gate does not cover the app.
 *
 * The gate is a full-screen interstitial ("How is it, honestly?") that mounts
 * ahead of every tab inside its morning window. A spec that does not answer it
 * asserts against a page that never reached the surface under test, and fails
 * with `element(s) not found` — which reads as a broken component, not a
 * missing fixture.
 *
 * The trap is that this is CLOCK-dependent, so the same spec passes all evening
 * and fails the next morning with no code change in between. On 2026-08-26 that
 * cost a debugging cycle: 18 specs across composer, intel-zoom and spend-panel
 * went red at 09:17 UTC against a bundle that had passed 104/104 at 22:00 the
 * night before, and the suite does not run in CI (see AGENTS.md) so nothing
 * caught it in between.
 *
 * A blanket `**\/api\/**` mock is NOT enough: `{ ok: true }` is not the shape
 * the gate reads, so it renders anyway. Call this in every spec that navigates
 * into the app, after the catch-alls — Playwright matches route handlers in
 * REVERSE registration order, so the specific ones must come last.
 */
export async function answerPilotGate(page: Page, timezone = 'America/New_York') {
  await page.route('**/api/pilot/timezone', (r: Route) =>
    r.fulfill({ json: { ok: true, timezone } }))

  await page.route('**/api/pilot/checkin*', (r: Route) => {
    const tz = new URL(r.request().url()).searchParams.get('tz') || timezone
    return r.fulfill({
      json: {
        ok: true,
        // Calm and green, so nothing downstream branches on a bad mood.
        morning: {
          id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green',
          one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false,
        },
        last_evening: null,
        evening_done_today: true,
        yesterday: null,
        timezone,
        today: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()),
      },
    })
  })
}
