import { test, expect, type Page } from '@playwright/test'
import { answerPilotGate } from './pilot-gate-mock'
import { DECISION_RULES, EXPOSURE_LADDER, LENSES } from '../src/content/focusTheory'
import type { AskSection, StrategistRead, StrategistSection } from '../src/types/strategist'

/**
 * The strategist on the phone (ADR-026), at 390x844 and 360x640 (the phone
 * projects pick this file up by its `-phone.spec.ts` suffix and set the size;
 * this spec never calls setViewportSize).
 *
 * The phone's way in is the + button: CreateSheet, then the house
 * FocusedEditor for the words, then the strategist's full-height BottomSheet
 * once the editor has gone. One sheet at a time, never one inside another.
 *
 * What is measured, not assumed:
 *   - Nothing in the read is laid out past the right edge. A long unbroken
 *     line in a sheet does not scroll the page on a phone; it is simply cut
 *     off, which no other check sees. So every element in the sheet is
 *     measured against the viewport, not only the document's scrollWidth.
 *   - The one move's primary action can be reached and sits inside the screen.
 *   - After the sheet closes, the page still takes taps: the ladder opens its
 *     own editor. A dialog that leaves pointer-events off the body, or an
 *     invisible layer behind, fails here and nowhere else.
 *
 *   - A dictated note survives the editor being swiped away: every change is
 *     kept on the device, not only a Save.
 *
 * Every person and figure below is synthetic. The clock is pinned to a Monday
 * in UTC, because the note's kind chip is inferred from the day.
 */

test.use({ timezoneId: 'UTC' })

const MONDAY = new Date('2026-09-28T10:00:00Z')
const TODAY = '2026-09-28'
const OS_ID = 'os:two-paid-pilots-by-december'
const OS_TITLE = 'Two paid pilots by December'
const NOTE = 'Two calls booked this week is what I want. I keep going back to the deck instead.'

const rule = DECISION_RULES.findIndex(r => r.id === 'private')
const ladder = EXPOSURE_LADDER.find(l => l.level === 6)!

const MOVE: AskSection = {
  kind: 'ask',
  to: {
    kind: 'named',
    person: {
      contact_id: 'c-fixture-riley', name: 'Riley Stone', title: 'Chief operating officer', company: 'Fixture Media',
      best_channel: 'email', email: 'riley@fixture.test', linkedin_url: null,
    },
  },
  line: 'Would you take a short call on Thursday about the pilot?',
  message: 'I am running a three week pilot that shows a leader where their team stands on AI.\nWould you be willing to take a short call on Thursday to see if it fits?\nIf it is not a fit, please say so.',
  why: 'Riley is deciding on AI this quarter and took a call with you in the spring.',
  ladder: { level: ladder.level, request: ladder.request, feared: ladder.feared, learning: ladder.learning },
  lens: 'sell_first',
  job: 'fill_pilots',
  job_note: null,
}

const SECTIONS: StrategistSection[] = [
  {
    kind: 'headline', rule: 'private', rule_n: rule + 1, rule_chip: DECISION_RULES[rule].chip,
    text: 'The week you described is booked calls, and the plan you described is another pass on the deck.',
  },
  { kind: 'heard', text: 'You said you want calls booked this week and that you keep going back to the deck.', trap: null, trap_chip: null, counter_move: null },
  {
    kind: 'lens', lens: 'sell_first', label: LENSES.sell_first.label, rule: LENSES.sell_first.rule, source: LENSES.sell_first.source,
    status: 'move', read: 'No call is booked for this week yet.', missing: 'The ask that books the first one.',
    move: { text: 'Ask one leader who is deciding on AI this quarter for a call on Thursday.', job: 'fill_pilots', by: '2026-10-01', target: null, job_note: null },
  },
  {
    kind: 'objective', text: 'Book two calls with named leaders about the pilot', job: 'fill_pilots',
    serves: OS_ID, serves_title: OS_TITLE, lens: 'sell_first', why: 'It is the week you asked for, in your words.', play: false,
  },
  // The battle plan (2026-10-07): small timed steps under their threads.
  { kind: 'next_step', thread: 'Pilots', when: 'now', minutes: 10, text: 'Send Riley the one-page pilot scope with a Thursday call slot', goal_id: null, job: 'fill_pilots' },
  { kind: 'next_step', thread: 'Publication', when: 'today', minutes: 20, text: 'Post the launch note on LinkedIn with a link to the second edition', goal_id: null, job: null },
  { kind: 'next_step', thread: 'Pilots', when: 'today', minutes: 30, text: 'List fifteen warm names who could take an advisory call', goal_id: null, job: 'fill_pilots' },
  { kind: 'next_step', thread: 'Product samples', when: 'week', minutes: 15, text: 'Order the samples so ad production can start on Friday', goal_id: null, job: null },
  MOVE,
  { kind: 'close', stop: 'Once Riley names a day, stop and confirm it.' },
]

