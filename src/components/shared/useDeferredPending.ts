import { useEffect, useRef, useState } from 'react'

/**
 * The anti-flash gate. Nothing in this app should show a loading state it does
 * not need, and nothing should show one for less time than the eye can read.
 *
 * Two failure modes, one hook:
 *
 *  1. THE FLASH. A cached read resolves in 60ms. A skeleton painted for 60ms is
 *     not feedback, it is a flicker, and a flicker reads as a rendering bug. So
 *     nothing appears until the wait has actually earned it (`delay`).
 *
 *  2. THE STROBE. A wait crosses the threshold at 210ms and resolves at 240ms.
 *     Now the skeleton appears and vanishes inside two frames, which is worse
 *     than either extreme. So once shown, it stays for a readable beat (`min`).
 *
 * The numbers are the point. 200ms is roughly where a delay stops feeling like
 * a direct response to your own tap and starts feeling like the system went
 * away to do something. 400ms is roughly the shortest a placeholder can be on
 * screen and still be perceived as information rather than noise.
 *
 * Presses are already acknowledged instantly by haptics and `.press-effect`, so
 * the gate costs nothing on the one interaction where silence would be wrong.
 *
 *   const showSkeleton = useDeferredPending(loading && rows.length === 0)
 */
export interface DeferredPendingOpts {
  /** Wait this long before admitting anything is happening. */
  delay?: number
  /** Once shown, stay shown at least this long. */
  min?: number
}

export function useDeferredPending(
  active: boolean,
  { delay = 200, min = 400 }: DeferredPendingOpts = {},
): boolean {
  const [shown, setShown] = useState(false)
  // When the visible state actually began, so `min` is measured from the paint
  // rather than from the request. A ref, not state: reading it must never be a
  // reason to re-render.
  const shownAt = useRef(0)

  useEffect(() => {
    let timer: number | undefined

    if (active) {
      if (shown) return
      timer = window.setTimeout(() => {
        shownAt.current = Date.now()
        setShown(true)
      }, delay)
    } else if (shown) {
      const held = Date.now() - shownAt.current
      const remaining = Math.max(0, min - held)
      // Already past the floor: drop it in the same tick, so a finished load
      // never sits behind a placeholder it has outlived.
      if (remaining === 0) setShown(false)
      else timer = window.setTimeout(() => setShown(false), remaining)
    }

    return () => { if (timer !== undefined) window.clearTimeout(timer) }
  }, [active, shown, delay, min])

  return shown
}

/**
 * The same gate for a value that arrives with its data: true only once the wait
 * has earned an announcement AND there is genuinely nothing on screen yet.
 * Saves every call site from writing `loading && rows.length === 0` by hand and
 * then forgetting the second half, which is what turns a background refresh
 * into a blank panel.
 */
export function useFirstLoad(loading: boolean, hasData: boolean, opts?: DeferredPendingOpts): boolean {
  return useDeferredPending(loading && !hasData, opts)
}
