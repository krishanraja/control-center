import React, { useMemo, useState } from 'react'
import { Check, Plus, Target } from '@/lib/icons'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useGoalCanon } from '../../hooks/useGoalCanon'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { Eyebrow } from '../shared/Eyebrow'
import { FocusedEditor } from '../shared/FocusedEditor'
import { civilYmd } from '../../lib/civilDate'
import { requestOk, failureMessage } from '../../lib/apiFetch'
import { jobLabel } from '../../content/jobs'
import { openStrategist } from '../../lib/strategist'
import type { DailyMoveState } from '../../hooks/useDailyMove'
import { DailyMoveSlot } from './DailyMoveSlot'

// TODAY, the third layer of the canon. Exactly 3 slots from daily_focus.
//
// The first slot proposes (ADR-028, 2026-10-03). When it is empty, today's
// move from the strategist's morning read sits in it as a proposal he takes,
// sets aside for the next one, or leaves for today. ADR-018 made Today manual
// first; in the 25 days after, he set no slot by hand, so by his ruling the
// machine now drafts the first and he edits. Slots 2 and 3 stay his.
//
// Manual first (2026-09-08): every slot is editable in place. Tap the text (or
// an empty bar) and type; desktop edits inline, a phone opens the focused
// editor sheet. Writes go through POST /api/daily-focus/slot, which leaves
// the day `pending`: only the ritual lock calibrates and asks the machine.
// Slots the shutdown wrote last night arrive here already filled, so the
// morning opens on the 3 he chose at higher capacity.
//
// Done toggles when a slot has text; three quiet empty slots when not (the one
// CTA below the layer is the action; an empty layer never begs). Each pick
// shows the weekly goal it serves when the link exists.
//
// Writes are optimistic (the loading ladder's rule for writes): the slot
// shows the new text or the tick the moment it is tapped, the request goes
// out behind it, and on failure the row reverts with a sentence saying why.
// No spinner in the circle, no disabled row, nothing to wait for on a slow
// link. The overlay below holds what the operator meant until the server
// row catches up through realtime.

type SlotN = 1 | 2 | 3

/** Home's folds that reach Today (src/lib/homeFolds.ts). */
export interface TodayFolds {
  why: boolean
  slots: boolean
  actions: boolean
  card: boolean
}

const NO_FOLDS: TodayFolds = { why: false, slots: false, actions: false, card: false }

