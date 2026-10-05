import type { Locator, Page, Route } from '@playwright/test'
import { mockAudit, DAILY_MOVE, GOAL_LADDER, goal, isDailyMoveRead } from './audit'

/**
 * Today's move (ADR-028) on Home, over the populated audit fixture, with the
 * three writes it can cause captured rather than swallowed by the catch-all:
 * the slot write when he takes it, the verdict on every answer, and any POST
 * to the strategist (there must be none: the move was written this morning,
 * and reading it never pays for a model call).
 *
 * Today's row is stateful. Empty until a slot write, then it holds what was
 * written, so "Take it" can be seen landing in slot 1 as his. `focusDelayMs`
 * slows the row's read the way a real network does; a slot that blinks empty
 * between the write and the read only shows up with a gap to blink in.
 */

export const MOVES = DAILY_MOVE.read.read.next_steps
export const CHALLENGE = DAILY_MOVE.read.read.challenge

export interface DailyMoveWrites {
  slots: Array<Record<string, unknown>>
  verdicts: Array<Record<string, unknown>>
  strategistPosts: number
}

function focusRow(date: string, slot: number, text: string) {
  const at = new Date().toISOString()
  return {
    id: 'focus-fixture', focus_date: date, status: 'pending', calibrated_at: null, completed_at: null,
    carried_from_date: null, relevance_index: {}, marcus_suggestions: [], created_at: at, updated_at: at,
    target_1_text: null, target_1_completed_at: null, target_1_source: null,
    target_2_text: null, target_2_completed_at: null, target_2_source: null,
    target_3_text: null, target_3_completed_at: null, target_3_source: null,
    [`target_${slot}_text`]: text,
  }
}

export async function mockDailyMove(page: Page, opts: { focusDelayMs?: number } = {}): Promise<DailyMoveWrites> {
  await mockAudit(page)
  const writes: DailyMoveWrites = { slots: [], verdicts: [], strategistPosts: 0 }
  let row: ReturnType<typeof focusRow> | null = null

  // Registered after mockAudit, so these are matched before its catch-alls.
  await page.route('**/rest/v1/daily_focus*', async (r: Route) => {
    const asked = (new URL(r.request().url()).searchParams.get('focus_date') || '').replace(/^eq\./, '')
    if (opts.focusDelayMs) await new Promise(res => setTimeout(res, opts.focusDelayMs))
    return r.fulfill({ json: row && row.focus_date === asked ? [row] : [] })
  })
  await page.route('**/api/daily-focus/slot', (r: Route) => {
    const body = JSON.parse(r.request().postData() || '{}')
    writes.slots.push(body)
    row = focusRow(String(body.date), Number(body.slot), String(body.text))
    return r.fulfill({ json: { ok: true } })
  })
  await page.route('**/api/suggestions/verdict', (r: Route) => {
    writes.verdicts.push(JSON.parse(r.request().postData() || '{}'))
    return r.fulfill({ json: { ok: true } })
  })
  await page.route(url => url.pathname === '/api/strategist', (r: Route) => {
    if (r.request().method() !== 'POST') return r.fallback()
    writes.strategistPosts += 1
    return r.fulfill({ status: 500, json: { ok: false, error: 'not_in_this_test' } })
  })
  return writes
}

/**
 * Counts every moment slot 1 is an empty bar from now on. Taking the move has
 * to go from the proposal straight to his slot: an empty first slot between
 * the two reads as the move vanishing.
 */
export async function watchSlotOneEmpty(page: Page): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    const w = window as unknown as { __slotOneEmpty: number }
    w.__slotOneEmpty = 0
    new MutationObserver(() => {
      if (document.querySelector('button[aria-label="Set target 1"]')) w.__slotOneEmpty += 1
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label'] })
  })
  return () => page.evaluate(() => (window as unknown as { __slotOneEmpty: number }).__slotOneEmpty)
}

/**
 * Everything inside `root` laid out past [left, right]: boxes, and text line
 * by line, because a line that will not wrap spills past its own box and the
 * box's rect never shows it.
 */
