import { expect, type Page } from '@playwright/test'

/**
 * Layout probes, shared by every no-scroll and desk spec.
 *
 * These exist because the audit shipped on 2026-09-17 was verified with the
 * wrong instrument. The old measure was "percent of viewport width occupied",
 * computed from the bounding box of all rendered content. A full-width header
 * above one narrow card scores 96% and still looks half empty — which is
 * exactly what Advisory looked like in the screenshot that came back. The
 * metric rewarded filling space and could not see using it badly.
 *
 * So these probes measure failures a human can point at in a screenshot:
 * a hole in the layout, text squeezed to one word per line, a scroll box
 * inside a scroll box, and a raw error string on screen.
 */

// ── nothing overflows ───────────────────────────────────────────────────────

/**
 * No descendant of `frameSelector` is an overflowing scroll container.
 *
 * A line-clamped element legitimately has scrollHeight > clientHeight: the
 * clamp is the whole point and the overflow is never reachable. Everything
 * else that hides its own overflow is either clipping content or scrolling in
 * place, and both are the same defect from the chair.
 */
export async function assertNothingOverflows(page: Page, frameSelector: string) {
  const offender = await page.evaluate((sel) => {
    const frame = document.querySelector(sel)
    if (!frame) return 'FRAME NOT FOUND'
    const bad: string[] = []
    const check = (el: Element) => {
      const he = el as HTMLElement
      // A screen-reader-only input is a 1px box holding a label on purpose,
      // and a `data-crop` element is a window onto a sprite that is meant to
      // be bigger than its frame (the series wordmarks). Neither is a layout
      // fault, and both have to opt out explicitly rather than by class name.
      if (he.matches('.sr-only, [data-crop], [data-crop] *')) return
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
  expect(offender, `overflowing element inside ${frameSelector}: ${offender}`).toBeNull()
}

// ── one word per line ───────────────────────────────────────────────────────

/**
 * Text that has been squeezed narrower than it can be read.
 *
 * The Content rail shipped a card whose text column resolved to about 40px
 * while its button row kept `flex-shrink-0`, so the headline rendered one word
 * to a line under the buttons. Nothing caught it, because every existing check
 * looked at the container and the container was fine.
 *
 * A wrapped element is squeezed when it lays out over three or more lines in
 * less than `minWidth` of horizontal room. A short unwrapped label is not: a
 * 30px "12" is a number, not a failure, so only elements that actually wrap
 * count.
 */
export async function squeezedText(page: Page, frameSelector: string, minWidth = 90) {
  return page.evaluate(({ sel, minWidth }) => {
    const frame = document.querySelector(sel)
    if (!frame) return ['FRAME NOT FOUND']
    const bad: string[] = []
    const walk = (el: Element) => {
      const he = el as HTMLElement
      // Only leaves that own their text. A parent's width says nothing about
      // how its children were allowed to wrap.
      const ownText = Array.from(he.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent || '').join(' ').trim()
      const box = he.getBoundingClientRect()
      if (ownText && ownText.includes(' ') && box.width > 0 && box.width < minWidth) {
        const cs = getComputedStyle(he)
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4
        const lines = lh > 0 ? Math.round(box.height / lh) : 1
        if (lines >= 3) {
          bad.push(`${he.tagName} "${ownText.slice(0, 40)}" is ${Math.round(box.width)}px over ${lines} lines`)
        }
      }
      for (const c of Array.from(he.children)) walk(c)
    }
    walk(frame)
    return bad
  }, { sel: frameSelector, minWidth })
}

export async function assertNoSqueezedText(page: Page, frameSelector: string, minWidth = 90) {
  const bad = await squeezedText(page, frameSelector, minWidth)
  expect(bad, `text squeezed to a column inside ${frameSelector}:\n${bad.join('\n')}`).toEqual([])
}

// ── scroll boxes inside scroll boxes ────────────────────────────────────────

/**
 * Every element under `frameSelector` that can scroll AND has something to
 * scroll. One is a stage. Two nested is the "horrible box scrolling" Krish
 * named on Advisory: the wheel does something different depending on where the
 * pointer happens to be.
 */
export async function scrollContainers(page: Page, frameSelector: string) {
  return page.evaluate((sel) => {
    const frame = document.querySelector(sel)
    if (!frame) return ['FRAME NOT FOUND']
    const found: string[] = []
    const walk = (el: Element) => {
      const he = el as HTMLElement
      const cs = getComputedStyle(he)
      const scrolls = (cs.overflowY === 'auto' || cs.overflowY === 'scroll')
      if (scrolls && he.scrollHeight > he.clientHeight + 2) {
        found.push(`${he.tagName}.${String(he.className).slice(0, 60)}`)
      }
      for (const c of Array.from(he.children)) walk(c)
    }
    walk(frame)
    return found
  }, frameSelector)
}

// ── the hole in the layout ──────────────────────────────────────────────────

/**
 * The largest rectangle inside `frameSelector` that nothing is painted into,
 * as a fraction of the frame's area.
 *
 * This is the probe that would have caught Advisory. `grid-cols-1 xl:grid-cols-2`
 * over one drafted deal renders track two empty, so half the desk is a hole —
 * while a bounding-box measure reports the content as filling the width,
 * because the header above it does.
 *
 * Computed on a coarse grid: mark every cell any visible leaf occupies, then
 * find the largest all-empty axis-aligned rectangle by the standard
 * histogram sweep. Coarse on purpose — this is looking for half a screen, not
 * for a 12px gutter.
 */
export async function largestHole(page: Page, frameSelector: string, cell = 24) {
  return page.evaluate(({ sel, cell }) => {
    const frame = document.querySelector(sel) as HTMLElement | null
    if (!frame) return { fraction: 0, rect: null as null | { x: number; y: number; w: number; h: number } }

    // Collect what is actually painted first, then measure the hole inside the
    // box that content occupies — not inside the whole frame.
    //
    // The distinction matters. Empty space BELOW the last card of a short list
    // is not waste: one deal is one deal. Empty space BESIDE it is, and that is
    // what an `xl:grid-cols-2` over one item produces. Gridding the whole frame
    // conflates the two and fails a correct layout for being short, which is a
    // metric that teaches padding.
    type R = { left: number; top: number; right: number; bottom: number }
    const painted: R[] = []
    const push = (r: DOMRect) => painted.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
    const walk = (el: Element) => {
      const he = el as HTMLElement
      const cs = getComputedStyle(he)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return
      const leaf = he.children.length === 0
      const bordered = cs.borderTopWidth !== '0px' || cs.borderLeftWidth !== '0px'
      if (leaf || bordered) {
        const r = he.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          // A bordered container marks its edges, never its middle: the middle
          // is its children's to claim or to leave as a hole.
          if (leaf) push(r)
          else {
            push(new DOMRect(r.left, r.top, r.width, 2))
            push(new DOMRect(r.left, r.bottom - 2, r.width, 2))
            push(new DOMRect(r.left, r.top, 2, r.height))
            push(new DOMRect(r.right - 2, r.top, 2, r.height))
          }
        }
      }
      for (const c of Array.from(he.children)) walk(c)
    }
    walk(frame)
    if (!painted.length) return { fraction: 0, rect: null }

    const fr = frame.getBoundingClientRect()
    const fb = {
      left: Math.max(fr.left, Math.min(...painted.map(r => r.left))),
      top: Math.max(fr.top, Math.min(...painted.map(r => r.top))),
      right: Math.min(fr.right, Math.max(...painted.map(r => r.right))),
      bottom: Math.min(fr.bottom, Math.max(...painted.map(r => r.bottom))),
    }
    const cols = Math.max(1, Math.floor((fb.right - fb.left) / cell))
    const rows = Math.max(1, Math.floor((fb.bottom - fb.top) / cell))
    const grid: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0))
    for (const r of painted) {
      const x0 = Math.floor((r.left - fb.left) / cell), x1 = Math.ceil((r.right - fb.left) / cell)
      const y0 = Math.floor((r.top - fb.top) / cell), y1 = Math.ceil((r.bottom - fb.top) / cell)
      for (let y = Math.max(0, y0); y < Math.min(rows, y1); y++) {
        for (let x = Math.max(0, x0); x < Math.min(cols, x1); x++) grid[y][x] = 1
      }
    }

    // Largest all-zero rectangle, histogram sweep per row.
    const heights = new Array(cols).fill(0)
    let best = 0, bestRect: { x: number; y: number; w: number; h: number } | null = null
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) heights[x] = grid[y][x] ? 0 : heights[x] + 1
      const stack: number[] = []
      for (let x = 0; x <= cols; x++) {
        const h = x === cols ? 0 : heights[x]
        while (stack.length && heights[stack[stack.length - 1]] >= h) {
          const top = stack.pop() as number
          const left = stack.length ? stack[stack.length - 1] + 1 : 0
          const area = heights[top] * (x - left)
          if (area > best) {
            best = area
            bestRect = { x: left * cell, y: (y - heights[top] + 1) * cell, w: (x - left) * cell, h: heights[top] * cell }
          }
        }
        stack.push(x)
      }
    }
    return { fraction: best / (rows * cols), rect: bestRect }
  }, { sel: frameSelector, cell })
}

