import { test, expect, type Page, type Route } from '@playwright/test'
import { answerPilotGate } from './pilot-gate-mock'
// The lane's name comes from the product, so a rename never leaves a spec
// asserting a word the app no longer says.
import { ADVISORY_LABEL } from '../src/hooks/usePilots'

/**
 * The no-scroll contract for Pilots.
 *
 * Krish's report, 2026-09-16, on a phone: "It is entirely supposed to be a
 * no-scroll experience. It's just not. It's a horrible mobile experience with
 * a lot of wasted space and requires scrolling." The lane was a scrolling
 * MobileShell under a full TabHeader, stacking a purpose paragraph, a
 * disclosure, a counts row, a button row, a chip row and a list of tall cards,
 * all magnified by the 1.2 zoom root.
 *
 * Asserted structurally, the same way e2e/home-noscroll.spec.ts does it: no
 * element inside `main` may hold more content than it shows. That catches
 * clipping and scrolling together, so a layout cannot pass by hiding the
 * overflow it failed to prevent.
 *
 * The drafted deal is the tall case on purpose: it carries the subject, the
 * cited quote and the full action row, and it used to carry a six row
 * textarea as well.
 *
 * Watched fail against the old layout before it was kept (TESTING.md, "prove
 * the test fails without the fix"): 7 of 10 red, the scroller holding 763px of
 * content in a 537px viewport, with the draft textarea overflowing inside it.
 */

const now = new Date().toISOString()
const recent = new Date(Date.now() - 6 * 86_400_000).toISOString()

const CONTACT = (id: string, name: string, title: string, company: string) => ({
  id, full_name: name, first_name: name.split(' ')[0], email: `${id}@example.com`, company, title,
  linkedin_url: `https://www.linkedin.com/in/${id}`,
})

const base = {
  sent_at: null, replied_at: null, call_booked_at: null, call_taken_at: null,
  pilot_booked_at: null, pilot_paid_at: null, not_now_at: null, cash_gbp: null,
  sourced_by: 'os', notes: null, listed_at: now, created_at: now, updated_at: now,
  ask_kind: null, ask_line: null,
  intent_score: null, intent_stance: null, intent_evidence: null, intent_evidence_url: null,
  intent_topics: null, last_post_at: null, followers: null, is_influencer: null,
  is_creator: null, completeness: null,
}

/** A listed deal whose only "why now" is the stored intent quote, which is
 *  the case that used to read "No live trigger found". */
const LISTED = {
  ...base,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  contact_id: 'c1',
  why_face: 'Runs a PE backed adtech business and has not said out loud what the next two quarters do to it.',
  trigger_signal: null, trigger_source_url: null, trigger_found_at: null,
  draft_subject: null, draft_body: null, draft_url: null, drafted_at: null,
  state: 'listed',
  ask_kind: 'intro',
  ask_line: 'Ask Alex who else should see this.',
  intent_score: 72,
  intent_stance: 'struggling',
  intent_evidence: 'We have three AI pilots running and no honest read on which of them is actually working.',
  intent_evidence_url: 'https://www.linkedin.com/posts/alex-morgan-abc',
  last_post_at: recent,
  followers: 12400,
  is_influencer: true,
  completeness: 88,
  contact: CONTACT('c1', 'Alex Morgan', 'CEO', 'Northline Media'),
}

/** The tallest card the lane can render. */
const DRAFTED = {
  ...base,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  contact_id: 'c2',
  why_face: 'Chief data officer at a broadcaster mid restructure, with the budget and the problem in the same place.',
  trigger_signal: 'In August the company cut a fifth of its data team and said AI would cover the gap.',
  trigger_source_url: 'https://example.com/news',
  trigger_found_at: now,
  draft_subject: 'A quiet word before the next quarter',
  draft_body: 'Sam, saw the news about the team.\n\nI have been running a short private review for a few leaders I know well, on where they actually stand and what is coming.\n\nWorth twenty minutes?\n\nKrish',
  draft_url: 'https://mail.google.com/mail/u/0/#drafts/abc',
  drafted_at: now,
  state: 'drafted',
  ask_kind: 'buyer',
  ask_line: 'Ask Sam for twenty minutes this month.',
  contact: CONTACT('c2', 'Sam Patel', 'Chief Data Officer', 'Eastcast'),
}

type State = 'empty' | 'one' | 'full'

