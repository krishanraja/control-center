import React from 'react'

/**
 * Restrained, theme-adaptive app mark. Two rounded "monument" bars (the maker
 * motif) in a quiet rounded tile — one bar in adaptive ink (`currentColor` →
 * white by night, ink by day via --fg), one in a single muted-violet accent.
 * Replaces the old pink-gradient raster so the logo reads as a considered
 * instrument, not a toy, in both light and dark.
 */
export function Logomark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl bg-white/[0.05] ring-1 ring-white/10 text-white"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Mindmaker"
    >
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <rect x="5" y="5" width="5.5" height="14" rx="2.2" fill="currentColor" />
        <rect x="13.5" y="9" width="5.5" height="10" rx="2.2" className="fill-pod-growth" />
      </svg>
    </span>
  )
}
