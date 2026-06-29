import React from 'react'
import { useReducedMotion } from './motion'

/**
 * A checkmark that draws itself once, calmly — the shared "done" mark.
 *
 * Used by AllClear (the empty-state celebration) and by Pressable (the earned
 * moment after an async action resolves). Reuses the `.draw-check` keyframe in
 * index.css; under reduced motion it renders the finished stroke instantly.
 */
export function DrawnCheck({
  size,
  stroke,
  ring = true,
}: {
  size: number
  stroke: string
  /** Draw the surrounding circle. Off for inline-in-button use. */
  ring?: boolean
}) {
  const reduced = useReducedMotion()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      {ring && (
        <circle cx="12" cy="12" r="11" stroke={stroke} strokeOpacity="0.25" strokeWidth="1" />
      )}
      <path
        d="M6.5 12.5l3.5 3.5 7.5-8"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={reduced ? undefined : 'draw-check'}
        style={{ ['--len' as string]: 24 }}
      />
    </svg>
  )
}