async function mock(page: Page, state: State) {
  await page.clock.setFixedTime(new Date('2026-09-16T18:30:00Z'))
  // Catch-alls FIRST: Playwright checks route handlers in reverse
  // registration order, so the specific mocks below win (AGENTS.md).
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await answerPilotGate(page)
  await page.route('**/api/goals/ladder*', (r: Route) => r.fulfill({ json: {
    ok: true, horizons: ['os', 'weekly'], by_horizon: { os: [], weekly: [] }, goals: [],
    stale_count: 0, orphan_count: 0, ventures: ['mindmake'], north_star: '', week_of: 'Sep 13-19',
  } }))

  const targets = state === 'empty' ? [] : state === 'one' ? [DRAFTED] : [LISTED, DRAFTED]
  const stateCounts = state === 'empty' ? {}
    : state === 'one' ? { drafted: 1 }
      : { listed: 1, drafted: 1, sent: 3, not_now: 2 }
  const body = { ok: true, targets, stateCounts }

  // The empty lane auto-seeds once, so the seed must answer or the lane sits
  // in a spinner and the frame is measured mid-skeleton.
  await page.route('**/api/pilot-deals/seed', (r: Route) =>
    r.fulfill({ json: { ok: true, proposals: [], degraded: [], held_back: 0, inserted: 0 } }))
  await page.route('**/api/pilot-deals', (r: Route) => r.fulfill({ json: body }))
  await page.route('**/api/pilot-deals?*', (r: Route) => r.fulfill({ json: body }))
}

/**
 * True when el or any descendant holds more content than it shows.
 * Lifted from e2e/home-noscroll.spec.ts so both lanes are held to one
 * definition of "fits". line-clamp is the one sanctioned clip, and this repo
 * disables it globally anyway.
 */
async function assertNothingOverflows(page: Page, frameSelector: string) {
  const offender = await page.evaluate((sel) => {
    const frame = document.querySelector(sel)
    if (!frame) return 'FRAME NOT FOUND'
    const bad: string[] = []
    const check = (el: Element) => {
      const he = el as HTMLElement
      if (he.scrollHeight > he.clientHeight + 2 && he.clientHeight > 0) {
        const cs = getComputedStyle(he)
        const clamp = (cs as unknown as { webkitLineClamp?: string }).webkitLineClamp
        const lineClamped = clamp && clamp !== 'none'
        if (cs.overflowY !== 'visible' && !lineClamped) {
          bad.push(`${he.tagName}.${String(he.className).slice(0, 80)} scroll=${he.scrollHeight} client=${he.clientHeight}`)
        }
      }
      for (const c of Array.from(el.children)) check(c)
    }
    check(frame)
    return bad.length ? bad.join(' | ') : null
  }, frameSelector)
  expect(offender, `overflowing element inside Pilots: ${offender}`).toBeNull()
}

/**
 * The viewports the contract is strict at: the two the Home no-scroll spec
 * uses, which cover current phones.
 *
 * 360x640 is deliberately NOT here. After the 1.2 zoom root that is an
 * effective 300x533, smaller than any phone now sold, and the drafted card -
 * name, role, the ask, a cited quote, the draft subject and the action row -
 * does not fit it by about 60 pixels. The options were to hide the content
 * that makes the card worth looking at, or to let that one case scroll. It
 * scrolls, and the test below pins that the actions stay reachable there
 * rather than being silently clipped.
 */
const PHONES = [
  { w: 390, h: 844 },
  { w: 360, h: 800 },
]

