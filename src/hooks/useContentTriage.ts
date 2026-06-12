import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRealtimeContentIdeas, type ContentIdeaRow, type IdeaState } from './useRealtimeContentIdeas'
import { useToast } from '../components/shared/Toast'
import { useHaptics } from './useHaptics'

// Mode boundaries. Hysteresis (enter > 30, exit <= 25) keeps the very action that
// crosses the boundary from remounting the view mid-gesture.
export const TRIAGE_ENTER = 30
export const TRIAGE_EXIT = 25

export type TriageMode = 'triage' | 'action'

// Linear advance map. It STOPS at the two human gates: review (Krish's approval)
// and approved (publish/distribution). A fast clear-the-pile swipe must never
// silently approve or publish — so on those states RIGHT opens the composer.
const ADVANCE_NEXT: Partial<Record<IdeaState, IdeaState>> = {
  seeded: 'researching',
  researching: 'drafting',
  drafting: 'review',
}

const STATE_PRIORITY: Record<string, number> = {
  seeded: 0, researching: 1, drafting: 2, review: 3, approved: 4,
}

function isActive(i: ContentIdeaRow): boolean {
  return i.state !== 'dropped' && i.state !== 'published'
}

async function patchState(id: string, state: IdeaState): Promise<boolean> {
  try {
    const r = await fetch('/api/content-ideas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, state }),
    })
    return r.ok
  } catch {
    return false
  }
}

function openComposer(id: string) {
  window.location.hash = `#/content?idea=${id}`
}

/**
 * useContentTriage — the brain behind the Content tab's two modes.
 *
 * It exposes the full active backlog, a swipe-deck list, the current mode (with
 * hysteresis + a manual override), and the advance/drop/undo actions. Commits are
 * optimistic via a session-scoped `committed` set: a card acted on is removed from
 * the deck IMMEDIATELY and stays gone regardless of how the shared realtime cache
 * re-sorts or lags (read-your-writes safe — the cited fetchAll() coalescing race
 * can't resurrect it). Undo re-PATCHes the prior state and un-commits the id.
 */
export function useContentTriage() {
  const { ideas, loading } = useRealtimeContentIdeas()
  const { toast } = useToast()
  const h = useHaptics()

  const [committed, setCommitted] = useState<Set<string>>(() => new Set())
  const [override, setOverride] = useState<TriageMode | null>(null)
  const [autoMode, setAutoMode] = useState<TriageMode>('action')
  const lastAction = useRef<{ id: string; prevState: IdeaState } | null>(null)
  const [canUndo, setCanUndo] = useState(false)

  const active = useMemo(() => ideas.filter(isActive), [ideas])
  const activeCount = active.length

  // Hysteresis: only move on threshold crossings, never on every realtime tick.
  useEffect(() => {
    if (loading) return
    setAutoMode(prev => {
      if (prev === 'action' && activeCount > TRIAGE_ENTER) return 'triage'
      if (prev === 'triage' && activeCount <= TRIAGE_EXIT) return 'action'
      return prev
    })
  }, [activeCount, loading])

  const mode: TriageMode = override ?? autoMode

  // The deck: active minus already-triaged-this-session, worst state first then oldest.
  const deck = useMemo(() => {
    return active
      .filter(i => !committed.has(i.id))
      .sort((a, b) => {
        const pa = STATE_PRIORITY[a.state] ?? 9
        const pb = STATE_PRIORITY[b.state] ?? 9
        if (pa !== pb) return pa - pb
        return (a.updated_at || '') < (b.updated_at || '') ? -1 : 1
      })
  }, [active, committed])

  const open = useCallback((id: string) => { h.tap(); openComposer(id) }, [h])

  const commit = useCallback(
    async (idea: ContentIdeaRow, next: IdeaState, label: string) => {
      const id = idea.id
      const prevState = idea.state
      h.heavy()
      setCommitted(prev => { const n = new Set(prev); n.add(id); return n })
      lastAction.current = { id, prevState }
      setCanUndo(true)

      const ok = await patchState(id, next)
      if (!ok) {
        // Revert the optimistic removal so the card comes back.
        setCommitted(prev => { const n = new Set(prev); n.delete(id); return n })
        if (lastAction.current?.id === id) { lastAction.current = null; setCanUndo(false) }
        h.error()
        toast('Could not update — try again.', 'error')
        return
      }
      toast(label, 'success', {
        action: { label: 'Undo', onClick: () => undoById(id, prevState) },
      })
    },
    [h, toast],
  )

  const undoById = useCallback(async (id: string, prevState: IdeaState) => {
    setCommitted(prev => { const n = new Set(prev); n.delete(id); return n })
    if (lastAction.current?.id === id) { lastAction.current = null; setCanUndo(false) }
    h.select()
    const ok = await patchState(id, prevState)
    if (!ok) { h.error(); toast('Undo failed — try again.', 'error') }
  }, [h, toast])

  const undo = useCallback(() => {
    const a = lastAction.current
    if (a) undoById(a.id, a.prevState)
  }, [undoById])

  const advance = useCallback((idea: ContentIdeaRow) => {
    const next = ADVANCE_NEXT[idea.state]
    if (!next) { open(idea.id); return } // human gate (review → approve, approved → publish)
    commit(idea, next, `Advanced to ${next}.`)
  }, [commit, open])

  const drop = useCallback((idea: ContentIdeaRow) => {
    commit(idea, 'dropped', 'Dropped.')
  }, [commit])

  // Does RIGHT on this card advance it, or open the composer at a human gate?
  const advanceIsGate = useCallback((state: IdeaState) => !ADVANCE_NEXT[state], [])

  const counts = useMemo(() => {
    const byState: Record<string, number> = {}
    for (const i of active) byState[i.state] = (byState[i.state] || 0) + 1
    return {
      byState,
      upstream: (byState.seeded || 0) + (byState.researching || 0),
      drafting: byState.drafting || 0,
      review: byState.review || 0,
      approved: byState.approved || 0,
    }
  }, [active])

  return {
    loading,
    mode,
    setMode: setOverride,           // pass 'triage' | 'action' | null (null = auto)
    forceTriage: () => setOverride('triage'),
    exitTriage: () => setOverride('action'),
    active,
    activeCount,
    deck,
    remaining: deck.length,
    triagedCount: committed.size,
    advance,
    drop,
    open,
    undo,
    canUndo,
    advanceIsGate,
    counts,
  }
}
