import React, { useEffect, useRef, useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** When set, the sheet fills the screen down to the safe-area top inset. */
  fullHeight?: boolean
  ariaLabel?: string
}

/**
 * Generic spring-in bottom sheet with backdrop tap-to-close and swipe-down
 * dismissal. Accepts arbitrary children, unlike DetailSheet which has a fixed
 * card layout. Use this for richer detail surfaces (e.g. DecisionDetail) that
 * need full control over the body.
 */
export function BottomSheet({ open, onClose, children, fullHeight = true, ariaLabel }: Props) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const [dragY, setDragY] = useState(0)
  const startY = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      requestAnimationFrame(() => setVisible(true))
    } else if (mounted) {
      setVisible(false)
      const t = setTimeout(() => setMounted(false), 220)
      return () => clearTimeout(t)
    }
  }, [open, mounted])

  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mounted])

  if (!mounted) return null

  const onTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY }
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0) setDragY(dy)
  }
  const onTouchEnd = () => {
    if (dragY > 120) onClose()
    setDragY(0)
    startY.current = null
  }

  const translate = visible ? dragY : 1000

  return (
    <div
      className="fixed top-0 left-0 w-[calc(100vw/var(--z,1))] h-[calc(100dvh/var(--z,1))] z-[70] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <button
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        style={{ opacity: visible ? 1 : 0 }}
      />
      <div
        className={`relative w-full max-w-xl bg-[#0f0f12] border-t border-white/[0.08] rounded-t-[28px] shadow-2xl shadow-black/60 flex flex-col ${fullHeight ? 'h-[calc(92vh/var(--z,1))]' : ''}`}
        style={{
          transform: `translateY(${translate}px)`,
          transition: startY.current == null ? 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
        }}
      >
        <div
          className="pt-3 pb-2 flex items-center justify-center flex-shrink-0"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <span className="block w-10 h-1 rounded-full bg-white/15" />
        </div>
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}
