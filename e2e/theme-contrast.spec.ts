import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * The two-theme legibility contract.
 *
 * Every colour in this app is supposed to come from a channel token that flips
 * with `data-theme` (see tailwind.config.js and the two :root blocks in
 * index.css). A colour written as a fixed hex does not flip, and the failure is
 * always the same shape: a FIXED surface paired with an ADAPTIVE foreground.
 * In one theme it looks deliberate; in the other the text and its background
 * converge and the control becomes unreadable.
 *
 * That shipped. `command.surface` was a fixed `#14131b` while the text on it
 * was `text-white/90`, which resolves to the --fg channel. In daylight the
 * surface stayed obsidian and the ink turned black: the Home door pills
 * (Focus / Signals / Intel) and the critical alert banner both rendered
 * dark-on-dark. Screenshot from a phone, 2026-08-30.
 *
 * A static grep cannot catch this — the two halves live in different files and
 * each is individually reasonable. So this measures the rendered result: for
 * every element that paints text over a background, composite the real stack
 * and compute the WCAG contrast ratio, in BOTH themes.
 *
 * The floor is deliberately not WCAG AA. This app leans on muted tiers
 * (text-white/45 and friends) that are intentionally quiet, and holding them to
 * 4.5:1 would be a different, much larger argument. FLOOR is set to catch
 * illegibility — text that has effectively vanished into its own background —
 * which is what actually shipped and what a theme bug always looks like.
 */

const FLOOR = 2.0
const ACTION_FLOOR = 4.5

const OS_GOALS = [
  { id: 'os:leaders', title: '200+ leaders served by end of 2026' },
  { id: 'os:ops', title: 'Krish under 2 hours/day on ops' },
  { id: 'os:asset', title: 'OS becomes a licensable asset' },
]

function goalRow(id: string, title: string, horizon: 'os' | 'weekly', parent: string | null) {
  return {
    id, title, horizon, parent_id: parent, venture: null, status: 'active',
    priority: null, why_now: null, definition_of_done: null, target_horizon: null,
    is_stale: false, orphaned: false, days_since_touch: 1,
    stale_after_days: horizon === 'weekly' ? 10 : 90,
    updated_at: new Date().toISOString(), created_at: new Date().toISOString(),
  }
}

async function mockApp(page: Page) {
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))

  // The critical alert banner is one of the two surfaces that shipped broken,
  // so it has to actually be on screen for this spec to mean anything.
  await page.route('**/rest/v1/silent_failures*', (r: Route) => r.fulfill({ json: [
    {
      id: 'sf1', workflow_id: 'wf1', workflow_name: 'HARO Ingestion',
      tier: 3, failure_type: 'runtime_failing',
      detail: 'n8n runtime says this workflow is dead: 94/94 executions failed in 28d.',
      run_count: 94, detected_at: new Date().toISOString(), resolved_at: null,
    },
  ] }))

  await page.route('**/api/pilot/worries*', (r: Route) => r.fulfill({ json: {
    ok: true, due: [], calibration: { total_closed: 0, pct_confirmed: 0 },
    open_test_count: 0, cap: 5,
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
    ok: true, summary: { this_week: 4, days_since_last: 0, return_rate: 2, last_ten: [] },
  } }))

  const os = OS_GOALS.map(g => goalRow(g.id, g.title, 'os', null))
  await page.route('**/api/goals/ladder*', (r: Route) => r.fulfill({ json: {
    ok: true, horizons: ['os', 'weekly'], by_horizon: { os, weekly: [] },
    goals: os, stale_count: 0, orphan_count: 0, ventures: ['mindmaker'],
    north_star: '', week_of: 'Aug 24–30',
  } }))

  await page.route('**/api/pilot/timezone', (r: Route) =>
    r.fulfill({ json: { ok: true, timezone: 'America/New_York' } }))

  // Content reads the shift register; without it that route renders a bare
  // shell and the measurement below would have nothing to measure.
  await page.route('**/rest/v1/shifts*', (r: Route) => r.fulfill({ json: [
    {
      id: 's-built', slug: 'agents-in-ci', title: 'Agent teams are moving into CI pipelines',
      summary: 'x', implication: 'x', category: 'tools', status: 'active', lane: 'built',
      first_seen_on: '2026-07-01', last_evidence_on: '2026-08-20',
      momentum: 4, momentum_history: [{ week: '2026-W33', momentum: 4 }],
      day_span_total: 9, source_count_total: 5, story_count: 12, provenance: 'lived', decision: null,
    },
    {
      id: 's-cross', slug: 'veto-power', title: 'Governments claim pre-release veto power over frontier AI',
      summary: 'x', implication: 'x', category: 'governance', status: 'proposed', lane: null,
      first_seen_on: '2026-07-10', last_evidence_on: '2026-08-21',
      momentum: 3, momentum_history: [{ week: '2026-W33', momentum: 3 }],
      day_span_total: 7, source_count_total: 4, story_count: 9, provenance: 'lived', decision: null,
    },
  ] }))

  await page.route('**/rest/v1/decisions_waiting*', (r: Route) => r.fulfill({ json: [
    { kind: 'task', id: 't1', title: 'Approve the Vera correction batch', description: null, priority: 'high', agent: 'vera', status: 'waiting', sort_at: new Date().toISOString(), meta: {}, route_target: null },
  ] }))
}

