import React from 'react'

/**
 * The Mindmaker mark — the two-monument logo: a tall, full-width roof over a
 * square base on the right, and a shorter roof set to the right of a square base
 * on the left, all carrying the brand's diagonal grey→pink gradient. This is the
 * REAL icon (see /favicon.png · /icon-192.png · /icon-512.png), reproduced 1:1
 * as crisp inline SVG so it stays sharp at every size and DPI — it replaces the
 * earlier two-bar placeholder that read as a generic, generated mark.
 *
 * Geometry and gradient stops are lifted directly from favicon.png (540×466,
 * transparent field). The deep tile matches the app icon and keeps the light-grey
 * roof tops legible on a light background too, so the mark reads the same on both
 * themes.
 */
export function Logomark({ size = 36 }: { size?: number }) {
  const gid = `mm-${React.useId().replace(/:/g, '')}`
  // Preserve the mark's native 540:466 aspect inside the square tile.
  const w = Math.round(size * 0.64)
  const h = Math.round((w * 466) / 540)
  return (
    <span
      className="inline-flex items-center justify-center rounded-[26%] bg-[#0d0a12] ring-1 ring-white/[0.12] shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Mindmaker"
    >
      <svg width={w} height={h} viewBox="0 0 540 466" fill="none" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="20" y1="8" x2="523" y2="448" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#e7e7e7" />
            <stop offset="0.55" stopColor="#e9b9d4" />
            <stop offset="1" stopColor="#f386c9" />
          </linearGradient>
        </defs>
        <g fill={`url(#${gid})`}>
          {/* right tower — tall full-width roof over its square base */}
          <polygon points="344,8 461,8 523,186 283,186" />
          <rect x="283" y="206" width="240" height="242" rx="4" />
          {/* left tower — shorter roof set to the right of its square base */}
          <polygon points="171,105 234,105 260,186 146,186" />
          <rect x="20" y="206" width="240" height="242" rx="4" />
        </g>
      </svg>
    </span>
  )
}
