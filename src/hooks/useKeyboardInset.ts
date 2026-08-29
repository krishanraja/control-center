import { useEffect, useState } from 'react'

/**
 * The height of the on-screen keyboard, in CSS pixels. 0 when it is closed.
 *
 * The app never knew the keyboard existed: the shell is a fixed no-scroll
 * viewport, so when the keyboard rose it simply amputated the bottom half of
 * whatever was open, Save buttons included. `visualViewport` is the only
 * honest signal — on iOS Safari the layout viewport does not resize at all
 * when the keyboard opens, and on Android it resizes inconsistently.
 *
 * Consumers inside the 1.2x mobile zoom wrapper divide by `--z` when they
 * turn this into padding, because this number is physical CSS pixels while
 * their own units are zoomed:
 *
 *   style={{ paddingBottom: `calc(${inset}px / var(--z, 1))` }}
 *
 * Fails safe: with no visualViewport (older browsers, tests) it stays 0 and
 * everything renders exactly as before.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return

    const read = () => {
      // Space below the visual viewport = keyboard (plus any browser chrome
      // that behaves like one). Clamp small jitters to zero so ordinary URL-bar
      // collapse never shifts layout.
      const covered = window.innerHeight - vv.height - vv.offsetTop
      setInset(covered > 40 ? Math.round(covered) : 0)
    }

    read()
    vv.addEventListener('resize', read)
    vv.addEventListener('scroll', read)
    return () => {
      vv.removeEventListener('resize', read)
      vv.removeEventListener('scroll', read)
    }
  }, [])

  return inset
}
