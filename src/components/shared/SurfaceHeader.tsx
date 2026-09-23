import React from 'react'
import { Eyebrow } from './Eyebrow'

/**
 * THE header band of a desk surface. One recipe, everywhere.
 *
 * Before this, 21 call sites across 12 files hand-rolled the same block with
 * four different type recipes — `text-2xl`, `text-xl md:text-2xl xl:text-heading`,
 * `text-xl md:text-2xl font-bold`, each with its own icon treatment. None of
 * them landed on the nine-token role scale at the base breakpoint: measured
 * live at 1440px, Visibility, Hunt and Systems all rendered their title at
 * 24px, and there is no 24 on the scale (it runs 20 → 28). That is the same
 * defect the 2026-08-21 type sweep removed from body copy, still sitting in
 * the most prominent text on every page.
 *
 * The size is `text-title` (20px), not `text-heading` (28px), and the choice is
 * deliberate. The sidebar already names the destination and the segmented nav
 * already names the lane, so by the time this line is read the reader knows
 * where they are — the title is orientation, not the message. At 28px with a
 * description under it, the old band cost 110-130px of a 900px screen before a
 * single row of data, which on Visibility pushed the first real content to y=330.
 * This band is 44px with a description and 30px without.
 *
 * `description` is for a surface whose purpose is not obvious from its name.
 * Most surfaces do not need one, and one sentence that restates the title is
 * worse than none: it spends a fifth of the fold saying nothing.
 */
export function SurfaceHeader({
  title,
  description,
  icon,
  eyebrow,
  actions,
  meta,
  className = '',
}: {
  title: React.ReactNode
  /** One sentence, only where the name does not carry the purpose. */
  description?: React.ReactNode
  /** A glyph from `@/lib/icons`, at size 18. */
  icon?: React.ReactNode
  /** A small-caps line above the title (e.g. a parent lane). */
  eyebrow?: React.ReactNode
  /** Controls that act on the whole surface, right-aligned. */
  actions?: React.ReactNode
  /** A quiet figure or freshness line, right-aligned under the actions. */
  meta?: React.ReactNode
  className?: string
}) {
  return (
    <header className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-0.5"><Eyebrow>{eyebrow}</Eyebrow></div>}
        <h1 className="text-title font-display font-semibold text-ink tracking-tight flex items-center gap-2 leading-tight">
          {icon}
          {title}
        </h1>
        {description && (
          <p className="text-label text-ink-muted mt-0.5 leading-snug">{description}</p>
        )}
      </div>
      {(actions || meta) && (
        <div className="flex-shrink-0 flex items-center gap-3">
          {meta}
          {actions}
        </div>
      )}
    </header>
  )
}