function sse(): string {
  const of = <K extends StrategistSection['kind']>(k: K) => SECTIONS.filter(s => s.kind === k) as Array<Extract<StrategistSection, { kind: K }>>
  const read: StrategistRead = {
    v: 1, shape: 'week_open',
    headline: of('headline')[0], heard: of('heard')[0], lenses: of('lens'), reframe: null,
    objectives: of('objective').map(o => ({ ...o, suggestion_id: 'sug-obj-1' })), progress: [],
    next_steps: of('next_step').map((n, i) => ({ ...n, suggestion_id: `sug-next-${i + 1}` })),
    asks: of('ask').map(a => ({ ...a, suggestion_id: 'sug-ask-1' })),
    worry: null, kill: null, learning: null, close: of('close')[0],
  }
  const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  return [
    ': open\n\n',
    frame('stage', { stage: 'grounding' }),
    frame('stage', { stage: 'thinking' }),
    ...SECTIONS.map((section, index) => frame('section', { index, section })),
    frame('done', { ok: true, read_id: 'read-fixture-1', suggestion_ids: ['sug-obj-1', 'sug-ask-1', 'sug-next-1', 'sug-next-2', 'sug-next-3', 'sug-next-4'], persisted: true, read, notes: [] }),
  ].join('')
}

async function mockAll(page: Page) {
  const posts: Array<Record<string, unknown>> = []

  // Catch-alls FIRST, specific routes LAST (Playwright checks handlers in
  // reverse registration order).
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', r => r.abort())
  await page.route('**/api/**', r => r.fulfill({ json: { ok: true } }))

  await page.clock.setFixedTime(MONDAY)
  await answerPilotGate(page, 'UTC')

  const os = [{
    id: OS_ID, title: OS_TITLE, horizon: 'os', parent_id: null, venture: null, status: 'active', job: null,
    priority: null, why_now: null, definition_of_done: null, target_horizon: null,
    is_stale: false, orphaned: false, days_since_touch: 1, stale_after_days: 90,
    week_start: null, closed_at: null, carried_from: null,
    updated_at: MONDAY.toISOString(), created_at: MONDAY.toISOString(),
  }]
  await page.route('**/api/goals/ladder*', r => r.fulfill({ json: {
    ok: true, horizons: ['os', 'weekly'], by_horizon: { os, weekly: [] }, goals: os,
    stale_count: 0, orphan_count: 0, ventures: [], current_week: TODAY, last_week: [],
  } }))

  await page.route('**/api/strategist*', r => {
    if (r.request().method() === 'GET') {
      return r.fulfill({ json: { ok: true, read: null, last_attempt_at: null, last_status: null } })
    }
    posts.push(JSON.parse(r.request().postData() || '{}'))
    return r.fulfill({ status: 200, contentType: 'text/event-stream', body: sse() })
  })

  await page.route('**/api/pilot/asks*', r => r.fulfill({ json: { ok: true, today_ask: null, unresolved: null, today: TODAY } }))

  return posts
}

