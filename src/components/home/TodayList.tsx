import React, { useMemo, useState } from 'react'
import { Check, Target } from '@/lib/icons'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useGoalCanon } from '../../hooks/useGoalCanon'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { Eyebrow } from '../shared/Eyebrow'
import { FocusedEditor } from '../shared/FocusedEditor'
import { civilYmd } from '../../lib/civilDate'
import { jobLabel } from '../../content/jobs'
import { Working } from '../shared/Working'

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

type SlotN = 1 | 2 | 3

export function TodayList({ compact = false }: { compact?: boolean } = {}) {
  const { today, refresh } = useDailyFocus()
  const { canon } = useGoalCanon()
  const h = useHaptics()
  const { toast } = useToast()
  const [busyN, setBusyN] = useState<number | null>(null)
  const [editingN, setEditingN] = useState<SlotN | null>(null)
  const [draft, setDraft] = useState('')
  const [sheetN, setSheetN] = useState<SlotN | null>(null)

  const weeklyTitle = useMemo(
    () => new Map((canon?.weekly ?? []).map(g => [g.id, g.title])),
    [canon],
  )

  const slots = ([1, 2, 3] as SlotN[]).map(n => ({
    n,
    text: (today?.[`target_${n}_text`] as string | null) ?? null,
    done: Boolean(today?.[`target_${n}_completed_at`]),
    goalId: (today?.[`target_${n}_goal_id`] as string | null | undefined) ?? null,
    job: (today?.[`target_${n}_job`] as string | null | undefined) ?? null,
  }))
  const anySet = slots.some(s => s.text && s.text.trim())
  const doneCount = slots.filter(s => s.done).length

  const toggleComplete = async (n: SlotN) => {
    if (!today || busyN !== null) return
    setBusyN(n)
    h.tap()
    try {
      const r = await fetch('/api/daily-focus/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today.focus_date, target_num: n }),
      })
      const j = await r.json().catch(() => ({}))
      if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      h.success()
      refresh()
    } catch (e) {
      h.error()
      toast(`Could not mark complete: ${(e as Error).message}`, 'error')
    } finally {
      setBusyN(null)
    }
  }

  // The one manual write for a slot. Today's civil date, so a row the shutdown
  // wrote for today is the one that gets edited.
  const saveSlot = async (n: SlotN, text: string): Promise<boolean> => {
    const r = await fetch('/api/daily-focus/slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today?.focus_date ?? civilYmd(new Date()), slot: n, text }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.ok) {
      h.error()
      toast(`Could not save: ${j.error || `HTTP ${r.status}`}`, 'error')
      return false
    }
    h.success()
    refresh()
    return true
  }

  const startEdit = (n: SlotN) => {
    if (busyN !== null) return
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
    setBusyN(n)
    try { await saveSlot(n, text) } finally { setBusyN(null) }
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
                disabled={busyN === t.n || !has}
                aria-label={has ? `Mark target ${t.n} ${t.done ? 'not done' : 'done'}` : `Target ${t.n} not set`}
                className={`mt-[1px] ${compact ? 'w-[22px] h-[22px]' : 'w-[26px] h-[26px]'} rounded-full border flex-shrink-0 inline-flex items-center justify-center transition-colors ${
                  t.done
                    ? 'bg-emerald-500/40 border-emerald-400/60 text-emerald-50'
                    : has
                      ? 'border-white/25 hover:border-violet-400/60'
                      : 'border-white/[0.12]'
                } disabled:opacity-100`}
              >
                {busyN === t.n
                  ? <Working size={12} />
                  : t.done
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
