/**
 * Holding the thing Krish is reading still while the list under it changes.
 *
 * Every Content list refetches the whole table on any write, and the engine
 * writes all day (52 rows updated in the 24 hours to 2026-10-04). A surface
 * that shows "the first item" therefore shows a different item after each
 * refetch, which is the "cards change while I read" complaint. The answer is
 * to hold the item by id, not by position, until he acts on it or it leaves
 * the list. These are the pure halves; src/hooks/useHeldItem.ts wraps the
 * first for a component.
 */

export type HeldFallback = 'head' | 'same-index'

export interface Held {
  /** The id held, or null when the list is empty. */
  id: string | null
  /** Where it sits in the list now, or -1 when the list is empty. */
  index: number
}

/**
 * Which item to show, given the ids in their current order, the id held last
 * time and where it was.
 *
 * - The held id is still there: show it, wherever it moved to.
 * - It left (he acted on it, or the engine moved it on): show the head of the
 *   list (`head`, for a queue served one at a time) or whatever now sits where
 *   it was (`same-index`, for a deck he browses), clamped to the list.
 * - Nothing held yet: show the head.
 *
 * Idempotent: resolving the result again gives the same result, so a caller
 * can store it and resolve on every render without looping.
 */
export function resolveHeld(
  ids: readonly string[],
  heldId: string | null,
  lastIndex: number,
  fallback: HeldFallback = 'head',
): Held {
  if (!ids.length) return { id: null, index: -1 }
  if (heldId) {
    const at = ids.indexOf(heldId)
    if (at >= 0) return { id: heldId, index: at }
    if (fallback === 'same-index') {
      const i = Math.min(Math.max(0, lastIndex), ids.length - 1)
      return { id: ids[i]!, index: i }
    }
  }
  return { id: ids[0]!, index: 0 }
}

/** What a holder remembers between renders. `explicit` is a hold he made
 *  (he browsed to it), as against one adopted from the head of the list. */
export interface HeldState extends Held {
  explicit: boolean
}

export const NOTHING_HELD: HeldState = Object.freeze({ id: null, index: 0, explicit: false })

/**
 * The next state of a holder, given the list as it is now.
 *
 * `adopt: false` keeps the head authoritative without holding it, for a deck
 * whose sources arrive at different speeds: the head is shown but never
 * stored, because storing it would hold a card that was only first because
 * the other sources had not arrived yet, and once adoption began it would
 * stay in front of the card that belongs there. An explicit hold is always
 * kept while its item is in the list.
 *
 * Idempotent, like resolveHeld: stepping its own result again with the same
 * list returns an equal state.
 */
export function stepHeld(
  prev: HeldState,
  ids: readonly string[],
  opts: { fallback?: HeldFallback; adopt?: boolean } = {},
): HeldState {
  const adopt = opts.adopt ?? true
  const next = resolveHeld(ids, prev.explicit || adopt ? prev.id : null, prev.index, opts.fallback ?? 'head')
  const explicit = prev.explicit && next.id === prev.id
  return { id: explicit || adopt ? next.id : null, index: next.index, explicit }
}

/**
 * The page a paged list should show so the first item he was looking at stays
 * on screen.
 *
 * InProgress paged by number, so an idea arriving above the page, or the
 * fit changing the page size, slid every card along by one. Anchoring on the
 * id of the first visible item keeps that item in view: the page is whichever
 * now contains it. When it has gone, the old page number stands, clamped.
 */
export function anchoredPage(
  ids: readonly string[],
  anchorId: string | null,
  pageSize: number,
  fallbackPage: number,
): number {
  const size = Math.max(1, Math.floor(pageSize) || 1)
  const pages = Math.max(1, Math.ceil(ids.length / size))
  const at = anchorId ? ids.indexOf(anchorId) : -1
  const page = at >= 0 ? Math.floor(at / size) : fallbackPage
  return Math.min(Math.max(0, page), pages - 1)
}
