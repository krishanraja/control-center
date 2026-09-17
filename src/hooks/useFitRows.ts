import { useCallback, useLayoutEffect, useRef, useState } from 'react'

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
  const restart = useCallback(() => {
    passes.current = 0
    ceiling.current = Infinity
    setCount(align(Math.min(total, max)))
    setNonce(n => n + 1)
  }, [align, total, max])

  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { restart(); setWidth(box.clientWidth) })
    ro.observe(box)
    setWidth(box.clientWidth)
    return () => ro.disconnect()
  }, [restart])

  // A changed list, or a changed column count, is a new search.
  useLayoutEffect(() => { restart() }, [restart, step])

  return {
    count: Math.max(min, Math.min(count, total)),
    width,
    // Typed loosely on purpose: the box is a div and the list is a ul, and a
    // hook that only fits one tag is a hook that gets copied.
    boxRef: boxRef as React.MutableRefObject<never>,
    listRef: listRef as React.MutableRefObject<never>,
  }
}