for (const vp of PHONES) {
  for (const state of ['empty', 'one', 'full'] as const) {
    test(`Pilots fits ${vp.w}x${vp.h} with no scroll (${state})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h })
      await mock(page, state)
      await page.goto('/#/people?lane=pilots')

      await expect(page.getByRole('heading', { name: ADVISORY_LABEL })).toBeVisible({ timeout: 15_000 })
      // The counts moved onto the deck's own progress strip rather than
      // spending a band of their own; the empty state has no deck to carry
      // them, so it says the empty line instead.
      if (state === 'empty') {
        await expect(page.getByTestId('pilot-empty')).toBeVisible({ timeout: 15_000 })
      } else {
        await expect(page.getByText(/drafted|listed/).first()).toBeVisible({ timeout: 15_000 })
      }
      if (state !== 'empty') {
        // The deck renders the person, not a PilotCard: the card now lives in
        // the sheet a tap away.
        await expect(page.getByText(state === 'one' ? 'Sam Patel' : 'Alex Morgan'))
          .toBeVisible({ timeout: 15_000 })
      }
      // Let the auto-seed settle so nothing is still mounting when measured.
      await page.waitForTimeout(600)

      await assertNothingOverflows(page, 'main')
    })
  }
}

test('the phone reads the draft in a sheet, not a textarea on the deck', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mock(page, 'one')
  await page.goto('/#/people?lane=pilots')
  await expect(page.getByText('Sam Patel')).toBeVisible({ timeout: 15_000 })

  // Nothing on the stage is an editor. That textarea was the single biggest
  // consumer of vertical space on this lane.
  await expect(page.locator('main textarea')).toHaveCount(0)

  // Tap the card: the full PilotCard opens in a sheet, with the draft behind
  // its own button.
  await page.getByText('Sam Patel').click()
  await expect(page.getByTestId('pilot-sheet')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('pilot-edit-draft').click()
  await expect(page.getByRole('textbox', { name: /draft/i }).or(page.locator('textarea')).first())
    .toBeVisible({ timeout: 10_000 })
})

test('a drafted deal always offers one way to contact the person', async ({ page }) => {
  // The gap this closes: a contact with no email got a written draft, no
  // Gmail link, and no action at all. Sam has an email AND a draft_url, so
  // this asserts the Gmail deep link; contactAction covers the rest.
  await page.setViewportSize({ width: 390, height: 844 })
  await mock(page, 'one')
  await page.goto('/#/people?lane=pilots')
  await page.getByText('Sam Patel').click()
  await expect(page.getByTestId('pilot-sheet')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('pilot-contact')).toBeVisible()
})

test('a stored intent quote is the reason to write, not "no trigger"', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mock(page, 'full')
  await page.goto('/#/people?lane=pilots')
  await expect(page.getByText('Alex Morgan')).toBeVisible({ timeout: 15_000 })

  // LISTED has no researched trigger at all. Before the enrichment was wired
  // through it read "No live trigger found" while this quote sat in its row.
  await expect(page.getByTestId('pilot-why-now')).toContainText('three AI pilots running')
  await expect(page.getByText('No live trigger found')).toHaveCount(0)
})

/**
 * The deck, driven by the keyboard.
 *
 * SwipeDeck binds ArrowLeft/ArrowRight to the identical `flyOut(dir)` the
 * gesture uses, so the keys exercise the real commit path without having to
 * synthesise pointer drags. That is the whole reason to assert on them.
 */
test('the deck shows one person and the right label names what happens next', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mock(page, 'full')
  await page.goto('/#/people?lane=pilots')
  await expect(page.getByText('Alex Morgan')).toBeVisible({ timeout: 15_000 })

  // Two people, one on the stage. The pager is gone.
  await expect(page.getByTestId('pilot-next')).toHaveCount(0)
  await expect(page.getByTestId('pilot-prev')).toHaveCount(0)
  await expect(page.getByText('Sam Patel')).toHaveCount(0)

  // The right action is NAMED for the rung this person is on, never "Advance".
  // Alex is listed, so the forward move is the draft.
  await expect(page.getByRole('button', { name: /Draft it/ })).toBeVisible()
  await assertNothingOverflows(page, 'main')
})

test('a swipe on a listed deal is undoable before it spends anything', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  // Fail the draft route loudly: if the grace window is not honoured the call
  // fires, this 500 surfaces, and the test says so.
  let draftCalls = 0
  await mock(page, 'full')
  await page.route('**/api/pilot-deals/*/draft', (r: Route) => {
    draftCalls += 1
    return r.fulfill({ status: 500, json: { ok: false, error: 'should_not_have_fired' } })
  })

  await page.goto('/#/people?lane=pilots')
  await expect(page.getByText('Alex Morgan')).toBeVisible({ timeout: 15_000 })

  await page.locator('body').press('ArrowRight')
  // The card goes immediately; the spend does not.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible({ timeout: 5_000 })
  await page.getByRole('button', { name: 'Undo' }).click()

  // Undo restores the person and nothing was ever requested.
  await expect(page.getByText('Alex Morgan')).toBeVisible({ timeout: 10_000 })
  expect(draftCalls, 'the draft fired despite Undo').toBe(0)
})

test('a left swipe asks why before it parks anyone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mock(page, 'full')
  let patched = 0
  await page.route('**/api/pilot-deals/*', (r: Route) => {
    if (r.request().method() === 'PATCH') { patched += 1; return r.fulfill({ json: { ok: true } }) }
    return r.fallback()
  })
  await page.goto('/#/people?lane=pilots')
  await expect(page.getByText('Alex Morgan')).toBeVisible({ timeout: 15_000 })

  await page.locator('body').press('ArrowLeft')
  // The reason chips are the verdict; nothing is written until one is chosen.
  await expect(page.getByText(/Cannot buy this|Wrong sector|Bad timing/).first()).toBeVisible({ timeout: 10_000 })
  expect(patched, 'parked before a reason was given').toBe(0)
})

test('a viewport too short for the card degrades to a scroll, not a clip', async ({ page }) => {
  // The failure this guards against is worse than scrolling: an
  // overflow-hidden stage on a very short screen would cut the action row off
  // the bottom, so the primary action would be invisible AND unreachable.
  await page.setViewportSize({ width: 360, height: 640 })
  await mock(page, 'one')
  await page.goto('/#/people?lane=pilots')
  await expect(page.getByText('Sam Patel')).toBeVisible({ timeout: 15_000 })

  // The deck's own control bar is what must stay reachable here.
  const primary = page.getByRole('button', { name: /I sent it/ }).first()
  await primary.scrollIntoViewIfNeeded()
  await expect(primary).toBeVisible()

  // And the window itself still never scrolls: the degradation is contained
  // to the stage, which is the whole point of the app frame.
  const windowScrolls = await page.evaluate(() =>
    document.documentElement.scrollHeight > document.documentElement.clientHeight + 2)
  expect(windowScrolls, 'the window scrolled, which the app frame forbids').toBe(false)
})
