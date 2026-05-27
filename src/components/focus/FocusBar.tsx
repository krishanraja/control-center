import React, { useState } from 'react'
import { Check, RefreshCw } from 'lucide-react'
import { useDailyFocus, isFocusEnabled } from '../../hooks/useDailyFocus'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'

// Phase 1: compact today display + completion circles. Renders when
// daily_focus.status='calibrated' or 'complete' for today.

export function FocusBar() {
  const { today, refresh } = useDailyFocus()
  const h = useHaptics()
  const { toast } = useToast()
  const [busyN, setBusyN] = useState<number | null>(null)

  if (!isFocusEnabled()) return null
  if (!today || (today.status !== 'calibrated' && today.status !== 'complete')) return null

  const targets = [
    { n: 1, text: today.target_1_text, done: !!today.target_1_completed_at },
    { n: 2, text: today.target_2_text, done: !!today.target_2_completed_at },
    { n: 3, text: today.target_3_text, done: !!today.target_3_completed_at },
  ]
  const allDone = targets.every(t => t.done)

  const toggleComplete = async (n: 1 | 2 | 3) => {
    if (busyN !== null) return
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

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 py-3">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/55 font-semibold">Today</div>
        {targets.map((t) => (
          <div key={t.n} className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => toggleComplete(t.n as 1 | 2 | 3)}
              disabled={busyN === t.n}
              aria-label={`Mark target ${t.n} ${t.done ? 'incomplete' : 'complete'}`}
              className={`w-5 h-5 rounded-full border flex-shrink-0 inline-flex items-center justify-center transition-colors ${
                t.done
                  ? 'bg-emerald-500/40 border-emerald-400/60 text-emerald-50'
                  : 'border-white/30 hover:border-violet-400/60'
              } disabled:opacity-50`}
            >
              {t.done && <Check size={11} />}
            </button>
            <span className={`text-[12px] truncate max-w-[24ch] ${t.done ? 'text-white/45 line-through' : 'text-white/90'}`}>
              {t.text || '—'}
            </span>
          </div>
        ))}
        <div className="ml-auto" />
        {allDone ? (
          <span className="text-[11px] text-emerald-300 font-semibold">3 shipped. What's next?</span>
        ) : (
          <span className="text-[11px] text-white/45 tabular-nums">
            {targets.filter(t => t.done).length} of 3
          </span>
        )}
      </div>
    </section>
  )
}
