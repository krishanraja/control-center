import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRealtimeContentIdeas, type ContentIdeaRow, type IdeaState } from './useRealtimeContentIdeas'
import { useToast } from '../components/shared/Toast'
import { useHaptics } from './useHaptics'
import { triageReject, feedbackVote } from '../lib/triageActions'
import { DEFAULT_REASON } from '../lib/triageReasons'

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
  return i.state !== 'dropped' && i.state !== 'published' && !i.buried_at
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

// Retain = manually bury (set aside without dropping). Undo just un-buries.
async function sweepAction(action: 'bury' | 'restore', id: string): Promise<boolean> {
  try {
    const r = await fetch('/api/triage/sweep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, source_table: 'content_ideas', source_id: id }),
    })
    const j = await r.json().catch(() => ({}))
    return r.ok && j.ok !== false
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
  const lastAction = useRef<{ id: string; prevState: IdeaState; kind?: 'state' | 'retain' } | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  // Left-swipe drop now teaches Vera (−1). The reason is chosen AFTER the swipe
  // via chips, so a dropped card parks here until a reason is picked (or the next
  // gesture flushes it with the default code). Cancelling before then is a clean
  // undo — no reject was ever sent.
  const [pendingDrop, setPendingDrop] = useState<{ id: string; idea: ContentIdeaRow } | null>(null)
  const pendingDropRef = useRef<{ id: string; idea: ContentIdeaRow } | null>(null)
  pendingDropRef.current = pendingDrop

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
      // Advancing a card is a positive signal: +1 so Vera's content loop learns
      // what Krish keeps moving forward (fire-and-forget; never blocks the swipe).
      void feedbackVote('content_ideas', id, 1, 'cleo', 'content_advanced')
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

  // Undo a retain: un-bury and un-commit (no state change was made).
  const undoRetain = useCallback(async (id: string) => {
    setCommitted(prev => { const n = new Set(prev); n.delete(id); return n })
    if (lastAction.current?.id === id) { lastAction.current = null; setCanUndo(false) }
    h.select()
    const ok = await sweepAction('restore', id)
    if (!ok) { h.error(); toast('Undo failed — try again.', 'error') }
  }, [h, toast])

  const undo = useCallback(() => {
    const a = lastAction.current
    if (!a) return
    if (a.kind === 'retain') undoRetain(a.id)
    else undoById(a.id, a.prevState)
  }, [undoById, undoRetain])

  // Send the −1 reject for a parked drop (the actual state→dropped + feedback_queue
  // vote). On failure the card is restored to the deck.
  const resolveDrop = useCallback(async (p: { id: string; idea: ContentIdeaRow }, reasonCode?: string) => {
    const ok = await triageReject('content_ideas', p.id, 'cleo', reasonCode ?? DEFAULT_REASON.content_ideas)
    if (!ok) {
      setCommitted(prev => { const n = new Set(prev); n.delete(p.id); return n })
      h.error()
      toast('Could not drop — try again.', 'error')
      return
    }
    toast('Dropped. Vera will learn.', 'success')
  }, [h, toast])

  // Flush any parked drop with the default reason before the next gesture, so at
  // most one drop is ever awaiting a reason.
  const flushPendingDrop = useCallback(() => {
    const p = pendingDropRef.current
    if (!p) return
    pendingDropRef.current = null
    setPendingDrop(null)
    void resolveDrop(p)
  }, [resolveDrop])

  const advance = useCallback((idea: ContentIdeaRow) => {
    flushPendingDrop()
    const next = ADVANCE_NEXT[idea.state]
    if (!next) { open(idea.id); return } // human gate (review → approve, approved → publish)
    commit(idea, next, `Advanced to ${next}.`)
  }, [commit, open, flushPendingDrop])

  // Left swipe: optimistically remove the card and park a drop awaiting its reason.
  const drop = useCallback((idea: ContentIdeaRow) => {
    flushPendingDrop()
    const id = idea.id
    h.heavy()
    setCommitted(prev => { const n = new Set(prev); n.add(id); return n })
    setPendingDrop({ id, idea })
  }, [flushPendingDrop, h])

  // Right swipe on a SEEDED card: retain (bury) it for later instead of dropping
  // or committing to research. Optimistic + undoable, mirroring commit().
  const retain = useCallback(async (idea: ContentIdeaRow) => {
    flushPendingDrop()
    const id = idea.id
    h.heavy()
    setCommitted(prev => { const n = new Set(prev); n.add(id); return n })
    lastAction.current = { id, prevState: idea.state, kind: 'retain' }
    setCanUndo(true)

    const ok = await sweepAction('bury', id)
    if (!ok) {
      setCommitted(prev => { const n = new Set(prev); n.delete(id); return n })
      if (lastAction.current?.id === id) { lastAction.current = null; setCanUndo(false) }
      h.error()
      toast('Could not retain — try again.', 'error')
      return
    }
    toast('Retained — find it in Backburner.', 'success', {
      action: { label: 'Undo', onClick: () => undoRetain(id) },
    })
  }, [h, toast, flushPendingDrop, undoRetain])

  const chooseDropReason = useCallback((reasonCode?: string) => {
    const p = pendingDropRef.current
    if (!p) return
    pendingDropRef.current = null
    setPendingDrop(null)
    h.select()
    void resolveDrop(p, reasonCode)
  }, [h, resolveDrop])

  const cancelDrop = useCallback(() => {
    const p = pendingDropRef.current
    if (!p) return
    pendingDropRef.current = null
    setPendingDrop(null)
    h.select()
    setCommitted(prev => { const n = new Set(prev); n.delete(p.id); return n }) // clean undo — no reject sent
  }, [h])

  // Does RIGHT on this card advance it, or open the composer at a human gate?
  const advanceIsGate = useCallback((state: IdeaState) => !ADVANCE_NEXT[state], [])

  // Retained (manually buried) + auto-buried ideas — the Backburner section.
  const buried = useMemo(
    () => ideas.filter(i => i.buried_at && i.state !== 'dropped' && i.state !== 'published'),
    [ideas],
  )

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
    retain,
    buried,
    pendingDrop,
    chooseDropReason,
    cancelDrop,
    open,
    undo,
    canUndo,
    advanceIsGate,
    counts,
  }
}
