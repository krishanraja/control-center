import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

/**
 * How many rows of a list actually fit the box it is in.
 *
 * The Content desk is a no-scroll surface (Krish, 2026-09-17), which means the
 * work has to be paged rather than piled. Paging needs a page size, and every
 * cheap way of guessing one is wrong: a constant cap ignores the viewport, and
 * dividing the box height by an assumed row height clips the last row whenever
 * a card runs a line long. Clipping is the exact complaint this is meant to
 * answer, so a guess is not good enough.
 *
 * So it measures. Render a page, compare the list's real height to the box's,
 * and step by one row in whichever direction is wrong.
 *
 * ── Two things that are easy to get wrong ───────────────────────────────
 *
 * `step` is the column count. In a two-column grid, going from four cards to
 * five starts a third ROW, which costs a full row of height rather than the
 * average per-card height — and an average is what `used / shown` gives you.
 * Stepping by the column count keeps the arithmetic honest and the last row
 * full.
 *
 * `ceiling` remembers the smallest count that was measured as overflowing, and
 * nothing is ever allowed back up to it. Without it the search oscillates:
 * grow because there is slack, shrink because the new row does not fit, grow
 * again, forever — and it settles wherever the pass budget happens to run out,
 * which at 1920 left a third of the desk empty and a whole row of cards unshown.
 */
export function useFitRows(total: number, { min = 1, max = 50, step = 1 }: {
  min?: number
  max?: number
  /** Cards per row. The search moves a whole row at a time. */
  step?: number
} = {}) {
  const boxRef = useRef<HTMLElement | null>(null)
  const listRef = useRef<HTMLElement | null>(null)
  const passes = useRef(0)
  const ceiling = useRef(Infinity)
  // Whole rows. A grid fills left to right, so a count that is not a multiple
  // of the column count leaves a ragged last row — and, worse, a search that
  // steps by two from an odd start only ever tries odd counts. At 1920 that
  // showed three cards in a two-column grid with room for four.
  const align = useCallback((n: number) => {
    const capped = Math.min(n, total, max)
    if (capped >= total) return total
    return Math.max(min, Math.floor(capped / step) * step || step)
  }, [total, max, min, step])
  const [count, setCount] = useState(() => Math.min(total, max))
  /** The box's own width, so a caller can pick a column count from the space
   *  it actually has. A `min-[1700px]:` breakpoint would be a VIEWPORT query,
   *  and a viewport query is how a 320px rail ended up laying its cards out
   *  for a 768px body. */
  const [width, setWidth] = useState(0)
  /** Bumped by every restart. A restart usually sets `count` back to the value
   *  it already holds, and React bails out of a same-value setState, so without
   *  this the render that would have re-measured never happens and the search
   *  stops wherever it was. */
  const [, setNonce] = useState(0)

  const measure = useCallback(() => {
    const box = boxRef.current, list = listRef.current
    if (!box || !list) return
    const room = box.clientHeight
    if (room <= 0) return
    const used = list.scrollHeight
    const shown = Math.min(count, total)
    if (used > room && shown > min) {
      ceiling.current = Math.min(ceiling.current, shown)
      setCount(align(shown - step))
      return
    }
    const rows = Math.max(1, Math.ceil(shown / step))
    const rowH = used / rows
    // The last row is allowed to be partial: with eleven cards in two columns
    // the sixth row holds one, and refusing it to keep the grid square would
    // hide a card for tidiness.
    const next = Math.min(shown + step, total, max)
    if (next > shown && next < ceiling.current && room - used >= rowH && rowH > 0) {
      setCount(next)
    }
  }, [count, total, min, max, step])

  useLayoutEffect(() => {
    if (passes.current++ > 24) return
    measure()
  })

  // A resize starts the search again from scratch rather than nudging from
  // wherever the last viewport left it, which is both faster and stable.
  //
  // It reads the list's length through a ref, so the callback, and the effects
  // that depend on it, do not change identity every time the length does.
  const latest = useRef({ align, total })
  latest.current = { align, total }
  const restart = useCallback(() => {
    passes.current = 0
    ceiling.current = Infinity
    setCount(latest.current.align(Math.min(latest.current.total, max)))
    setNonce(n => n + 1)
  }, [max])

  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { restart(); setWidth(box.clientWidth) })
    ro.observe(box)
    setWidth(box.clientWidth)
    return () => ro.disconnect()
  }, [restart])

  // A changed column count is a new search.
  useLayoutEffect(() => { restart() }, [restart, step])

  // A changed list LENGTH is not (2026-10-04). It used to be: every refetch
  // that added or removed one idea reset the page size and re-measured over up
  // to 24 layout passes, and with the page number kept, the cards on screen
  // slid along under him. Now the page size he is looking at stays, and the
  // measure gets a fresh pass budget, so it can still take a row that newly
  // fits or give back one that no longer does. The first data to arrive is
  // still a new search, since there was nothing measured before it.
  const lastTotal = useRef(total)
  useLayoutEffect(() => {
    const was = lastTotal.current
    lastTotal.current = total
    if (was === total) return
    if (was === 0) { restart(); return }
    passes.current = 0
    setNonce(n => n + 1)
  }, [total, restart])

  return {
    count: Math.max(min, Math.min(count, total)),
    width,
    // Typed loosely on purpose: the box is a div and the list is a ul, and a
    // hook that only fits one tag is a hook that gets copied.
    boxRef: boxRef as React.MutableRefObject<never>,
    listRef: listRef as React.MutableRefObject<never>,
  }
}