export function TodayList({ compact = false, daily, folds = NO_FOLDS, onShowMove }: {
  compact?: boolean
  /** Today's move, read once by Home, which also decides what it folds. */
  daily: DailyMoveState
  folds?: TodayFolds
  /** Open the folded move by hand. */
  onShowMove?: () => void
}) {
  const { today, refresh } = useDailyFocus()
  const { canon } = useGoalCanon()
  const h = useHaptics()
  const { toast } = useToast()
  const [editingN, setEditingN] = useState<SlotN | null>(null)
  const [draft, setDraft] = useState('')
  const [sheetN, setSheetN] = useState<SlotN | null>(null)
  // What the operator just did, ahead of the server. Cleared when the row
  // catches up (realtime refresh) or the write fails.
  const [optimistic, setOptimistic] = useState<Partial<Record<SlotN, { text?: string | null; done?: boolean }>>>({})

  const weeklyTitle = useMemo(
    () => new Map((canon?.weekly ?? []).map(g => [g.id, g.title])),
    [canon],
  )

  const slots = ([1, 2, 3] as SlotN[]).map(n => {
    const o = optimistic[n]
    return {
      n,
      text: o && 'text' in o ? (o.text ?? null) : ((today?.[`target_${n}_text`] as string | null) ?? null),
      done: o && 'done' in o ? Boolean(o.done) : Boolean(today?.[`target_${n}_completed_at`]),
      goalId: (today?.[`target_${n}_goal_id`] as string | null | undefined) ?? null,
      job: (today?.[`target_${n}_job`] as string | null | undefined) ?? null,
    }
  })
  const anySet = slots.some(s => s.text && s.text.trim())

  // The move proposed in slot 1 when it is empty (ADR-028).
  const proposalFor = (n: SlotN, has: boolean) =>
    n === 1 && !has && editingN !== 1 && sheetN !== 1 ? daily.current : null
  // An empty slot folds into the header's Add when Home is short of room,
  // unless it is being written in or holds the proposal.
  const folded = (n: SlotN, has: boolean) =>
    folds.slots && !has && editingN !== n && !proposalFor(n, has)
  const foldedSlots = slots.filter(t => folded(t.n, Boolean(t.text && t.text.trim()))).map(t => t.n)
  const firstFolded: SlotN | null = foldedSlots.length ? foldedSlots[0] : null
  const doneCount = slots.filter(s => s.done).length

  const settle = (n: SlotN) => setOptimistic(prev => { const next = { ...prev }; delete next[n]; return next })
  // The overlay comes off only once the row that carries the write is back.
  // Dropped any sooner, the slot shows the old row for the length of the read:
  // a taken move blinks empty before it reads as his. A failed read is the
  // realtime path's to repair, never a reason to call a saved write failed.
  const caughtUp = () => refresh().catch(() => undefined)

  const toggleComplete = async (n: SlotN) => {
    if (!today) return
    const wasDone = slots[n - 1].done
    if (wasDone) return // the RPC only completes; undoing a tick is not a write it offers
    h.success()
    setOptimistic(prev => ({ ...prev, [n]: { ...prev[n], done: true } }))
    try {
      await requestOk('/api/daily-focus/complete', {
        method: 'POST',
        body: { date: today.focus_date, target_num: n },
        timeoutMs: 12_000,
      })
      await caughtUp()
      settle(n)
    } catch (e) {
      h.error()
      settle(n)
      toast(failureMessage(e, 'Could not mark it done.'), 'error', {
        action: { label: 'Retry', onClick: () => { void toggleComplete(n) } },
      })
    }
  }

  // The one manual write for a slot. Today's civil date, so a row the shutdown
  // wrote for today is the one that gets edited. Shows at once, saves behind.
  const saveSlot = async (n: SlotN, text: string, suggestionId: string | null = null): Promise<boolean> => {
    h.success()
    setOptimistic(prev => ({ ...prev, [n]: { ...prev[n], text: text || null } }))
    try {
      await requestOk('/api/daily-focus/slot', {
        method: 'POST',
        // The move's bank id rides with a taken move (ADR-030), so the tick
        // on this slot can be recorded as did_it against it.
        body: { date: today?.focus_date ?? civilYmd(new Date()), slot: n, text, ...(suggestionId ? { suggestion_id: suggestionId } : {}) },
        timeoutMs: 12_000,
      })
      await caughtUp()
      settle(n)
      return true
    } catch (e) {
      h.error()
      settle(n)
      toast(failureMessage(e), 'error', {
        action: { label: 'Retry', onClick: () => { void saveSlot(n, text) } },
      })
      return false
    }
  }

  const startEdit = (n: SlotN) => {
    h.select()
    if (compact) { setSheetN(n); return }
    setEditingN(n)
    setDraft(slots[n - 1].text ?? '')
  }

  const commitEdit = async () => {
    if (editingN === null) return
    const n = editingN
    const text = draft.trim()
    const before = (slots[n - 1].text ?? '').trim()
    setEditingN(null)
    if (text === before) return
    await saveSlot(n, text)
  }

  return (
    <section aria-label="Today" className="min-w-0">
      <div className={`flex items-baseline gap-2 ${folds.actions ? 'mb-1' : 'mb-2'}`}>
        <Eyebrow>Today</Eyebrow>
        {anySet && (
          <span className="text-micro text-ink-faint tabular-nums font-mono">{doneCount}/3</span>
        )}
        {/* Folded empty slots (Home never scrolls): one Add opens the first. */}
        {firstFolded !== null && (
          <button
            type="button"
            onClick={() => startEdit(firstFolded)}
            data-testid="today-add"
            aria-label={`Set target ${firstFolded}`}
            className="tap-44 ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-micro font-semibold text-ink-muted hover:text-violet-200 transition-colors"
          >
            <Plus size={10} /> Add
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-1.5" aria-label={anySet ? undefined : 'Not set yet'}>
        {slots.map(t => {
          const has = Boolean(t.text && t.text.trim())
          const editing = editingN === t.n
          if (folded(t.n, has)) return null
          const proposal = proposalFor(t.n, has)
          if (proposal) {
            const { move, rank, outcome } = proposal
            const asks = daily.wire?.read?.asks ?? []
            const hasAsk = Boolean(move.contact_id) && asks.some(a => a.to.kind === 'named' && a.to.person.contact_id === move.contact_id)
            return (
              <DailyMoveSlot
                key="daily-move"
                move={move}
                outcome={outcome ?? null}
                // The challenge was put to the read's first pick. Once that is
                // set aside it describes a move that is no longer on screen.
                challenge={rank === 1 ? daily.wire?.read?.challenge : null}
                hasAsk={hasAsk}
                compact={compact}
                fold={{ why: folds.why, actions: folds.actions, card: folds.card }}
                onShow={onShowMove}
                onTake={() => {
                  void saveSlot(1, move.text, move.suggestion_id ?? null).then(ok => {
                    if (ok) daily.answer(move, 'accepted', { final: { text: move.text } })
                  })
                }}
                onNotThis={(code, note) => daily.answer(move, 'rejected', { reason_code: code, note })}
                onLater={() => daily.answer(move, 'deferred')}
                onOpenAsk={() => openStrategist({ mode: 'daily' })}
              />
            )
          }
          return (
            <li key={t.n} className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => has && toggleComplete(t.n)}
                disabled={!has}
                aria-label={has ? (t.done ? `Target ${t.n} done` : `Mark target ${t.n} done`) : `Target ${t.n} not set`}
                className={`mt-[1px] ${compact ? 'w-[22px] h-[22px]' : 'w-[26px] h-[26px]'} rounded-full border flex-shrink-0 inline-flex items-center justify-center transition-colors ${
                  t.done
                    ? 'bg-emerald-500/40 border-emerald-400/60 text-emerald-50'
                    : has
                      ? 'border-white/25 hover:border-violet-400/60'
                      : 'border-white/[0.12]'
                } disabled:opacity-100`}
              >
                {t.done
                  ? <Check size={13} />
                  : <span className={`text-micro font-bold tabular-nums font-mono ${has ? 'text-ink-muted' : 'text-ink-faint'}`}>{t.n}</span>}
              </button>

              {editing ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={() => void commitEdit()}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); void commitEdit() }
                    if (e.key === 'Escape') { e.preventDefault(); setEditingN(null) }
                  }}
                  placeholder="What leaves the machine today?"
                  aria-label={`Target ${t.n}`}
                  className="flex-1 min-w-0 min-h-[30px] px-2 rounded-lg bg-white/[0.04] border border-white/10 text-body text-ink placeholder:text-ink-faint/50 outline-none focus:border-violet-400/40"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(t.n)}
                  aria-label={has ? `Edit target ${t.n}` : `Set target ${t.n}`}
                  className="flex-1 min-w-0 text-left pt-[3px] group/slot"
                >
                  {has ? (
                    <>
                      <p className={`text-body leading-snug break-words ${compact ? 'line-clamp-1' : 'line-clamp-2'} ${t.done ? 'text-ink-faint line-through' : 'text-ink group-hover/slot:text-ink'}`}>
                        {t.text}
                      </p>
                      {!compact && (t.job || (t.goalId && weeklyTitle.get(t.goalId))) && (
                        <p className="text-micro text-ink-faint leading-snug mt-0.5 inline-flex items-center gap-1.5 min-w-0">
                          {t.job && <span className="shrink-0 px-1 py-0.5 rounded bg-white/[0.06]">{jobLabel(t.job)}</span>}
                          {t.goalId && weeklyTitle.get(t.goalId) && (
                            <span className="inline-flex items-center gap-1 min-w-0">
                              <Target size={9} className="flex-shrink-0 opacity-60" />
                              <span className="truncate">{weeklyTitle.get(t.goalId)}</span>
                            </span>
                          )}
                        </p>
                      )}
                    </>
                  ) : (
                    // Unset: a quiet bar. Tapping it is how a slot gets written by hand.
                    <span className="block h-[8px] mt-[6px] rounded bg-white/[0.04] group-hover/slot:bg-white/[0.08] transition-colors" />
                  )}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {/* The phone's slot editor. Same wire path; this sheet is only the hands. */}
      <FocusedEditor
        open={sheetN !== null}
        onClose={() => setSheetN(null)}
        label={sheetN ? `Today, ${sheetN === 1 ? 'first' : sheetN === 2 ? 'second' : 'third'}` : 'Today'}
        value={sheetN ? (slots[sheetN - 1].text ?? '') : ''}
        placeholder="What leaves the machine today?"
        onSave={async text => sheetN ? await saveSlot(sheetN, text) : false}
      />
    </section>
  )
}
