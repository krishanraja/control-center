import React from 'react'

/**
 * THE serif payoff line. One recipe, everywhere.
 *
 * The counterpart to <Eyebrow>: where the eyebrow names a section in small
 * caps, the claim is the one sentence on a surface that is worth reading in
 * the reading face. Focus & Purpose has run this recipe since it shipped (the
 * daily purpose line in Newsreader over a micro source line), and it is the
 * one place in the app whose type Krish singled out as right, 2026-09-13.
 * Every other surface re-picked family, size and colour by hand, so the same
 * idea rendered five ways.
 *
 * The rules baked in here, so no call site has to re-derive them:
 *  • Newsreader (font-serif) is reserved for the claim or the earned payoff.
 *    It is never body copy and never a control. One claim per surface.
 *  • Explicit hierarchy: text-ink for the claim, text-ink-faint for its
 *    source. Never an arbitrary `text-white/NN` opacity.
 *  • Role sizes only, and 1.4 leading, which is what makes a serif line of
 *    this size sit rather than crowd.
 *  • Never clamped or ellipsised: the line is the point (DESIGN_SYSTEM.md,
 *    "Text integrity"). `compact` steps the size down a rung on short phone
 *    viewports instead of cutting the sentence, the same height-gated
 *    compression Home and Focus already use.
 *
 * `source` is the provenance line: whose words, which record, when. A claim
 * that came from somewhere says so, in mono, small, underneath.
 */
export function Claim({
  children,
  source,
  size = 'title',
  compact = false,
  className = '',
}: {
  children: React.ReactNode
  /** Where the line came from. Rendered small and quiet underneath. */
  source?: React.ReactNode
  /** Role size. `heading` is for a claim that owns the whole screen. */
  size?: 'lede' | 'title' | 'heading'
  /** Phone surfaces: step down a rung under 860px of height rather than clip. */
  compact?: boolean
  className?: string
}) {
  // Whole class names, never interpolated: Tailwind scans source text, so a
  // `text-${size}` template would compile to nothing and the line would render
  // at the inherited size.
  const SIZE = {
    lede:    { base: 'text-lede',    step: '[@media(max-height:860px)]:text-body' },
    title:   { base: 'text-title',   step: '[@media(max-height:860px)]:text-lede' },
    heading: { base: 'text-heading', step: '[@media(max-height:860px)]:text-title' },
  } as const
  const sizing = `${SIZE[size].base}${compact ? ` ${SIZE[size].step}` : ''}`
  return (
    <>
      <p className={`font-serif leading-[1.4] text-ink ${sizing} ${className}`}>{children}</p>
      {source ? <p className="mt-1 text-micro tracking-wide text-ink-faint">{source}</p> : null}
    </>
  )
}
