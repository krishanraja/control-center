import { useRef } from 'react'

interface Options {
  onLeft?: () => void
  onRight?: () => void
  threshold?: number
}

export function useSwipeActions({ onLeft, onRight, threshold = 80 }: Options) {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)

  return {
    onTouchStart: (e: React.TouchEvent) => {
      startX.current = e.touches[0].clientX
      startY.current = e.touches[0].clientY
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (startX.current === null) return
      const dx = e.changedTouches[0].clientX - startX.current
      const dy = Math.abs(e.changedTouches[0].clientY - (startY.current ?? 0))
      if (dy > 40) return
      if (dx > threshold) onRight?.()
      else if (dx < -threshold) onLeft?.()
      startX.current = null
      startY.current = null
    },
  }
}
