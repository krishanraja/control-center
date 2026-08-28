import React from 'react'
import { ChevronRight, type LucideIcon } from '@/lib/icons'
import { IconTile } from '../shared/IconTile'

/**
 * THE Home door button. One shape for every doorway on Home — Focus, Market
 * signals, Intel — so the bottom of Home reads as one normalised panel rather
 * than three separately-grown pills.
 *
 * Deliberately opaque. The old doors sat on `bg-white/[0.03]`, which let the
 * ambient mood field bleed through and made them read as translucent chrome
 * that shifted colour with the room. These are controls, not chrome: a solid
 * `command` surface keeps them legible and identical on every tab and in every
 * mood.
 *
 *   - full (desktop): tile + word + chevron, the roomy doorway.
 *   - compact (mobile): the word alone, centred — the tab explains itself once
 *     opened, and dropping the tile/chevron is what lets three fit the narrow
 *     band the + button shares.
 *
 * Doorway language only: a word, never a number. The one sanctioned exception
 * is a status dot (Intel's broken-connection / money look, a hot market
 * signal) — still never a count.
 */
export function HomeDoor({
  icon,
  label,
  onClick,
  testId,
  dot = null,
  dotTestId,
  dotLabel,
  ariaHasPopup,
  compact = false,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  testId?: string
  dot?: 'amber' | 'rose' | null
  dotTestId?: string
  dotLabel?: string
  ariaHasPopup?: 'dialog'
  compact?: boolean
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-haspopup={ariaHasPopup}
      className={[
        'group relative flex flex-1 min-w-0 items-center rounded-full border border-command-border',
        'bg-command-surface transition-colors hover:bg-command-card active:scale-[0.98]',
        compact ? 'justify-center gap-1 px-2.5 py-2' : 'gap-2 py-1.5 pl-1.5 pr-3 text-left',
      ].join(' ')}
    >
      {!compact && <IconTile icon={icon} size="sm" />}
      <span
        className={`min-w-0 truncate font-semibold leading-none text-white/90 ${
          compact ? 'text-label text-center' : 'text-ui'
        }`}
      >
        {label}
      </span>
      {!compact && (
        <ChevronRight
          size={14}
          className="ml-auto shrink-0 text-white/30 transition-colors group-hover:text-white/60"
          aria-hidden
        />
      )}
      {dot && (
        <>
          <span
            data-testid={dotTestId}
            className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full animate-pulse ${
              dot === 'rose' ? 'bg-rose-500' : 'bg-amber-400'
            }`}
            aria-hidden
          />
          {dotLabel && <span className="sr-only">{dotLabel}</span>}
        </>
      )}
    </button>
  )
}
