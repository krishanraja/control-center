import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useHaptics } from './useHaptics'

// Mode boundaries shared by every swipe deck. Hysteresis (enter > 30, exit <= 25)
// keeps the action that crosses the boundary from remounting the view mid-gesture.
// Lifted out of useContentTriage so Content, Triage, Visibility, and Network all
// flip into the deck at the same pile size.
export const TRIAGE_ENTER = 30
export const TRIAGE_EXIT = 25

export type DeckMode = 'deck' | 'list'

/** Result of an accept/reject: `true` consumes the card (removed from the deck),
 *  `false` leaves it in place (e.g. a human-gate that opened a composer instead). */
export type CommitResult = boolean

interface Options<T> {
  items: T[]
  getId: (t: T) => string
  loading?: boolean
  /** Right swipe — the positive action. Owns its own toast/server call. */
  onAccept: (t: T) => Promise<CommitResult>
  /** Left swipe — fires AFTER a reason is chosen (or skipped → undefined code). */
  onReject: (t: T, reasonCode?: string) => Promise<CommitResult>
  enterAt?: number
  exitAt?: number
}

/**
 * useSwipeTriage — the source-agnostic brain behind every mobile triage deck.
 *
 * Generalized from useContentTriage. It owns three things and nothing else:
 *  1. an optimistic `committed` Set — a swiped card leaves the deck IMMEDIATELY
 *     and stays gone regardless of how a realtime cache re-sorts or lags
 *     (read-your-writes safe); a failed server write restores it.
 *  2. the left-swipe reason buffer — a left swipe removes the card and parks a
 *     `pending` reject; the host shows reason chips; choosing one (or advancing
 *     to the next card) commits the −1 with that code. Cancelling the buffer is
 *     a clean undo: the card returns and NO server call was ever made.
 *  3. the deck/list mode machine with the shared hysteresis thresholds.
 *
 * The actual server calls + toasts live in the host's onAccept/onReject so each
 * surface keeps its own vocabulary ("Accepted. Moved to Today." vs "Pitched.").
 */
export function useSwipeTriage<T>({
  items,
  getId,
  loading,
  onAccept,
  onReject,
  enterAt = TRIAGE_ENTER,
  exitAt = TRIAGE_EXIT,
}: Options<T>) {
  const h = useHaptics()

  const [committed, setCommitted] = useState<Set<string>>(() => new Set())
  const [pending, setPending] = useState<{ id: string; item: T } | null>(null)
  const [override, setOverride] = useState<DeckMode | null>(null)
  const [autoMode, setAutoMode] = useState<DeckMode>('list')
  // The pending reject must be flushable from inside callbacks without going
  // stale, so mirror it in a ref.
  const pendingRef = useRef<{ id: string; item: T } | null>(null)
  pendingRef.current = pending

  const count = items.length

  // Hysteresis: only switch on threshold crossings, never on every realtime tick.
  useEffect(() => {
    if (loading) return
    setAutoMode(prev => {
      if (prev === 'list' && count > enterAt) return 'deck'
      if (prev === 'deck' && count <= exitAt) return 'list'
      return prev
    })
  }, [count, loading, enterAt, exitAt])

  const mode: DeckMode = override ?? autoMode

  const remove = useCallback((id: string) => {
    setCommitted(prev => { const n = new Set(prev); n.add(id); return n })
  }, [])

  const restore = useCallback((id: string) => {
    setCommitted(prev => { const n = new Set(prev); n.delete(id); return n })
  }, [])

  // Commit a parked reject with the given reason (undefined → host default code).
  const resolveReject = useCallback(async (p: { id: string; item: T }, reasonCode?: string) => {
    const ok = await onReject(p.item, reasonCode)
    if (!ok) restore(p.id)
  }, [onReject, restore])

  // Flush any parked reject with the default reason — called before the next
  // gesture so at most one reject is ever pending.
  const flushPending = useCallback(() => {
    const p = pendingRef.current
    if (!p) return
    pendingRef.current = null
    setPending(null)
    void resolveReject(p)
  }, [resolveReject])

  const accept = useCallback(async (item: T) => {
    flushPending()
    const id = getId(item)
    h.heavy()
    remove(id)
    const ok = await onAccept(item)
    if (!ok) restore(id)
  }, [flushPending, getId, h, remove, onAccept, restore])

  const reject = useCallback((item: T) => {
    flushPending()
    const id = getId(item)
    h.heavy()
    remove(id)
    setPending({ id, item })
  }, [flushPending, getId, h, remove])

  const chooseReason = useCallback((reasonCode?: string) => {
    const p = pendingRef.current
    if (!p) return
    pendingRef.current = null
    setPending(null)
    h.select()
    void resolveReject(p, reasonCode)
  }, [h, resolveReject])

  const cancelPending = useCallback(() => {
    const p = pendingRef.current
    if (!p) return
    pendingRef.current = null
    setPending(null)
    h.select()
    restore(p.id) // no server call ever fired — true undo of the destructive swipe
  }, [h, restore])

  const deck = useMemo(
    () => items.filter(i => !committed.has(getId(i))),
    [items, committed, getId],
  )

  return {
    mode,
    setMode: setOverride,
    forceDeck: () => setOverride('deck'),
    exitDeck: () => setOverride('list'),
    deck,
    remaining: deck.length,
    triagedCount: committed.size,
    accept,
    reject,
    pending,
    chooseReason,
    cancelPending,
    restore,
  }
}
