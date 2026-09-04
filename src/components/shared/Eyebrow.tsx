import React from 'react'

/**
 * THE small-caps section label. One recipe, everywhere.
 *
 * Before this, six ad-hoc eyebrow recipes coexisted on Home alone (tracking
 * 0.1–0.2em, three weights, some font-display and some not), which is most of
 * why the page read as typographically inconsistent. Rebuilt surfaces use this
 * primitive; ad-hoc recipes retire as their surfaces are touched.
 */
export function Eyebrow({
  children,
  tone = 'default',
  className = '',
}: {
  children: React.ReactNode
  tone?: 'default' | 'accent'
  className?: string
}) {
  const color = tone === 'accent' ? 'text-violet-200' : 'text-ink-muted'
  return (
    <span className={`font-display text-micro font-semibold uppercase tracking-[0.14em] ${color} ${className}`}>
      {children}
    </span>
  )
}
