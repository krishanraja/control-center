import React, { useMemo, useState } from 'react'
import { Check, Target } from 'lucide-react'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useGoalCanon } from '../../hooks/useGoalCanon'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { Eyebrow } from '../shared/Eyebrow'
import { Working } from '../shared/Working'

// TODAY — the third layer of the canon. Exactly 3 slots from daily_focus:
// done toggles when locked, three quiet empty slots when not (the one CTA
// below the layer is the action; an empty layer never begs). Each pick shows
// the weekly goal it serves when the link exists.

export function TodayList({ compact = false }: { compact?: boolean } = {}) {
  const { today, refresh } = useDailyFocus()
  const { canon } = useGoalCanon()
  const h = useHaptics()
  const { toast } = useToast()
  const [busyN, setBusyN] = useState<number | null>(null)

  const weeklyTitle = useMemo(
    () => new Map((canon?.weekly ?? []).map(g => [g.id, g.title])),
    [canon],
  )

  const targets = today
    ? ([
        { n: 1 as const, text: today.target_1_text, done: !!today.target_1_completed_at, goalId: today.target_1_goal_id ?? null },
        { n: 2 as const, text: today.target_2_text, done: !!today.target_2_completed_at, goalId: today.target_2_goal_id ?? null },
        { n: 3 as const, text: today.target_3_text, done: !!today.target_3_completed_at, goalId: today.target_3_goal_id ?? null },
      ])
    : null
  const doneCount = targets ? targets.filter(t => t.done).length : 0

  const toggleComplete = async (n: 1 | 2 | 3) => {
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

  return (
    <section aria-label="Today" className="min-w-0">
      <div className="flex items-baseline gap-2 mb-2">
        <Eyebrow>Today</Eyebrow>
        {targets && (
          <span className="text-micro text-white/35 tabular-nums font-mono">{doneCount}/3</span>
        )}
      </div>

      {targets ? (
        <ul className="flex flex-col gap-1.5">
          {targets.map(t => (
            <li key={t.n} className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => toggleComplete(t.n)}
                disabled={busyN === t.n}
                aria-label={`Mark target ${t.n} ${t.done ? 'not done' : 'done'}`}
                className={`mt-[1px] w-[26px] h-[26px] rounded-full border flex-shrink-0 inline-flex items-center justify-center transition-colors ${
                  t.done
                    ? 'bg-emerald-500/40 border-emerald-400/60 text-emerald-50'
                    : 'border-white/25 hover:border-violet-400/60'
                } disabled:opacity-50`}
              >
                {busyN === t.n
                  ? <Working size={12} />
                  : t.done
                    ? <Check size={13} />
                    : <span className="text-micro font-bold text-white/35 tabular-nums font-mono">{t.n}</span>}
              </button>
              <div className="flex-1 min-w-0 pt-[3px]">
                <p className={`text-body leading-snug break-words ${compact ? 'line-clamp-1' : 'line-clamp-2'} ${t.done ? 'text-white/40 line-through' : 'text-white/90'}`}>
                  {t.text || '—'}
                </p>
                {!compact && t.goalId && weeklyTitle.get(t.goalId) && (
                  <p className="text-micro text-white/40 leading-snug mt-0.5 inline-flex items-center gap-1 min-w-0">
                    <Target size={9} className="flex-shrink-0 opacity-60" />
                    <span className="truncate">{weeklyTitle.get(t.goalId)}</span>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        // Unset: three quiet slots. The CTA below the layer is the ask.
        <ul className="flex flex-col gap-1.5" aria-label="Not set yet">
          {[1, 2, 3].map(n => (
            <li key={n} className="flex items-center gap-3">
              <span className={`${compact ? 'w-[22px] h-[22px]' : 'w-[26px] h-[26px]'} rounded-full border border-white/[0.12] flex-shrink-0 inline-flex items-center justify-center`}>
                <span className="text-micro font-bold text-white/25 tabular-nums font-mono">{n}</span>
              </span>
              <span className="flex-1 h-[8px] rounded bg-white/[0.04]" />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
