import React from 'react'
import type { LucideIcon } from '@/lib/icons'

/**
 * THE circled-icon container. One recipe, everywhere.
 *
 * Before this, at least six ad-hoc "icon in a rounded ring" recipes coexisted
 * (FocusDoor, the create sheet's rows and FAB, the More drawer's tiles, the
 * network search bar) — each with its own diameter, ring opacity, fill and
 * glyph size, which is most of why the chrome read as assembled rather than
 * designed. The icon itself rides the house wrapper (@/lib/icons), so the
 * stroke weight is already uniform; this fixes the frame around it.
 *
 * Sizes hold a constant glyph-to-tile ratio; tones stay within the two
 * sanctioned families (quiet neutral, brand mint). Identity marks
 * (Logomark, AgentAvatar) are not icons and do not use this.
 */

const SIZE = {
  sm: { box: 'h-7 w-7', icon: 14 },
  md: { box: 'h-9 w-9', icon: 16 },
  lg: { box: 'h-11 w-11', icon: 20 },
} as const

const TONE = {
  neutral: 'border-white/[0.10] bg-white/[0.04] text-ink-muted',
  accent: 'border-violet-300/30 bg-violet-500/15 text-violet-200',
} as const

/**
 * `glyph` (2026-10-04, Content's numbered calls) puts a short figure in the
 * tile instead of an icon: a list position, set in mono, so a numbered list
 * and its done state (the same tile carrying a Check) share one frame rather
 * than a second hand-rolled ring. Give it an icon or a glyph, not both.
 */
export function IconTile({
  icon: Icon,
  glyph,
  size = 'md',
  tone = 'neutral',
  className = '',
}: {
  icon?: LucideIcon
  glyph?: React.ReactNode
  size?: keyof typeof SIZE
  tone?: keyof typeof TONE
  className?: string
}) {
  const s = SIZE[size]
  return (
    <span
      aria-hidden
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full border ${s.box} ${TONE[tone]} ${className}`}
    >
      {Icon ? <Icon size={s.icon} /> : <span className="font-mono text-label font-semibold tabular-nums">{glyph}</span>}
    </span>
  )
}