export function pastEdges(root: Locator, left: number, right: number): Promise<string[]> {
  return root.evaluate((el, [l, rt]) => {
    const out: string[] = []
    const off = (r: DOMRect) => r.width > 0 && r.height > 0 && (r.right > rt + 0.5 || r.left < l - 0.5)
    for (const n of [el, ...Array.from(el.querySelectorAll('*'))]) {
      const r = n.getBoundingClientRect()
      if (off(r)) {
        const id = (n as HTMLElement).dataset.testid
        out.push(`box ${n.tagName.toLowerCase()}${id ? `[${id}]` : ''} ${Math.round(r.left)}..${Math.round(r.right)}`)
      }
    }
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(t)
      const spill = Array.from(range.getClientRects()).find(off)
      if (spill) out.push(`text "${t.textContent.trim().slice(0, 40)}" ${Math.round(spill.left)}..${Math.round(spill.right)}`)
    }
    return out
  }, [left, right] as const)
}

/**
 * Whether a tap at the centre of `target` lands on it. A control under the
 * phone's bottom bar, or under any layer, is on screen and still unreachable.
 *
 * It retries for up to a second, because an overlay opening is not a cover:
 * for a frame or two of a sheet's entrance its content takes no pointer
 * events, and a single hit test reports whatever is underneath. Something that
 * really covers the control still covers it a second later. It never scrolls
 * anything into view, which on a stage that may not scroll would hide the
 * very thing it exists to find.
 */
export async function landsOn(target: Locator): Promise<boolean> {
  await settled(target.page())
  return target.evaluate(el => new Promise<boolean>(resolve => {
    const t0 = performance.now()
    const tryHit = () => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      if (hit && (hit === el || el.contains(hit))) { resolve(true); return }
      if (performance.now() - t0 > 1000) { resolve(false); return }
      requestAnimationFrame(tryHit)
    }
    tryHit()
  }))
}

// ── The longest honest morning ──────────────────────────────────────────────

const LONG_MOVE = 'Ask the operating chief who is deciding on AI this quarter for a twenty-minute call this week about buying the three-week pilot, and offer two times on Thursday so the reply is a yes or a no rather than a search for a date that suits both.'

/**
 * What the no-scroll gates prove Home folds to fit: a move at the 240
 * character cap with a long name and title, a long reason and a long
 * objection; five weekly rows; two drafted approaches; and a due test with its
 * calibration line. A fixture shorter than real life proves nothing about real
 * life, which is how Home's canon passed at 360x640 for a week while a real
 * one pushed its primary action off the screen. Every person is synthetic.
 */
export function worstMove() {
  const d = structuredClone(DAILY_MOVE)
  const first = d.read.read.next_steps[0]
  first.text = LONG_MOVE
  first.why = 'A call with someone who can buy is the one thing the stop rule counts, none is booked this week, and the operating chief is the person deciding on AI spend for the whole group this quarter.'
  first.person = {
    ...first.person,
    name: 'Alexandra Montgomery-Whitfield',
    title: 'Chief operating officer and head of group transformation',
    company: 'Fixture Media Holdings International',
  }
  d.read.read.challenge.objection = 'The drafted introduction to the agency partnerships lead is warmer, already written and waiting, while a cold ask to an operating chief needs a first reply before it can become a call this week.'
  return d
}

