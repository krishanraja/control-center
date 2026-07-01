import { useCallback, useEffect, useRef, useState } from 'react'
import { useHaptics } from './useHaptics'

export type Dir = 'left' | 'right'
type Phase = 'idle' | 'dragging' | 'flyout'

interface Options {
  /** Identity of the card currently on top — drag state resets when it changes. */
  cardId: string | null
  /** Fired after the fly-out animation completes. */
  onCommit: (dir: Dir) => void
  /** px past which a release commits. Drop (left) is biased higher — see below. */
  threshold?: number
  /** Disable gestures (e.g. reduced motion / empty deck). */
  disabled?: boolean
}

/**
 * useCardDeck — pointer-driven swipe for the TOP card of a deck, with keyboard/
 * button parity via flyOut().
 *
 * Design decisions (from the adversarial review):
 * - Pointer Events, so one code path covers touch + mouse + pen.
 * - Capture is DEFERRED: we only setPointerCapture once horizontal intent is
 *   proven (|dx| > |dy| && |dx| > 10px). Until then events flow, so a vertical
 *   drag still scrolls any scrollable ancestor instead of being swallowed.
 * - Drop (left) commit threshold is 1.35x the advance threshold, so a hesitant
 *   mid-throw biases toward the NON-destructive action.
 * - Commit animates via a CSS transform/opacity transition; onCommit fires on
 *   transitionend (with a timeout fallback so a missed event can't wedge the deck).
 */
export function useCardDeck({ cardId, onCommit, threshold = 96, disabled }: Options) {
  const [dx, setDx] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const h = useHaptics()

  const startX = useRef(0)
  const startY = useRef(0)
  const pointerId = useRef<number | null>(null)
  const lock = useRef<'none' | 'h' | 'v'>('none')
  const elRef = useRef<HTMLElement | null>(null)
  const committed = useRef(false)
  const flyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Which side (if any) the drag has crossed into commit range — drives the
  // tactile "arm" tick the instant the card is ready to fire, iOS-style.
  const armed = useRef<'none' | 'l' | 'r'>('none')

  // Reset all transient state whenever a new card reaches the top.
  useEffect(() => {
    setDx(0)
    setPhase('idle')
    lock.current = 'none'
    pointerId.current = null
    committed.current = false
    armed.current = 'none'
    if (flyTimer.current) { clearTimeout(flyTimer.current); flyTimer.current = null }
  }, [cardId])

  useEffect(() => () => { if (flyTimer.current) clearTimeout(flyTimer.current) }, [])

  const finishCommit = useCallback((dir: Dir) => {
    if (committed.current) return
    committed.current = true
    onCommit(dir)
  }, [onCommit])

  // Programmatic fling — used by buttons and arrow keys so they animate identically.
  const flyOut = useCallback((dir: Dir) => {
    if (disabled || committed.current) return
    // Commit buzz — the confident bump as the card leaves your hand. No-op on
    // desktop/iOS. Fires for buttons and arrow keys too, so every commit feels
    // identical regardless of how it was triggered.
    h.impactMedium()
    setPhase('flyout')
    setDx(dir === 'left' ? -window.innerWidth : window.innerWidth)
    // transitionend is the primary signal; this is the safety net.
    flyTimer.current = setTimeout(() => finishCommit(dir), 380)
  }, [disabled, finishCommit, h])

  const onTransitionEnd = useCallback((e: React.TransitionEvent) => {
    if (phase !== 'flyout' || e.propertyName !== 'transform') return
    finishCommit(dx < 0 ? 'left' : 'right')
  }, [phase, dx, finishCommit])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled || phase === 'flyout') return
    elRef.current = e.currentTarget as HTMLElement
    startX.current = e.clientX
    startY.current = e.clientY
    pointerId.current = e.pointerId
    lock.current = 'none'
    setPhase('dragging')
  }, [disabled, phase])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId || phase !== 'dragging') return
    const ddx = e.clientX - startX.current
    const ddy = e.clientY - startY.current
    if (lock.current === 'none') {
      const adx = Math.abs(ddx)
      const ady = Math.abs(ddy)
      if (adx < 6 && ady < 6) return
      if (adx > ady && adx > 10) {
        lock.current = 'h'
        try { elRef.current?.setPointerCapture(e.pointerId) } catch { /* noop */ }
      } else if (ady >= adx) {
        // Vertical intent — bail out, let the ancestor scroll.
        lock.current = 'v'
        pointerId.current = null
        setPhase('idle')
        return
      }
    }
    if (lock.current === 'h') {
      // Fire a faint tick the moment the drag crosses into commit range (and
      // only on the crossing, not every frame) — the card "arming" in your hand.
      const dropThreshold = threshold * 1.35
      const next: 'none' | 'l' | 'r' =
        ddx >= threshold ? 'r' : ddx <= -dropThreshold ? 'l' : 'none'
      if (next !== armed.current) {
        if (next !== 'none') h.impactLight()
        armed.current = next
      }
      setDx(ddx)
    }
  }, [phase, threshold, h])

  const settle = useCallback((e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId) return
    pointerId.current = null
    if (lock.current !== 'h') { setPhase('idle'); return }
    const dropThreshold = threshold * 1.35 // bias away from destructive Drop
    if (dx <= -dropThreshold) { flyOut('left'); return }
    if (dx >= threshold) { flyOut('right'); return }
    // Spring back.
    armed.current = 'none'
    setPhase('idle')
    setDx(0)
  }, [dx, threshold, flyOut])

  const bind = {
    onPointerDown,
    onPointerMove,
    onPointerUp: settle,
    onPointerCancel: settle,
    onTransitionEnd,
  }

  return { bind, dx, phase, flyOut, dragging: phase === 'dragging' }
}
