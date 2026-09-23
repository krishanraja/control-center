import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * How wide the element actually is, not how wide the window is.
 *
 * Every "wide desk" branch in this app asked `window.matchMedia('(min-width:
 * 1400px)')`, which is a question about the browser window. No surface gets the
 * window: the desktop sidebar takes 240px and the shell gutter another 48, so a
 * 1440px window hands a tab 1152-1200px. At exactly 1400 the "wide" two-column
 * treatment was applied to a canvas of about 1112 — and collapsing the sidebar,
 * which gives a tab 240px more, changed nothing at all, because the window had
 * not moved.
 *
 * A ResizeObserver on the element itself answers the question the layout is
 * actually asking. Native CSS container queries would do this in the
 * stylesheet, but these branches choose a different TREE rather than a
 * different style (rendering both and hiding one put two copies of every
 * doorway in the DOM, same testids, same accessible names), so the decision has
 * to be available in JS.
 *
 * Returns 0 until the first measurement, so a caller comparing against a
 * breakpoint starts narrow and widens once — never the other way round, which
 * would flash the two-column layout on a phone.
 */
export function useContainerWidth<T extends HTMLElement = HTMLDivElement>(): [
  (node: T | null) => void,
  number,
] {
  const [width, setWidth] = useState(0)
  const observer = useRef<ResizeObserver | null>(null)

  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect()
    if (!node) return
    setWidth(node.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        // `contentRect` excludes padding, which is what a layout decision wants:
        // the room available to lay children out in.
        setWidth(e.contentRect.width)
      }
    })
    ro.observe(node)
    observer.current = ro
  }, [])

  useEffect(() => () => observer.current?.disconnect(), [])

  return [ref, width]
}
