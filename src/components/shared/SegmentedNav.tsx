import React, { useRef } from 'react'
import { cn } from '@/lib/utils'

// The house tab switcher.
//
// Four tabs hand-rolled their own: Growth, Content v2, OS and People. Two of
// them (Growth, Content v2) were a <nav> of plain buttons with no tab
// semantics at all, so nothing announced that pressing one swapped the panel
// underneath. The two that did have role="tab" still had no roving focus, which
// is the part of the tab pattern that actually matters at a keyboard: arrow
// keys should move between tabs while Tab itself leaves the group.
//
// This is not Radix Tabs. Radix requires the list and every panel to live
// inside one Tabs root, and these four render their panels in four different
// shapes (conditional ternaries, a lane switcher wrapping lazy chunks, a fixed
// pill overlaying a mobile header). Restructuring all of them to satisfy a
// component was the wrong trade; the ~40 lines of roving focus are not the hard
// part, agreeing on them once is.

export interface Segment<T extends string> {
  id: T
  label: React.ReactNode
  /** Optional trailing count. */
  badge?: React.ReactNode
}

interface Props<T extends string> {
  segments: ReadonlyArray<Segment<T>>
  value: T
  onChange: (id: T) => void
  /** Announced as the group's purpose, e.g. "People lanes". */
  label: string
  /**
   * `pill`     rounded chips in a row (Growth, Content)
   * `bordered` bordered rectangles (OS, People on desktop)
   * `segmented` full-width equal segments in a tray (People on mobile)
   */
  variant?: 'pill' | 'bordered' | 'segmented'
  className?: string
  /** Per-tab test id prefix, e.g. `growth-section` -> `growth-section-map`. */
  testIdPrefix?: string
}

const TRAY: Record<NonNullable<Props<string>['variant']>, string> = {
  pill: 'flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 flex-shrink-0',
  bordered: 'flex gap-1',
  segmented: 'flex gap-1 rounded-xl border border-white/10 bg-base/80 p-1 backdrop-blur',
}

const TAB: Record<NonNullable<Props<string>['variant']>, { base: string; on: string; off: string }> = {
  pill: {
    base: 'px-3.5 py-1.5 rounded-full text-body whitespace-nowrap border transition-colors',
    on: 'btn-contrast border-white font-semibold',
    off: 'border-white/10 text-white/65 hover:bg-white/[0.06]',
  },
  bordered: {
    base: 'px-3 py-1.5 rounded-lg text-label font-semibold border transition-colors',
    on: 'border-white/20 bg-white/[0.08] text-white',
    off: 'border-white/[0.06] text-white/45 hover:text-white/75 hover:border-white/15',
  },
  segmented: {
    // flex-1 so segments split the width evenly and each is a real tap target
    // rather than a 10px pill.
    base: 'flex-1 min-h-[38px] rounded-lg text-label font-semibold transition-colors',
    on: 'bg-white/15 text-white',
    off: 'text-white/55 hover:text-white/80',
  },
}

export function SegmentedNav<T extends string>({
  segments, value, onChange, label, variant = 'pill', className, testIdPrefix,
}: Props<T>) {
  const ref = useRef<HTMLDivElement>(null)

  // Arrow keys move between tabs and wrap; Home and End jump to the ends. Only
  // the active tab is in the Tab order, so Tab leaves the group rather than
  // walking through every segment, which is the whole point of the pattern.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
    if (!keys.includes(e.key)) return
    e.preventDefault()
    const i = segments.findIndex(s => s.id === value)
    const next =
      e.key === 'Home' ? 0
      : e.key === 'End' ? segments.length - 1
      : e.key === 'ArrowRight' ? (i + 1) % segments.length
      : (i - 1 + segments.length) % segments.length
    onChange(segments[next].id)
    // Move real focus with selection, or the next arrow press starts over.
    requestAnimationFrame(() => {
      ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
    })
  }

  const t = TAB[variant]
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(TRAY[variant], className)}
    >
      {segments.map(s => {
        const active = s.id === value
        return (
          <button
            key={s.id}
            role="tab"
            type="button"
            aria-selected={active}
            aria-current={active ? 'true' : undefined}
            tabIndex={active ? 0 : -1}
            data-testid={testIdPrefix ? `${testIdPrefix}-${s.id}` : undefined}
            onClick={() => onChange(s.id)}
            className={cn(
              t.base,
              active ? t.on : t.off,
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50',
            )}
          >
            {s.label}
            {s.badge}
          </button>
        )
      })}
    </div>
  )
}
