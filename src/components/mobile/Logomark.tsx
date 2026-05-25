import React from 'react'

export function Logomark({ size = 36 }: { size?: number }) {
  return (
    <img
      src="/icon-192.png"
      alt="Mindmaker"
      width={size}
      height={size}
      className="rounded-xl object-cover shadow-lg shadow-black/40 ring-1 ring-white/10"
      style={{ width: size, height: size }}
    />
  )
}
