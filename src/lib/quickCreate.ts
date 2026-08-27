import { useEffect, useRef } from 'react'

// Tiny module-level event bus for the mobile create sheet (CreateSheet.tsx).
//
// The + button is the ONE way to create things on a phone, but several create
// flows are owned by components mounted deep inside the active tab (the goal
// composer inside GoalLadder, the ask compose state inside FocusPurposeTab).
// Threading open-state up through App and back down every shell is the exact
// prop-drilling the focusRitual bus (src/lib/focusRitual.ts) exists to avoid,
// so this mirrors that pattern: the sheet fires a kind, whichever mounted
// surface owns that kind reacts.
//
// Kinds in use:
//   'goal:os'      GoalLadder opens the OS-goal composer
//   'goal:weekly'  GoalLadder opens the weekly-objective composer
//   'ask'          FocusPurposeTab focuses the ask compose field
//   'talk'         TabChatHost opens the chat panel for the ACTIVE tab.
//                  One kind, not one per tab: the host is mounted in App and
//                  already knows which tab is showing, so a kind per tab would
//                  be seven subscriptions carrying what the host has.

type Handler = () => void
const handlers = new Map<string, Set<Handler>>()

/** Fire a create request. Returns false when nothing is listening. */
export function requestCreate(kind: string): boolean {
  const set = handlers.get(kind)
  if (!set || set.size === 0) return false
  for (const h of [...set]) h()
  return true
}

/** Subscribe the mounted owner of one create kind. */
export function useQuickCreateListener(kind: string, fn: () => void): void {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const h = () => ref.current()
    let set = handlers.get(kind)
    if (!set) {
      set = new Set()
      handlers.set(kind, set)
    }
    set.add(h)
    return () => {
      set.delete(h)
    }
  }, [kind])
}
