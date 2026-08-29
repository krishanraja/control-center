import React from 'react'
import { Working } from '../shared/Working'
import type { EditGroup, EditItem } from '../../lib/contentEngine'

// The one-click edits, rendered once.
//
// editGroups() already made the LIST single-source. This makes the rendering
// single-source too, which matters for the same reason: the brief editor and
// the composer previously drew visually different chips from different arrays
// with different busy-key conventions, and "the busy key has to match the one
// each handler sets or the spinner lands on the wrong chip" was a comment
// someone had already had to write.

/** The busy key convention. Every caller must set exactly this while running. */
export function busyKey(item: Pick<EditItem, 'mode' | 'value'>): string {
  return `${item.mode}:${item.value}`
}

export function EditPalette({ groups, busy, disabled, onPick, dense }: {
  groups: EditGroup[]
  /** The busyKey() of the running edit, or null. */
  busy: string | null
  disabled?: boolean
  onPick: (item: EditItem) => void
  /** Tighter spacing, for the brief's footer deck rather than a rail. */
  dense?: boolean
}) {
  return (
    <div className={dense ? 'space-y-2' : 'space-y-3'}>
      {groups.map(g => (
        <div key={g.label}>
          <div className="mb-1.5 px-0.5 text-micro font-semibold uppercase tracking-[0.14em] text-white/40">
            {g.label}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map(it => {
              const key = busyKey(it)
              return (
                <button
                  key={key}
                  type="button"
                  title={it.hint}
                  disabled={disabled || busy !== null}
                  onClick={() => onPick(it)}
                  data-testid={`edit-chip-${it.mode}-${it.value}`}
                  className={`flex items-center gap-1 rounded-full border bg-white/[0.02] px-2.5 py-1.5 text-label font-semibold transition-colors hover:bg-white/[0.07] disabled:opacity-40 ${g.accent}`}
                >
                  {busy === key ? <Working size={11} /> : null}
                  {it.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
