import React from 'react'

/**
 * RefreshRail — what a panel does while data that is ALREADY ON SCREEN is being
 * refetched.
 *
 * The rule it exists to enforce: a refresh is not a load. Replacing live rows
 * with a skeleton because a 60-second poll came round, or dimming a table the
 * user is mid-way through reading, takes working content away to report that
 * the content is being confirmed. That is a downgrade dressed as feedback.
 *
 * So the content stays exactly where it is, fully interactive, and the only
 * thing that changes is a hairline travelling the panel's top edge. It uses the
 * same .animate-indeterminate as every other honest progress surface here, and
 * it makes no claim about how far along it is, because nothing knows that.
 *
 * Pair it with <LastUpdated> so the panel answers both questions at once: is it
 * checking, and how old is what I am looking at.
 */
export function RefreshRail({ active, className = '' }: { active: boolean; className?: string }) {
  if (!active) return null
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] overflow-hidden rounded-t-[inherit] ${className}`}
      role="status"
      aria-live="polite"
      aria-label="Refreshing"
    >
      <div className="h-full w-1/3 animate-indeterminate bg-gradient-to-r from-transparent via-accent to-transparent opacity-70" />
    </div>
  )
}
