import { useEffect, useState } from 'react'

/**
 * Motion + device foundation for the "Calm & Anticipatory" language.
 *
 * Two ideas live here, used everywhere:
 *  1. Respect the person — `useReducedMotion` is the single source of truth so
 *     no surface animates against the user's OS preference.
 *  2. Respect the device — `useDeviceClass` tells a shared component whether it
 *     is being touched (phone, in-the-moment, decide) or pointed at (desk,
 *     in-session, orchestrate). Loading, "next", and "done" each take a
 *     different shape depending on the answer.
 */

const isBrowser = typeof window !== 'undefined'

/** True when the user has asked the OS to reduce motion. Live-updates. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => isBrowser && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
  )
  useEffect(() => {
    if (!isBrowser || !window.matchMedia) return
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(m.matches)
    const onChange = () => setReduced(m.matches)
    m.addEventListener?.('change', onChange)
    return () => m.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

/**
 * True while a CSS media query matches. Live-updates on resize.
 *
 * For layouts that must RENDER differently, not just look different. A
 * Tailwind `min-[…]:hidden` pair leaves both variants in the DOM, which
 * duplicates every id, testid and accessible name inside them — Home's three
 * doorways became six buttons that way on 2026-09-17, and five specs failed on
 * a strict-mode "resolved to 2 elements" rather than on anything visual.
 * Reach for this when the same subtree would otherwise be mounted twice.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => isBrowser && Boolean(window.matchMedia?.(query).matches),
  )
  useEffect(() => {
    if (!isBrowser || !window.matchMedia) return
    const m = window.matchMedia(query)
    setMatches(m.matches)
    const onChange = () => setMatches(m.matches)
    m.addEventListener?.('change', onChange)
    return () => m.removeEventListener?.('change', onChange)
  }, [query])
  return matches
}

export type DeviceClass = 'mobile' | 'desktop'

/**
 * Resolve the device *intent*, not the pixel width. A coarse primary pointer
 * means a touch device (phone/tablet) — and crucially it is zoom-invariant, so a
 * phone never flips to the desktop shell on pinch. Mirrors App.detectIsMobile so
 * shared components that don't receive a `narrow` prop agree with the shell.
 */
export function detectDeviceClass(): DeviceClass {
  if (!isBrowser) return 'desktop'
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return coarse || window.innerWidth < 900 ? 'mobile' : 'desktop'
}

/** Live device class. Updates on resize / orientation change. */
export function useDeviceClass(): DeviceClass {
  const [device, setDevice] = useState<DeviceClass>(detectDeviceClass)
  useEffect(() => {
    if (!isBrowser) return
    const onChange = () => setDevice(detectDeviceClass())
    window.addEventListener('resize', onChange)
    window.addEventListener('orientationchange', onChange)
    return () => {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('orientationchange', onChange)
    }
  }, [])
  return device
}

/** Convenience: are we on a touch-first surface? */
export function useIsTouch(): boolean {
  return useDeviceClass() === 'mobile'
}

/**
 * Inline animation-delay for hand-rolled staggers where a utility class is
 * awkward (e.g. a mapped list). Returns `{}` under reduced motion.
 */
export function staggerDelay(index: number, step = 60, reduced = false) {
  return reduced ? {} : { animationDelay: `${index * step}ms` }
}
