import { useMemo, useState } from 'react'
import { Search, Check, X } from '@/lib/icons'
import { BottomSheet } from '../mobile/BottomSheet'

// A chip group that does not grow without bound.
//
// The problem it solves shows up everywhere a set of options outgrows one line
// on a phone: geography has 72 countries, a venture list grows, a tag list is
// unbounded. The three ways this normally gets handled are all bad. Rendering
// every chip pushes the content the operator came for below the fold. Wrapping
// to four lines does the same thing more slowly. Truncating silently hides
// options with no way to reach them.
//
// So: the few that matter render inline, and the rest are one tap away in a
// sheet that sizes to its content and leaves the page visible behind it. What
// is SELECTED is always inline regardless of rank, because a filter you cannot
// see is a filter you forget is on.
//
// Deliberately not a dropdown. A native select cannot show counts, cannot
// multi-select on iOS without a modal anyway, and puts the options at the top of
// the screen; a bottom sheet puts them under the thumb.

export interface ChipItem {
  id: string
  label: string
  /** Rendered small and dim after the label. Counts, mostly. */
  meta?: string
  /** Long form for the sheet, where there is room. Falls back to `label`. */
  fullLabel?: string
}

export function ChipOverflow({
  items, selected, onToggle, inline = 3, title, testIdPrefix, searchThreshold = 12, emptyNote,
  single, busy,
}: {
  items: ChipItem[]
  selected: string[]
  onToggle: (id: string) => void
  /** How many unselected chips render inline before the overflow button. */
  inline?: number
  /** Sheet heading. Also the accessible name of the overflow button. */
  title: string
  testIdPrefix: string
  /** Show a filter field in the sheet once the list is at least this long. */
  searchThreshold?: number
  /** Rendered under the sheet list. Use it to state what the options do NOT
   *  cover, which for geography is most of the network. */
  emptyNote?: string
  /** One value at a time. Picking in the sheet closes it, since there is
   *  nothing left to pick; a multi-select sheet stays open so several can be
   *  turned on in one visit. */
  single?: boolean
  /** Disable every control while a write is in flight. */
  busy?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  // Selected first, then the natural order, then cut. An option the operator
  // turned on never falls into the overflow: it would look like it turned off.
  const { shown, hidden } = useMemo(() => {
    const on = items.filter(i => selected.includes(i.id))
    const off = items.filter(i => !selected.includes(i.id))
    return { shown: [...on, ...off.slice(0, inline)], hidden: off.slice(inline) }
  }, [items, selected, inline])

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter(i =>
      i.label.toLowerCase().includes(needle) ||
      (i.fullLabel || '').toLowerCase().includes(needle) ||
      i.id.toLowerCase().includes(needle))
  }, [items, q])

  return (
    <>
      {shown.map(i => (
        <Chip
          key={i.id}
          on={selected.includes(i.id)}
          onClick={() => { if (!busy) onToggle(i.id) }}
          disabled={busy}
          testId={`${testIdPrefix}-chip-${i.id}`}
        >
          {i.label}
          {i.meta && <span className="ml-1 font-normal text-white/30">{i.meta}</span>}
        </Chip>
      ))}

      {hidden.length > 0 && (
        <button
          type="button"
          onClick={() => { setQ(''); setOpen(true) }}
          data-testid={`${testIdPrefix}-more`}
          aria-label={`${title}: ${hidden.length} more`}
          className="min-h-[30px] rounded-full border border-dashed border-white/15 px-2.5 text-label font-semibold text-white/60 transition-colors hover:border-white/30 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
        >
          +{hidden.length}
        </button>
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)} fullHeight={false} ariaLabel={title}>
        <div className="flex max-h-[70vh] flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
          <div className="flex items-center gap-2 pb-2">
            <h2 className="text-ui font-semibold text-white">{title}</h2>
            {!single && selected.length > 0 && (
              <span className="text-label text-white/40">{selected.length} on</span>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="ml-auto rounded-full p-1.5 text-white/40 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
            >
              <X size={16} aria-hidden />
            </button>
          </div>

          {items.length >= searchThreshold && (
            <div className="relative pb-2">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" aria-hidden />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={`Find in ${title.toLowerCase()}`}
                aria-label={`Find in ${title}`}
                data-testid={`${testIdPrefix}-search`}
                className="min-h-[38px] w-full rounded-form border border-white/10 bg-white/[0.03] pl-8 pr-3 text-body text-white placeholder:text-white/25 focus:border-violet-400/40 focus:outline-none"
              />
            </div>
          )}

          {/* One per row, not a chip wrap. The sheet is a list: a row is a bigger
              tap target than a chip and leaves room for the count on the right. */}
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto">
            {matches.map(i => {
              const on = selected.includes(i.id)
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => {
                    if (busy) return
                    onToggle(i.id)
                    // Single-select has nothing left to choose once chosen.
                    if (single) setOpen(false)
                  }}
                  disabled={busy}
                  aria-pressed={on}
                  role={single ? 'radio' : undefined}
                  data-testid={`${testIdPrefix}-row-${i.id}`}
                  className={`flex min-h-[42px] w-full items-center gap-2.5 rounded-lg px-3 text-left text-body transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
                    on ? 'text-violet-100' : 'text-white/70 hover:bg-white/[0.03]'}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center border ${
                    single ? 'rounded-full' : 'rounded'} ${
                    on ? 'border-violet-400/50 bg-violet-500/25' : 'border-white/15'}`}>
                    {on && <Check size={11} className="text-violet-100" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{i.fullLabel || i.label}</span>
                  {i.meta && <span className="shrink-0 text-label tabular-nums text-white/30">{i.meta}</span>}
                </button>
              )
            })}
            {matches.length === 0 && (
              <p className="px-3 py-6 text-center text-label text-white/35">Nothing matches "{q}".</p>
            )}
          </div>

          {emptyNote && (
            <p className="border-t border-white/[0.06] pt-2.5 text-label leading-relaxed text-white/40">{emptyNote}</p>
          )}
        </div>
      </BottomSheet>
    </>
  )
}

/** The chip, shared so the inline row and every caller stay identical. */
export function Chip({ on, onClick, children, testId, disabled, tone = 'accent' }: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
  testId?: string
  disabled?: boolean
  /** 'danger' for a chip whose ON state is a consequence rather than a
   *  preference, e.g. marking someone do-not-contact. */
  tone?: 'accent' | 'danger'
}) {
  const onClass = tone === 'danger'
    ? 'border-rose-400/40 bg-rose-500/15 text-rose-100'
    : 'border-violet-400/40 bg-violet-500/15 text-violet-100'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      data-testid={testId}
      className={`min-h-[30px] rounded-full border px-2.5 text-label font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 disabled:opacity-50 ${
        on ? onClass : 'border-white/10 text-white/60 hover:border-white/20 hover:text-white/80'}`}
    >
      {children}
    </button>
  )
}
