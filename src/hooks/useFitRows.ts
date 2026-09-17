import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/**
 * How many rows of a list actually fit the box it is in.
 *
 * The Content desk is a no-scroll surface (Krish, 2026-09-17), which means the
 * work has to be paged rather than piled. Paging needs a page size, and every
 * cheap way of guessing one is wrong: a constant cap ignores the viewport, and
 * dividing the box height by an assumed row height clips the last row whenever
 * a card is a line taller than the guess. Clipping is the exact complaint this
 * is meant to answer, so a guess is not good enough.
 *
 * So it measures. Render a page, compare the list's real height to the box's,
 * and step the count by one in whichever direction is wrong. Each pass is one
 * layout, it moves monotonically toward the fit, and it stops when neither
 * condition holds. `passes` bounds it so a pathological case (a row whose
 * height depends on the count, say) settles instead of looping.
 *
 * Returns the count and the two refs to attach. Attach `boxRef` to the element
 * that owns the height and `listRef` to the thing that grows inside it.
 */
export function useFitRows(total: number, { min = 1, max = 50 }: { min?: number; max?: number } = {}) {
  const boxRef = useRef<HTMLElement | null>(null)
  const listRef = useRef<HTMLElement | null>(null)
  const passes = useRef(0)
  const [count, setCount] = useState(() => Math.min(total, max))
  /** The box's own width, so a caller can pick a column count from the space
   *  it actually has. A `min-[1700px]:` breakpoint would be a VIEWPORT query,
   *  and a viewport query is how a 320px rail ended up laying its cards out
   *  for a 768px body. */
  const [width, setWidth] = useState(0)

  const measure = useCallback(() => {
    const box = boxRef.current, list = listRef.current
    if (!box || !list) return
    const room = box.clientHeight
    if (room <= 0) return
    const used = list.scrollHeight
    const shown = Math.min(count, total)
    if (used > room && shown > min) { setCount(shown - 1); return }
    // Room for one more only if the next row is no taller than the slack. The
    // rows here are near-uniform, so the last one's height is the estimate.
    const rowH = shown > 0 ? used / shown : 0
    if (shown < Math.min(total, max) && room - used >= rowH && rowH > 0) setCount(shown + 1)
  }, [count, total, min, max])

  useLayoutEffect(() => {
    if (passes.current++ > 24) return
    measure()
  })

  // A resize starts the search again from scratch rather than nudging from
  // wherever the last viewport left it, which is both faster and stable.
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      passes.current = 0
      setCount(Math.min(total, max))
      setWidth(box.clientWidth)
    })
    ro.observe(box)
    setWidth(box.clientWidth)
    return () => ro.disconnect()
  }, [total, max])

  // A changed list is a new search too.
  useLayoutEffect(() => { passes.current = 0 }, [total])

  return {
    count: Math.max(min, Math.min(count, total)),
    width,
    // Typed loosely on purpose: the box is a div and the list is a ul, and a
    // hook that only fits one tag is a hook that gets copied.
    boxRef: boxRef as React.MutableRefObject<never>,
    listRef: listRef as React.MutableRefObject<never>,
  }
}
