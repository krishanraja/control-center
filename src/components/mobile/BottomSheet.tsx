import React, { useRef, useState } from 'react'
import { Dialog, DialogContent, DialogSrTitle } from '@/components/ui/dialog'
import { useHaptics } from '../../hooks/useHaptics'

interface Props {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** When set, the sheet fills the screen down to the safe-area top inset. */
  fullHeight?: boolean
  ariaLabel?: string
  /**
   * Portal target override. The default (ui/dialog's zoomRoot) is right for
   * every tab surface, but a sheet opened from INSIDE a full-screen overlay
   * (the composer, fixed z-[90] in its own zoom context) must portal into
   * that overlay's subtree or it paints underneath it.
   */
  container?: HTMLElement
}

/**
 * Generic spring-in bottom sheet with backdrop tap-to-close and swipe-down
 * dismissal. Accepts arbitrary children, unlike DetailSheet which has a fixed
 * card layout. Use this for richer detail surfaces (e.g. DecisionDetail) that
 * need full control over the body.
 *
 * On ui/dialog now. The hand-rolled version already had role="dialog" and
 * aria-modal, and hand-rolled the rest: its own mount/unmount timers, its own
 * body-scroll lock, a backdrop <button> standing in for an overlay, and no
 * focus trap or focus restoration at all. Radix owns that; what stays here is
 * the only part that is genuinely this component's own, the swipe-down drag.
 */
export function BottomSheet({ open, onClose, children, fullHeight = true, ariaLabel, container }: Props) {
  const [dragY, setDragY] = useState(0)
  const startY = useRef<number | null>(null)
  const h = useHaptics()

  const onTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY }
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0) setDragY(dy)
  }
  const onTouchEnd = () => {
    if (dragY > 120) { h.soft(); onClose() }
    setDragY(0)
    startY.current = null
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { setDragY(0); onClose() } }}>
      <DialogContent
        position="bottom"
        showClose={false}
        container={container}
        overlayClassName="bg-black/60 backdrop-blur-sm"
        aria-label={ariaLabel}
        className={`z-[70] flex flex-col ${fullHeight ? 'h-[calc(92vh/var(--z,1))]' : ''}`}
        style={{
          transform: `translate(-50%, ${dragY}px)`,
          transition: startY.current == null ? 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
        }}
      >
        <DialogSrTitle>{ariaLabel || 'Detail'}</DialogSrTitle>
        <div
          className="flex flex-shrink-0 items-center justify-center pb-2 pt-3"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <span className="block h-1 w-10 rounded-full bg-white/15" />
        </div>
        <div className="flex-1 overflow-hidden">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