type Offender = { ratio: number; text: string; fg: string; bg: string; cls: string; tag: string }
type Measured = { offenders: Offender[]; inspected: number }

/**
 * Measure every rendered text run against its true composited backdrop.
 *
 * Runs in the page. Only elements holding their OWN text are measured (a
 * wrapper div's textContent includes its children, and its background is not
 * necessarily what that text sits on). The backdrop is built by walking
 * ancestors and compositing translucent layers until an opaque one is reached,
 * because almost every surface here is an alpha over the page ground.
 */
async function measure(page: Page, floor = FLOOR, interactiveOnly = false): Promise<Measured> {
  return page.evaluate(({ floor, interactiveOnly }) => {
    const parse = (c: string): [number, number, number, number] | null => {
      const m = c.match(/rgba?\(([^)]+)\)/)
      if (!m) return null
      const p = m[1].split(',').map(s => parseFloat(s.trim()))
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
    }
    const chan = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
    const lum = (c: number[]) => 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2])
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    const over = (fg: number[], bg: number[], a: number) => [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a))

    // Composite this element's backdrop from its ancestor chain.
    const backdrop = (el: Element): number[] => {
      const layers: Array<[number[], number]> = []
      let node: Element | null = el
      while (node) {
        const cs = getComputedStyle(node)
        const p = parse(cs.backgroundColor)
        if (p && p[3] > 0) layers.push([[p[0], p[1], p[2]], p[3]])
        if (p && p[3] === 1) break
        node = node.parentElement
      }
      // Bottom-up: start from the deepest opaque layer (or white) and paint up.
      let acc = layers.length && layers[layers.length - 1][1] === 1
        ? layers[layers.length - 1][0]
        : [255, 255, 255]
      for (let i = layers.length - (layers.length && layers[layers.length - 1][1] === 1 ? 2 : 1); i >= 0; i--) {
        acc = over(layers[i][0], acc, layers[i][1])
      }
      return acc
    }

    const hidden = (el: Element) => {
      let n: Element | null = el
      while (n) {
        const cs = getComputedStyle(n)
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.15) return true
        n = n.parentElement
      }
      return false
    }

    const out: Offender[] = []
    let inspected = 0
    for (const el of Array.from(document.querySelectorAll('*'))) {
      // Only elements rendering their own text.
      const own = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => (n.textContent || '').trim())
        .join(' ')
        .trim()
      if (!own) continue
      const interactive = el.closest('button, a, input, textarea, [role="button"], [role="tab"]')
      if (interactiveOnly) {
        if (!interactive) continue
        // Decorative glyphs and unavailable controls do not communicate an
        // actionable choice. Counting them hid the useful signal in a list of
        // chevrons and intentionally disabled labels.
        if (el.closest('[aria-hidden="true"]')) continue
        if (interactive.matches(':disabled, [aria-disabled="true"], [inert]')) continue
      }
      const r = el.getBoundingClientRect()
      if (r.width < 8 || r.height < 6) continue
      if (hidden(el)) continue

      const cs = getComputedStyle(el)
      const f = parse(cs.color)
      if (!f) continue
      const bg = backdrop(el)
      const fg = over([f[0], f[1], f[2]], bg, f[3])
      const cr = ratio(fg, bg)
      inspected++
      if (cr < floor) {
        const cn = (el as HTMLElement).className
        out.push({
          ratio: Math.round(cr * 100) / 100,
          text: own.slice(0, 48),
          fg: cs.color, bg: `rgb(${bg.map(Math.round).join(' ')})`,
          cls: String(typeof cn === 'string' ? cn : (cn as unknown as SVGAnimatedString)?.baseVal || '').slice(0, 110),
          tag: el.tagName.toLowerCase(),
        })
      }
    }
    return { offenders: out.sort((a, b) => a.ratio - b.ratio), inspected }
  }, { floor, interactiveOnly })
}

