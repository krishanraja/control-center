import React, { useRef, useState, useEffect } from 'react'
import { BOTTOM_NAV_PAD } from './primitives'
import { useReducedMotion } from '../shared/motion'
import { useHaptics } from '../../hooks/useHaptics'

interface Props {
  header?: React.ReactNode
  children: React.ReactNode
  /** Callback fired when the user pulls down from the top. No-op if absent. */
  onRefresh?: () => Promise<void> | void
  /**
   * 'auto' (default): the body scrolls internally. 'none': the body is a fixed
   * stage (e.g. a triage card deck) — no scroll, no nav padding (use `footer`).
   */
  scroll?: 'auto' | 'none'
  /** Fixed region pinned above the BottomNav (e.g. a triage control bar). */
  footer?: React.ReactNode
}

/**
 * Fixed-viewport column. h-[100dvh]. Content scrolls *inside*; page never scrolls.
 * Includes pull-to-refresh gesture when onRefresh is provided (scroll='auto' only).
 */
export function MobileShell({ header, children, onRefresh, scroll = 'auto', footer }: Props) {
  const noScroll = scroll === 'none'
  const ref = useRef<HTMLDivElement>(null)
  const [pullDist, setPullDist] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const armed = useRef(false)
  const reduced = useReducedMotion()
  const h = useHaptics()

  useEffect(() => {
    if (!onRefresh || noScroll) return
    const el = ref.current
    if (!el) return
    const THRESHOLD = 70

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop <= 0) startY.current = e.touches[0].clientY
    }
    const onTouchMove = (e: TouchEvent) => {
      if (startY.current == null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy > 0 && el.scrollTop <= 0) {
        const next = Math.min(dy * 0.45, 90)
        // Buzz once at the moment the pull crosses the arming threshold, so the
        // gesture feels "caught" before you even let go — the native iOS feel.
        if (next >= THRESHOLD && !armed.current) { armed.current = true; h.impactMedium() }
        else if (next < THRESHOLD && armed.current) { armed.current = false }
        setPullDist(next)
      }
    }
    const onTouchEnd = async () => {
      if (pullDist >= THRESHOLD && !refreshing) {
        setRefreshing(true)
        try { await onRefresh(); h.success() } finally {
          setRefreshing(false)
          setPullDist(0)
        }
      } else {
        setPullDist(0)
      }
      armed.current = false
      startY.current = null
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [onRefresh, pullDist, refreshing])

  return (
    <main className="flex flex-col h-full relative">
      {header && <div className="px-5 pt-7 pb-5 flex-shrink-0">{header}</div>}

      {/* Pull-to-refresh indicator */}
      {(pullDist > 0 || refreshing) && (
        <div
          className="absolute left-0 right-0 flex items-center justify-center pointer-events-none z-10"
          style={{
            top: '68px',
            height: Math.max(pullDist, refreshing ? 40 : 0),
            transition: reduced || refreshing ? 'none' : 'height 120ms ease',
          }}
        >
          <div
            className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white/80"
            style={{
              animation: refreshing ? 'spin 0.8s linear infinite' : 'none',
              transform: refreshing ? 'none' : `rotate(${pullDist * 4}deg)`,
            }}
          />
        </div>
      )}

      {noScroll ? (
        // Fixed stage: no inner scroll, no nav padding on the body. A `footer`
        // (rendered below) reserves space above the BottomNav so pinned controls
        // and the bottom card edge are never occluded.
        <section ref={ref} className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {children}
        </section>
      ) : (
        <section
          ref={ref}
          className={`flex-1 min-h-0 overflow-y-auto flex flex-col gap-5 scrollbar-hide ${BOTTOM_NAV_PAD}`}
          style={{
            transform: pullDist > 0 ? `translateY(${pullDist}px)` : undefined,
            transition: startY.current == null ? 'transform 180ms ease' : 'none',
          }}
        >
          {children}
        </section>
      )}

      {footer && <div className={`flex-shrink-0 ${BOTTOM_NAV_PAD}`}>{footer}</div>}
    </main>
  )
}