export async function mockWorstMorning(page: Page): Promise<DailyMoveWrites> {
  const writes = await mockDailyMove(page)
  const today = new Date().toISOString().slice(0, 10)
  await page.route(isDailyMoveRead, (r: Route) => r.fulfill({ json: worstMove() }))
  await page.route('**/api/pilot-deals*', (r: Route) => r.fulfill({ json: { ok: true, stateCounts: { drafted: 2 } } }))
  await page.route('**/api/pilot/worries*', (r: Route) => r.fulfill({ json: {
    ok: true,
    due: [{
      id: 'w-fixture-1', test_due_date: today, test_plan: 'Count the replies on Friday.',
      prediction: 'If I send the five drafted approaches this week, at least two of them will turn into a call before the stop rule reads on Monday.',
    }],
    calibration: { total_closed: 6, pct_confirmed: 50, pct_disconfirmed: 33, pct_partial: 17 },
    open_test_count: 1, cap: 5, today,
  } }))
  await page.route('**/api/goals/ladder*', (r: Route) => r.fulfill({ json: {
    ok: true,
    by_horizon: {
      os: [
        goal('os-1', 'Twenty-five paid advisory rooms by the end of the quarter, each with a named buyer', 'os'),
        goal('os-2', 'One piece a week that a buyer forwards to their board without being asked', 'os'),
        goal('os-3', 'The OS runs a full week without Krish touching a workflow or a queue', 'os'),
      ],
      weekly: [
        goal('wk-1', 'Send fifteen approaches to the judgment-economy list and log every reply', 'weekly'),
        goal('wk-2', 'Publish the verification-gap essay and pitch it to three newsletters', 'weekly'),
        goal('wk-3', 'Book two calls with operating chiefs who are deciding on AI this quarter', 'weekly'),
        goal('wk-4', 'Close the Sifted CFP with the judgment-economy talk', 'weekly', { status: 'done' }),
        goal('wk-5', 'Rewrite the pilot one-pager around the three-week shape', 'weekly', { status: 'done' }),
      ],
    },
    ventures: ['mindmake', 'ctrl'], stale_count: 0, orphan_count: 0,
    // The real endpoint always says which week is current, and the rows above
    // carry that same week. Without it the app falls back to the PINNED
    // browser clock (a fixed Wednesday) while the rows carry the runner's real
    // Monday, so from the first Monday after that Wednesday the five rows stop
    // counting as this week's and an extra "Set this week's 3" ask appears
    // that no real morning shows (2026-10-05: four red phone tests).
    week_of: GOAL_LADDER.week_of, current_week: GOAL_LADDER.current_week,
  } }))
  return writes
}

/**
 * Everything on Home that scrolls or is cut off; empty when Home is whole.
 * Krish, 2026-10-03: "no scroll guaranteed everywhere". It checks the window,
 * every stage's own box (a stage reporting overrun spent every fold and still
 * did not fit), and every element on the page that could scroll, including an
 * open sheet. It refuses to pass when there is no stage to measure.
 */
export async function homeScrolls(page: Page): Promise<string[]> {
  await settled(page)
  return page.evaluate(() => {
    const out: string[] = []
    const ws = Math.max(document.documentElement.scrollHeight - innerHeight, document.body.scrollHeight - innerHeight, 0)
    if (ws > 2) out.push(`the window scrolls ${ws}px`)
    const stages = Array.from(document.querySelectorAll('[data-testid="home-stage"], [data-testid="home-rail"]')) as HTMLElement[]
    if (!stages.length) out.push('no stage on the page to measure')
    for (const st of stages) {
      if (st.dataset.fit !== 'fit') out.push(`${st.dataset.testid} spent every fold and still overran`)
      const over = st.scrollHeight - st.clientHeight
      if (over > 1) out.push(`${st.dataset.testid} is ${over}px past its own box`)
    }
    for (const el of Array.from(document.body.querySelectorAll('*')) as HTMLElement[]) {
      const cs = getComputedStyle(el)
      if (!/(auto|scroll)/.test(cs.overflowY)) continue
      const over = el.scrollHeight - el.clientHeight
      if (over > 1 && el.getClientRects().length) {
        out.push(`scrolls ${over}px: ${el.dataset.testid || el.getAttribute('aria-label') || el.className.toString().slice(0, 48)}`)
      }
    }
    return out
  })
}

/** The fold level the stage settled on, for the report. */
export function foldLevel(page: Page): Promise<number> {
  return page.getByTestId('home-stage').evaluate(el => Number((el as HTMLElement).dataset.foldLevel || 0))
}

/**
 * Waits until the page has painted twice with nothing moving: what a person
 * sees, not the layout between a state change and the refit that answers it.
 * A stage refits in the observer step of the frame after a change, before
 * paint, so a check that runs inside that gap measures a layout no one ever
 * sees. A sheet sliding in is the other thing worth waiting out.
 */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => {
    let last = ''
    let still = 0
    let frames = 0
    const tick = () => {
      const stage = document.querySelector('[data-testid="home-stage"]') as HTMLElement | null
      const moving = Array.from(document.querySelectorAll('[role="dialog"]')).map(d => {
        const r = d.getBoundingClientRect()
        return `${Math.round(r.top)}:${Math.round(r.height)}`
      }).join('|')
      const sig = `${stage?.dataset.foldLevel}|${stage?.scrollHeight}|${moving}`
      still = sig === last ? still + 1 : 0
      last = sig
      if (still >= 2 || ++frames > 90) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }))
}
