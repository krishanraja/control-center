import React from 'react'

/**
 * The house sparkline: two hand-drawn polylines, a bespoke identity mark per
 * DESIGN_SYSTEM.md (not an icon, not a chart library). Lifted verbatim from
 * MrrTicker so the money surfaces share one system — MrrTicker imports it
 * back, and the spend panel draws its 6-month trend with the same lines.
 */
export function Sparkline({ data, positive, w = 84, h = 22, ariaLabel = 'trend' }: {
  data: number[]
  positive: boolean
  w?: number
  h?: number
  ariaLabel?: string
}) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = Math.max(1, max - min)
  const step = w / (data.length - 1)
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(' ')
  const stroke = positive ? '#34d399' : '#f87171'
  const fill = positive ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)'
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel}>
      <polyline
        points={`0,${h} ${points} ${w},${h}`}
        fill={fill}
        stroke="none"
      />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
