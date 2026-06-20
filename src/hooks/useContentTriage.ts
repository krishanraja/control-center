import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRealtimeContentIdeas, type ContentIdeaRow, type IdeaState } from './useRealtimeContentIdeas'
import { useToast } from '../components/shared/Toast'
import { useHaptics } from './useHaptics'
import { triageReject, feedbackVote } from '../lib/triageActions'
import { DEFAULT_REASON } from '../lib/triageReasons'
import {
  ADVANCE_NEXT, STATE_PRIORITY, isActiveIdea, advanceMode, nextState,
} from '../lib/contentEngine'

// Mode boundaries. Hysteresis (enter > 30, exit <= 25) keeps the very action that
// crosses the boundary from remounting the view mid-gesture.
export const TRIAGE_ENTER = 30
export const TRIAGE_EXIT = 25

export type TriageMode = 'triage' | 'action'

// State machine (ADVANCE_NEXT / STATE_PRIORITY / isActiveIdea) is imported from
// the single source of truth in lib/contentEngine. No local copies (the old
// duplication was the root of CORE_PROBLEM F-2).
const isActive = isActiveIdea

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

// Narrative clustering runs server-side and writes related_idea_ids, which the
// draft-merge UI reads. The nightly cron keeps it fresh, but to avoid a stale
// gap (and so a fresh draft pile groups without waiting for 4am) we nudge the
// clusterer when the Content tab opens onto ≥2 drafts that nothing has grouped
// yet. Throttled hard so realtime churn can't spam it.
const CLUSTER_THROTTLE_MS = 15 * 60 * 1000
const CLUSTER_LS_KEY = 'content.cluster.lastRun'
function maybeTriggerClustering(drafts: ContentIdeaRow[]) {
  if (drafts.length < 2) return
  if (drafts.some(d => (d.related_idea_ids?.length ?? 0) > 0)) return // already grouped
  try {
    const last = Number(localStorage.getItem(CLUSTER_LS_KEY) || 0)
    if (Date.now() - last < CLUSTER_THROTTLE_MS) return
    localStorage.setItem(CLUSTER_LS_KEY, String(Date.now()))
  } catch { /* ignore */ }
  // Fire-and-forget; realtime repaints with clusters once it writes.
  void fetch('/api/content-ideas/cluster', { method: 'POST' }).catch(() => {})
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
    const mode = advanceMode(idea.state)
    // 'develop' and 'open' both go to the Composer — a card never gets relabeled
    // into researching/drafting/review with no real content (CORE_PROBLEM F-1).
    if (mode !== 'relabel') { open(idea.id); return }
    const next = nextState(idea.state)
    if (!next) { open(idea.id); return }
    commit(idea, next, `Advanced to ${next}.`)
  }, [commit, open, flushPendingDrop])

  // Triage RIGHT = send to draft. Upstream cards (seeded/researching) jump
  // straight into the drafting pile — triage's only forward move is "I'll write
  // this" (no separate research stage). Cards already drafting or at a gate just
  // open the composer to keep working.
  const sendToDraft = useCallback((idea: ContentIdeaRow) => {
    flushPendingDrop()
    if (idea.state === 'seeded' || idea.state === 'researching') {
      commit(idea, 'drafting', 'Sent to drafts.')
    } else {
      open(idea.id)
    }
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

  // Does RIGHT on this card open the Composer (develop/gate) rather than a pure
  // relabel advance? True for researching/drafting/review/approved.
  const advanceIsGate = useCallback((state: IdeaState) => advanceMode(state) !== 'relabel', [])

  // Retained (manually buried) + auto-buried ideas — the Backburner section.
  const buried = useMemo(
    () => ideas.filter(i => i.buried_at && i.state !== 'dropped' && i.state !== 'published'),
    [ideas],
  )

  // Nudge the server clusterer when drafts are present but ungrouped, so the
  // merge UI lights up without waiting for the nightly run. Throttled internally.
  const drafts = useMemo(() => active.filter(i => i.state === 'drafting'), [active])
  useEffect(() => {
    if (loading) return
    maybeTriggerClustering(drafts)
  }, [loading, drafts])

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
    sendToDraft,
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
