import React, { useMemo, useState } from 'react'
import { Check, Target } from '@/lib/icons'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useGoalCanon } from '../../hooks/useGoalCanon'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { Eyebrow } from '../shared/Eyebrow'
import { FocusedEditor } from '../shared/FocusedEditor'
import { civilYmd } from '../../lib/civilDate'
import { requestOk, failureMessage } from '../../lib/apiFetch'
import { jobLabel } from '../../content/jobs'

// TODAY, the third layer of the canon. Exactly 3 slots from daily_focus.
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

export function TodayList({ compact = false }: { compact?: boolean } = {}) {
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
  const doneCount = slots.filter(s => s.done).length

  const settle = (n: SlotN) => setOptimistic(prev => { const next = { ...prev }; delete next[n]; return next })

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
      refresh()
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
  const saveSlot = async (n: SlotN, text: string): Promise<boolean> => {
    h.success()
    setOptimistic(prev => ({ ...prev, [n]: { ...prev[n], text: text || null } }))
    try {
      await requestOk('/api/daily-focus/slot', {
        method: 'POST',
        body: { date: today?.focus_date ?? civilYmd(new Date()), slot: n, text },
        timeoutMs: 12_000,
      })
      refresh()
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
      <div className="flex items-baseline gap-2 mb-2">
        <Eyebrow>Today</Eyebrow>
        {anySet && (
          <span className="text-micro text-white/35 tabular-nums font-mono">{doneCount}/3</span>
        )}
      </div>

      <ul className="flex flex-col gap-1.5" aria-label={anySet ? undefined : 'Not set yet'}>
        {slots.map(t => {
          const has = Boolean(t.text && t.text.trim())
          const editing = editingN === t.n
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
                  : <span className={`text-micro font-bold tabular-nums font-mono ${has ? 'text-white/35' : 'text-white/25'}`}>{t.n}</span>}
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
                  className="flex-1 min-w-0 min-h-[30px] px-2 rounded-lg bg-white/[0.04] border border-white/10 text-body text-white/90 placeholder:text-white/25 outline-none focus:border-violet-400/40"
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
                      <p className={`text-body leading-snug break-words ${compact ? 'line-clamp-1' : 'line-clamp-2'} ${t.done ? 'text-white/40 line-through' : 'text-white/90 group-hover/slot:text-white'}`}>
                        {t.text}
                      </p>
                      {!compact && (t.job || (t.goalId && weeklyTitle.get(t.goalId))) && (
                        <p className="text-micro text-white/40 leading-snug mt-0.5 inline-flex items-center gap-1.5 min-w-0">
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
