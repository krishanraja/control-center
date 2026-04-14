import React, { useRef, useState, useEffect } from 'react'

const BOTTOM_NAV_PAD = 'pb-[calc(env(safe-area-inset-bottom,0px)+100px)]'

interface Props {
  header?: React.ReactNode
  children: React.ReactNode
  /** Callback fired when the user pulls down from the top. No-op if absent. */
  onRefresh?: () => Promise<void> | void
}

/**
 * Fixed-viewport column. h-[100dvh]. Content scrolls *inside*; page never scrolls.
 * Includes pull-to-refresh gesture when onRefresh is provided.
 */
export function MobileShell({ header, children, onRefresh }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pullDist, setPullDist] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (!onRefresh) return
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
        setPullDist(Math.min(dy * 0.45, 90))
      }
    }
    const onTouchEnd = async () => {
      if (pullDist >= THRESHOLD && !refreshing) {
        setRefreshing(true)
        try { await onRefresh() } finally {
          setRefreshing(false)
          setPullDist(0)
        }
      } else {
        setPullDist(0)
      }
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
    <main className="flex flex-col h-[100dvh] relative">
      {header && <div className="px-5 pt-5 pb-3 flex-shrink-0">{header}</div>}

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

      <section
        ref={ref}
        className={`flex-1 min-h-0 overflow-y-auto px-5 flex flex-col gap-4 scrollbar-hide ${BOTTOM_NAV_PAD}`}
        style={{
          transform: pullDist > 0 ? `translateY(${pullDist}px)` : undefined,
          transition: startY.current == null ? 'transform 180ms ease' : 'none',
        }}
      >
        {children}
      </section>
    </main>
  )
}

function useReducedMotion(): boolean {
  const [v, setV] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    setV(m.matches)
    const h = () => setV(m.matches)
    m.addEventListener?.('change', h)
    return () => m.removeEventListener?.('change', h)
  }, [])
  return v
}
