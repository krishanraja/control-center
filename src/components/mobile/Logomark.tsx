import React from 'react'

/** Small brand mark for the TabHeader — gradient squircle with "M". */
export function Logomark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex items-center justify-center rounded-xl shadow-lg shadow-violet-500/20"
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400"
      />
      <span
        className="relative font-black text-white tracking-tight"
        style={{ fontSize: size * 0.55, lineHeight: 1 }}
      >M</span>
    </span>
  )
}
