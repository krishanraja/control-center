import React from 'react'

/** Shimmer line for loading states. */
export function SkeletonLine({ width = '100%', height = 14, className = '' }: {
  width?: string | number
  height?: number
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={`block rounded-md bg-white/[0.06] animate-pulse ${className}`}
      style={{ width, height }}
    />
  )
}

/** Rect skeleton for cards. */
export function SkeletonCard({ height = 88 }: { height?: number }) {
  return (
    <div
      aria-hidden
      className="rounded-2xl bg-white/[0.04] border border-white/[0.06] animate-pulse"
      style={{ height }}
    />
  )
}
