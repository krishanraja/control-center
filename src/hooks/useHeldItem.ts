import { useCallback, useMemo, useState } from 'react'
import { NOTHING_HELD, stepHeld, type HeldFallback, type HeldState } from '../lib/heldItem'

/**
 * Hold the item being read by id until Krish acts on it or it leaves the list.
 *
 * A background refetch can re-sort or extend the list at any moment; the item
 * returned here does not change because of that. It changes when the held item
 * disappears (he settled it, or the engine moved it on), or when the caller
 * holds another one (he browsed).
 *
 * `adopt: false` keeps the head of the list authoritative instead of holding
 * it, for a deck whose sources arrive at different speeds and whose first card
 * must be the one that belongs first once everything is in. An explicit
 * `hold()` always holds.
 *
 * The rule itself is `stepHeld` in src/lib/heldItem.ts, tested on its own.
 */
export function useHeldItem<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  opts: { fallback?: HeldFallback; adopt?: boolean } = {},
): {
  current: T | null
  index: number
  heldId: string | null
  /** Hold this id from now on (he browsed to it). */
  hold: (id: string) => void
  /** Let go; the list's head is shown again. */
  release: () => void
} {
  const fallback = opts.fallback ?? 'head'
  const adopt = opts.adopt ?? true
  const [held, setHeld] = useState<HeldState>(NOTHING_HELD)
  const ids = useMemo(() => items.map(idOf), [items, idOf])

  // The rule, and why the head is never stored while not adopting, are in
  // stepHeld (src/lib/heldItem.ts). Storing what it returns is the documented
  // "adjust state while rendering" pattern: React re-renders before
  // committing, and stepHeld is idempotent, so this settles in one extra pass.
  const state = stepHeld(held, ids, { fallback, adopt })
  if (state.id !== held.id || state.index !== held.index || state.explicit !== held.explicit) {
    setHeld(state)
  }

  const hold = useCallback((id: string) => setHeld(h => ({ id, index: h.index, explicit: true })), [])
  const release = useCallback(() => setHeld(h => ({ id: null, index: h.index, explicit: false })), [])

  // state.index is where the shown item sits now (-1 for an empty list),
  // whether it is held or only first.
  return {
    current: state.index >= 0 ? items[state.index]! : null,
    index: state.index,
    heldId: state.index >= 0 ? ids[state.index]! : null,
    hold,
    release,
  }
}
