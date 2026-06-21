import React from 'react'

// Back-compat shims. The skeleton system now lives in shared/Skeleton.tsx with a
// soft light-sweep (the `.skeleton` class) and content-shaped composites. These
// two keep older call-sites working and on the new shimmer.
export { Skeleton, SkeletonText, MobileTabSkeleton, BoardSkeleton } from '../shared/Skeleton'

/** Shimmer line for loading states. */
export function SkeletonLine({ width = '100%', height = 14, className = '' }: {
  width?: string | number
  height?: number
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={`block rounded-md skeleton ${className}`}
      style={{ width, height }}
    />
  )
}

/** Rect skeleton for cards. */
export function SkeletonCard({ height = 88 }: { height?: number }) {
  return (
    <div
      aria-hidden
      className="rounded-2xl skeleton border border-white/[0.06]"
      style={{ height }}
    />
  )
}
