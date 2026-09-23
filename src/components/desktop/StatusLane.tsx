import React from 'react'
import { ChevronRight } from '@/lib/icons'

/**
 * THE status lane of a desk board. One recipe for both halves of Visibility.
 *
 * `GuestStatusLane` and `VisibilityTargetLane` were the same component twice,
 * and had already drifted: the guests one rendered "+6 more" as dead text
 * while the stages one made it a button that actually revealed the rows. Same
 * board, same gesture, and on one half of it the affordance did nothing.
 *
 * Two rules this primitive holds that the pair did not:
 *
 * 1. **A lane with nothing in it is not a card.** Both versions rendered an
 *    empty status as a full bordered section with a title, a description and a
 *    zero. Measured on the live board at 1440px: seven of those, ~82px each,
 *    574px of a 900px screen spent saying "nothing here" seven times, with the
 *    lanes that DID have rows pushed below the fold. Empty lanes now return
 *    null and the board names them together in one line (`EmptyLanes`).
 * 2. **Nothing is truncated.** The old pair put `truncate` on the lane title
 *    and its description. `.truncate` is globally neutralised in index.css, so
 *    it was already a no-op — but it is the spelling the text-integrity rule
 *    exists to keep out, and it would start cutting copy the moment that
 *    neutralisation was lifted.
 */
export function StatusLane<T>({
  status,
  title,
  description,
  items,
  renderItem,
  keyOf,
  defaultCollapsed = false,
  preview = 6,
}: {
  status: string
  title: string
  description: string
  items: T[]
  renderItem: (item: T) => React.ReactNode
  keyOf: (item: T) => string
  defaultCollapsed?: boolean
  /** Rows shown before "Show N more". */
  preview?: number
}) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed)
  const [showAll, setShowAll] = React.useState(false)

  // An empty lane is a fact about the board, not a card on it. The board says
  // so once, in one line, for all of them together.
  if (items.length === 0) return null

  const top = collapsed ? [] : showAll ? items : items.slice(0, preview)
  const remaining = items.length - top.length

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.02]" data-status={status}>
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors rounded-xl"
        aria-expanded={!collapsed}
      >
        <ChevronRight
          size={12}
          className={`text-ink-faint transition-transform flex-shrink-0 ${collapsed ? '' : 'rotate-90'}`}
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-label font-display font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {title}
          </h3>
          {/* The description explains the status, so it belongs where the
              status is being read — not folded away under the rows it
              describes. It stays a single quiet line and wraps if it must. */}
          <p className="text-micro text-ink-faint leading-snug">{description}</p>
        </div>
        <span className="text-micro font-mono tabular-nums text-ink-muted flex-shrink-0">{items.length}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-white/[0.05] p-3 space-y-2">
          {top.map(item => <React.Fragment key={keyOf(item)}>{renderItem(item)}</React.Fragment>)}
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full text-micro font-medium text-accent hover:text-ink text-center py-2 hover:bg-white/[0.025] rounded-lg transition-colors"
            >
              Show {remaining} more
            </button>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * The statuses with nothing in them, named once at the foot of the board.
 *
 * This is the whole saving: what used to be seven bordered cards is one
 * sentence, and the rows that exist get the screen instead.
 */
export function EmptyLanes({ names }: { names: string[] }) {
  if (names.length === 0) return null
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
  return (
    <p className="text-label text-ink-faint px-1 py-2">
      Nothing in {list}.
    </p>
  )
}