/**
 * How far a stage has to fold its content to fit the box it is in.
 *
 * useFitRows answers "how many rows fit". This answers the same question for a
 * stage whose content is not rows: Home, which may neither scroll nor clip
 * (Krish, 2026-10-03: "no scroll guaranteed everywhere"). Its content is free
 * text of any length, so no fixed layout can promise that. A goal written the
 * long way, or a move of 240 characters, runs past any budget picked in
 * advance. So it folds, measured the same way: render, compare the content's
 * real height to the box's, and step. Level 0 folds nothing, and each level
 * folds one more thing, in an order the caller owns.
 *
 * It climbs in layout effects, so every step lands before the browser paints:
 * nothing is ever seen overflowing, and nothing is seen folding.
 *
 * It starts again from level 0 whenever the box or its content changes size (a
 * rotated phone, the canon arriving, a section he opened), because the level
 * yesterday's content needed can be more than today's needs. The restart
 * converges: the same content in the same box climbs to the same level, which
 * leaves every size where it was, so the observers fall quiet.
 *
 * `overrun` is the last resort, and the no-scroll gates fail if it is ever true
 * at a supported size. When every fold is spent and the content still does not
 * fit, the box scrolls rather than hide anything (DESIGN_SYSTEM.md: a stage
 * that overruns must scroll, not clip).
 */
export function useFitFolds(levels: number, reset?: unknown) {
  // Elements, not ref objects: a stage often mounts after a skeleton, and an
  // observer set up against an empty ref watches nothing for the life of the
  // page. Holding the elements in state re-attaches it when they appear.
  const [box, setBox] = useState<HTMLElement | null>(null)
  const [content, setContent] = useState<HTMLElement | null>(null)
  const [level, setLevel] = useState(0)
  const [overrun, setOverrun] = useState(false)
  // Bumped by every restart, for the same reason as useFitRows' nonce: a
  // restart often sets level to the 0 it already holds, React skips a
  // same-value update, and the render that would have measured never happens.
  const [, setNonce] = useState(0)

  // After every render, fold one more step while it does not fit.
  useLayoutEffect(() => {
    const over = Boolean(box) && box!.clientHeight > 0 && box!.scrollHeight > box!.clientHeight + 1
    if (!over) { if (overrun) setOverrun(false); return }
    if (level < levels) setLevel(level + 1)
    else if (!overrun) setOverrun(true)
  })

  const restart = useCallback(() => {
    setLevel(0)
    setOverrun(false)
    setNonce(n => n + 1)
  }, [])

  // A new shape of content is a new search.
  useLayoutEffect(() => { restart() }, [restart, reset])

  // A resized box, or content that grew or shrank on its own, starts again
  // before the next paint. flushSync is safe here: an observer callback runs
  // outside React's render, between layout and paint.
  useLayoutEffect(() => {
    if (!box || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => flushSync(restart))
    ro.observe(box)
    if (content) ro.observe(content)
    return () => ro.disconnect()
  }, [box, content, restart])

  const boxRef = useCallback((el: HTMLElement | null) => setBox(el), [])
  const contentRef = useCallback((el: HTMLElement | null) => setContent(el), [])
  return { level, overrun, boxRef, contentRef }
}