test('the + sheet, then the editor, then the read: nothing past the edge, and the page still answers', async ({ page }) => {
  const posts = await mockAll(page)
  const vw = page.viewportSize()!.width

  await page.goto('/#/home')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByTestId('create-strategist').click()

  // The words go in through the house editor, with the kind his to pick
  // before anything runs.
  const editor = page.getByRole('dialog', { name: 'Tell Marcus how it is going' })
  await expect(editor).toBeVisible()
  await expect(editor.getByRole('button', { name: 'Starting the week', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await editor.locator('textarea').fill(NOTE)
  await editor.getByRole('button', { name: 'Send to Marcus' }).click()

  // Then the sheet, once the editor has gone: one dialog, never two.
  const sheet = page.getByTestId('strategist-sheet')
  await expect(sheet).toBeVisible()
  await expect(editor).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByTestId('strategist-read')).toHaveAttribute('data-complete', 'true')
  expect(posts).toHaveLength(1)
  expect(posts[0]).toMatchObject({ source: 'note', kind: 'week_open', body: NOTE })
  await expect(page.getByTestId('strategist-you-said')).toContainText(NOTE)

  // The plan reads start here, today, this week, each step with its thread
  // and its time box, and a day's total on the group.
  const plan = page.getByTestId('strategist-plan')
  await expect(plan.locator('[data-testid^="strategist-plan-"]')).toHaveCount(3)
  const order = await plan.locator('[data-testid^="strategist-plan-"]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.testid))
  expect(order).toEqual(['strategist-plan-now', 'strategist-plan-today', 'strategist-plan-week'])
  await expect(page.getByTestId('strategist-plan-today')).toContainText('Today · 50 min')
  await expect(page.getByTestId('strategist-next-1')).toContainText('Publication · 20 min')
  await page.getByTestId('strategist-plan').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `test-results/battle-plan-${page.viewportSize()!.width}.png` })

  // No horizontal overflow, measured element by element.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0)
  // Two measures, because they miss different things. A box can sit inside
  // the screen while its words run out of it (a line that will not wrap
  // spills past its own box, and the box's rect never shows it), so the text
  // itself is measured too, line box by line box.
  const pastEdge = await sheet.evaluate((root, width) => {
    const out: string[] = []
    const off = (r: DOMRect) => r.width > 0 && r.height > 0 && (r.right > width + 0.5 || r.left < -0.5)
    for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
      const r = el.getBoundingClientRect()
      if (off(r)) {
        const id = (el as HTMLElement).dataset.testid
        out.push(`box ${el.tagName.toLowerCase()}${id ? `[${id}]` : ''} ${Math.round(r.left)}..${Math.round(r.right)}`)
      }
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      const spill = Array.from(range.getClientRects()).find(off)
      if (spill) out.push(`text "${n.textContent.trim().slice(0, 40)}" ${Math.round(spill.left)}..${Math.round(spill.right)}`)
    }
    return out
  }, vw)
  expect(pastEdge, `laid out past the ${vw}px edge`).toEqual([])

  // The one move's primary action is reachable and sits inside the screen.
  const make = page.getByTestId('strategist-move').getByRole('button', { name: 'Make it today’s ask' })
  await make.scrollIntoViewIfNeeded()
  const box = (await make.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(vw)

  // Close it the way a thumb does: the scrim above the sheet.
  await page.touchscreen.tap(Math.round(vw / 2), 8)
  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => getComputedStyle(document.body).pointerEvents)).not.toBe('none')

  // The ladder still responds: tapping the OS goal opens its own editor.
  await page.getByRole('button', { name: OS_TITLE }).click()
  await expect(page.getByRole('dialog', { name: 'OS goal' })).toBeVisible()
})

test('a dictated note survives the editor being swiped away, and the kind is picked before it runs', async ({ page }) => {
  const posts = await mockAll(page)
  const vw = page.viewportSize()!.width

  await page.goto('/#/home')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByTestId('create-strategist').click()
  const editor = page.getByRole('dialog', { name: 'Tell Marcus how it is going' })
  await expect(editor).toBeVisible()
  await editor.locator('textarea').fill(NOTE)

  // Dismissed the way a thumb does, with no Save: nothing runs, nothing is lost.
  await page.touchscreen.tap(Math.round(vw / 2), 8)
  await expect(editor).toHaveCount(0)
  expect(posts).toHaveLength(0)

  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByTestId('create-strategist').click()
  await expect(editor).toBeVisible()
  await expect(editor.locator('textarea')).toHaveValue(NOTE)

  // The kind is chosen here, before the one run it pays for.
  await editor.getByRole('button', { name: 'Progress', exact: true }).click()
  await editor.getByRole('button', { name: 'Send to Marcus' }).click()
  await expect(page.getByTestId('strategist-sheet')).toBeVisible()
  await expect.poll(() => posts.length).toBe(1)
  expect(posts[0]).toMatchObject({ source: 'note', kind: 'update', body: NOTE })
})
