import type { Locator, Page, Route } from '@playwright/test'
import { mockAudit, DAILY_MOVE } from './audit'

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
 */
export function landsOn(target: Locator): Promise<boolean> {
  return target.evaluate(el => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return Boolean(hit && (hit === el || el.contains(hit)))
  })
}