// ── raw machine strings on screen ───────────────────────────────────────────

/**
 * Text no reader should ever be shown: an HTTP status stringified as a word, a
 * Postgres constraint message, or a SCREAMING_SNAKE identifier.
 *
 * `http_200` is in here by name. It is what Krish read on 2026-09-17 under
 * "Investigations failed on its last run", and it is the status code of a
 * SUCCESSFUL transport — a message that was not just ugly but false.
 */
export const RAW_ERROR = /http_\d{3}|violates [a-z-]+ constraint|\b[A-Z][A-Z_]{7,}\b|\[object Object\]|undefined is not|NaN%|Minified React error|failed to render/

export async function rawErrorStrings(page: Page, frameSelector: string) {
  return page.evaluate(({ sel, src }) => {
    const re = new RegExp(src)
    const frame = document.querySelector(sel)
    if (!frame) return ['FRAME NOT FOUND']
    const hits: string[] = []
    const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT)
    let n: Node | null
    while ((n = walker.nextNode())) {
      const t = (n.textContent || '').trim()
      if (t && re.test(t)) hits.push(t.slice(0, 120))
    }
    return hits
  }, { sel: frameSelector, src: RAW_ERROR.source })
}

export async function assertNoRawErrors(page: Page, frameSelector: string) {
  const hits = await rawErrorStrings(page, frameSelector)
  expect(hits, `machine strings rendered to the reader:\n${hits.join('\n')}`).toEqual([])
}

/**
 * The surface rendered at all.
 *
 * Every other probe in this file passes cleanly against an error boundary: a
 * crashed tab has no scroll boxes, no squeezed text and no holes worth the
 * name. The first run of the Content desk spec came back green on four of six
 * probes while the tab was showing "Content failed to render". Assert this
 * before asserting anything else.
 */
export async function assertRendered(page: Page, frameSelector: string) {
  const crashed = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    const text = el?.textContent || ''
    return /failed to render|Minified React error|Something went wrong/i.test(text) ? text.slice(0, 200) : null
  }, frameSelector)
  expect(crashed, `${frameSelector} is showing an error boundary: ${crashed}`).toBeNull()
}

// ── the page itself does not scroll ─────────────────────────────────────────

export async function assertFrameDoesNotScroll(page: Page, frameSelector: string) {
  const over = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null
    if (!el) return -1
    return el.scrollHeight - el.clientHeight
  }, frameSelector)
  expect(over, `${frameSelector} is ${over}px taller than its own box`).toBeLessThanOrEqual(2)
}