/**
 * The destinations a person actually lands on. Each is checked in both themes,
 * at the phone width the bug was reported from; Home is also checked wide,
 * because the desktop shell is a different component tree.
 */
const ROUTES = [
  { name: 'home', path: '/#/home' },
  { name: 'content', path: '/#/content' },
  { name: 'people', path: '/#/relationships' },
  { name: 'growth', path: '/#/growth' },
  { name: 'intel', path: '/#/os?sub=intel' },
  { name: 'focus', path: '/#/focus' },
]

const PHONE = { width: 412, height: 915 }
const DESKTOP = { width: 1280, height: 800 }

// A splash screen has almost no text on a painted background, and would sail
// through a "no offenders" assertion — the first run of this spec "passed" four
// times against a stuck splash before this check existed. Measured: a splash
// yields 0-2 text runs; the sparsest real page (Content's empty Queue tab)
// yields 11. Six separates them cleanly.
const MIN_INSPECTED = 6

for (const theme of ['light', 'dark'] as const) {
  for (const route of ROUTES) {
    for (const vp of route.name === 'home' ? [PHONE, DESKTOP] : [PHONE]) {
      const size = vp === PHONE ? 'phone' : 'desktop'
      test(`${theme} theme is legible: ${route.name} (${size})`, async ({ page }) => {
        await page.setViewportSize(vp)
        await page.addInitScript(t => localStorage.setItem('cc-theme', t as string), theme)
        await mockApp(page)
        await page.goto(route.path, { waitUntil: 'networkidle' })
        await page.waitForTimeout(1200)

        // Content lands on an empty Queue. The shift cards are the surface worth
        // measuring, so step into the room that holds them.
        if (route.name === 'content') {
          const built = page.getByRole('button', { name: 'Built', exact: true })
          if (await built.count()) { await built.first().click(); await page.waitForTimeout(700) }
        }

        const { offenders, inspected } = await measure(page)
        expect(inspected, `${route.name} rendered almost nothing (${inspected} text runs) — the page never left its splash, so this result proves nothing`).toBeGreaterThan(MIN_INSPECTED)

        const report = offenders
          .map(o => `  ${o.ratio}:1  <${o.tag}> "${o.text}"\n      fg=${o.fg} on bg=${o.bg}\n      class="${o.cls}"`)
          .join('\n')
        expect(offenders, `Text below ${FLOOR}:1 in ${theme} on ${route.name} (${size}):\n${report}`).toEqual([])

        const interactive = await measure(page, ACTION_FLOOR, true)
        const interactiveReport = interactive.offenders
          .map(o => `  ${o.ratio}:1  <${o.tag}> "${o.text}"\n      fg=${o.fg} on bg=${o.bg}\n      class="${o.cls}"`)
          .join('\n')
        expect(
          interactive.offenders,
          `Actionable text below ${ACTION_FLOOR}:1 in ${theme} on ${route.name} (${size}):\n${interactiveReport}`,
        ).toEqual([])
      })
    }
  }
}
