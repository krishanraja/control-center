import React, { useMemo, useState } from 'react'
import { Check, Target, ShieldAlert } from 'lucide-react'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useHomeIntelligence } from '../../hooks/useHomeIntelligence'
import { useTaskParentObjectives } from '../../hooks/useTaskParentObjectives'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { Working } from '../shared/Working'

// TRACK phase of the daily spine. Renders once today's 3 are locked, through
// completion. While daily_focus.status is 'pending' it shows a labor-illusion
// mapping banner but the completion circles are live immediately, so a slow or
// failed calibrate webhook never traps the user. Goal-gradient + endowed
// progress drive the bar and copy; the brief's anti-action stays pinned as a
// guardrail; each target shows the objective it ladders up to when resolvable.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function TrackStep() {
  const { today, refresh } = useDailyFocus()
  const { intel } = useHomeIntelligence()
  const h = useHaptics()
  const { toast } = useToast()
  const [busyN, setBusyN] = useState<number | null>(null)

  // Marcus picks store their action_target_id (a task id) in target_N_concept_id.
  // Only real uuids are worth a ladder lookup; krish-added free text is skipped
  // so the supabase uuid filter never errors on a non-uuid concept slug.
  const conceptIds = useMemo(() => {
    if (!today) return []
    return [today.target_1_concept_id, today.target_2_concept_id, today.target_3_concept_id]
      .filter((v): v is string => !!v && UUID_RE.test(v))
  }, [today])
  const parents = useTaskParentObjectives(conceptIds)

  if (!today) return null

  const mapping = today.status === 'pending'
  const targets = [
    { n: 1 as const, text: today.target_1_text, done: !!today.target_1_completed_at, cid: today.target_1_concept_id },
    { n: 2 as const, text: today.target_2_text, done: !!today.target_2_completed_at, cid: today.target_2_concept_id },
    { n: 3 as const, text: today.target_3_text, done: !!today.target_3_completed_at, cid: today.target_3_concept_id },
  ]
  const doneCount = targets.filter(t => t.done).length
  const allDone = doneCount === 3
  const antiAction = intel.daily_brief?.one_anti_action

  const gradientCopy = allDone
    ? '3 shipped. Close the day below.'
    : doneCount === 2 ? 'One more to ship the day.'
    : doneCount === 1 ? 'One down. Keep the chain.'
    : 'Your 3 are locked. Start the chain.'

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
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 min-w-0">
      <header className="flex items-baseline gap-2 mb-3">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-white/55 font-semibold">Today's 3</h2>
        <span className="ml-auto text-[11px] text-white/40 tabular-nums">{doneCount} of 3</span>
      </header>

      {mapping && (
        <div className="mb-3 flex items-center gap-2 text-[11px] text-violet-200/80">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0"
            style={{ animation: 'glow-pulse 1.6s ease-in-out infinite' }}
          />
          Marcus is mapping your day to these. You can start now.
        </div>
      )}

      {/* Endowed-progress bar: each segment carries a hairline before completion
          so the day never starts visually empty. */}
      <div className="flex gap-1 mb-3">
        {targets.map(t => (
          <div key={t.n} className={`h-1 flex-1 rounded-full overflow-hidden ${t.done ? 'bg-emerald-400/80' : 'bg-white/[0.10]'}`}>
            {!t.done && <div className="h-1 w-[8%] rounded-full bg-violet-400/40" />}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {targets.map(t => {
          const ladder = t.cid ? parents[t.cid] : undefined
          return (
            <div key={t.n} className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => toggleComplete(t.n)}
                disabled={busyN === t.n}
                aria-label={`Mark target ${t.n} ${t.done ? 'done' : 'complete'}`}
                className={`mt-0.5 w-11 h-11 sm:w-9 sm:h-9 rounded-full border flex-shrink-0 inline-flex items-center justify-center transition-colors ${
                  t.done
                    ? 'bg-emerald-500/40 border-emerald-400/60 text-emerald-50'
                    : 'border-white/30 hover:border-violet-400/60'
                } disabled:opacity-50`}
              >
                {busyN === t.n
                  ? <Working size={14} />
                  : t.done
                    ? <Check size={15} />
                    : <span className="text-[12px] font-bold text-white/35 tabular-nums">{t.n}</span>}
              </button>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className={`text-[13px] leading-snug break-words ${t.done ? 'text-white/45 line-through' : 'text-white/90'}`}>
                  {t.text || '—'}
                </p>
                {ladder && (
                  <p className="text-[10px] text-white/45 leading-snug mt-0.5 inline-flex items-start gap-1">
                    <Target size={9} className="mt-[2px] flex-shrink-0 opacity-60" />
                    <span>Ladders up to: <span className="text-white/65">{ladder}</span></span>
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className={`text-[11px] mt-3 ${allDone ? 'text-emerald-300 font-semibold' : 'text-white/50'}`}>{gradientCopy}</p>

      {antiAction && !allDone && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/15 bg-red-500/[0.04] px-3 py-2">
          <ShieldAlert size={12} className="text-red-300/80 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-red-200/75 leading-snug break-words">
            <span className="font-semibold">Today, don't: </span>{antiAction}
          </p>
        </div>
      )}
    </section>
  )
}
