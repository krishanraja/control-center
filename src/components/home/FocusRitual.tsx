import React, { useEffect, useMemo, useState } from 'react'
import {
  Sparkles, Check, Loader2, Target, Clock, ArrowLeft, ArrowRight,
  CheckCircle2, Inbox, Flame,
} from 'lucide-react'
import { useAltitudes, type AltitudeId } from '../../hooks/useAltitudes'
import { useObjectives } from '../../hooks/useObjectives'
import { useWeeklyFocus } from '../../hooks/useWeeklyFocus'
import { useDailyFocus, isFocusEnabled } from '../../hooks/useDailyFocus'
import { useStreaks } from '../../hooks/useStreaks'
import { useRealtimeDecisionsWaiting } from '../../hooks/useRealtimeDecisionsWaiting'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { BottomSheet } from '../mobile/BottomSheet'
import { NominationTray } from '../objectives/NominationTray'
import { MilestoneCalibrator } from '../objectives/MilestoneCalibrator'
import { ContextHeader } from '../focus/ContextHeader'
import { CarryOverPrompt } from '../focus/CarryOverPrompt'
import { FocusCalibrator } from '../focus/FocusCalibrator'
import { isFocusRitualEnabled } from '../../lib/homeV2'
import { useFocusRitualOpen, closeFocusRitual } from '../../lib/focusRitual'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

// The unified Focus Ritual. One guided stepper that walks only the altitudes that
// are stale, one decision per screen, then closes on a "you're set" summary.
// Each step hosts the component that already owns that altitude's decision
// (NominationTray, MilestoneCalibrator, FocusCalibrator), so this is orchestration
// over reuse. Active-pick throughout: nothing is pre-selected. Mounted once at App
// level (z-stacks above both shells) and self-gates to tab==='home' + the flag +
// the open bus. Supersedes WeeklyFocusTakeover when the ritual flag is on.

type StepId = AltitudeId | 'summary'

export function FocusRitual({
  narrow,
  tab,
  onNavigate,
}: {
  narrow: boolean
  tab: string
  onNavigate?: NavigateFn
}) {
  const { open, startAt } = useFocusRitualOpen()
  const alt = useAltitudes()
  const h = useHaptics()

  // Build the ordered step list: the pending altitudes (or, if launched from a
  // specific pill, that altitude first), then the closing summary.
  const stepIds = useMemo<StepId[]>(() => {
    const pendingIds = alt.pending.map(p => p.id)
    let ids: AltitudeId[]
    if (startAt) {
      ids = [startAt, ...pendingIds.filter(id => id !== startAt)]
    } else {
      ids = pendingIds
    }
    return [...ids, 'summary']
  }, [alt.pending, startAt])

  const [stepIdx, setStepIdx] = useState(0)

  // Reset to the first step each time the ritual is (re)opened.
  useEffect(() => { if (open) setStepIdx(0) }, [open, startAt])

  // Keep the index in range if the step list shrinks (e.g. an altitude flips to
  // set via realtime while open).
  useEffect(() => {
    setStepIdx(i => Math.min(i, Math.max(0, stepIds.length - 1)))
  }, [stepIds.length])

  if (tab !== 'home' || !isFocusRitualEnabled() || !open) return null

  const total = stepIds.length
  const current = stepIds[Math.min(stepIdx, total - 1)]
  const isLast = stepIdx >= total - 1
  // Bounded budget: ~1 minute per remaining decision step (summary excluded), so
  // the promise stays small and the avoidance reflex never fires.
  const minsLeft = Math.max(0, (total - 1) - stepIdx)

  const goNext = () => {
    h.tap()
    if (isLast) { closeFocusRitual(); return }
    setStepIdx(i => Math.min(i + 1, total - 1))
  }
  const goBack = () => { h.tap(); setStepIdx(i => Math.max(i - 1, 0)) }
  const setLater = () => { h.tap(); alt.dismissToday(); closeFocusRitual() }
  const done = () => { h.tap(); closeFocusRitual() }

  const body =
    current === 'portfolio' ? <PortfolioStep />
    : current === 'weekly'  ? <WeeklyStep onCommitted={goNext} />
    : current === 'daily'   ? <DailyStep onLocked={goNext} />
    : <SummaryStep onNavigate={onNavigate} onClose={done} />

  const header = (
    <div className="flex items-center gap-2 mb-2">
      <Sparkles size={15} className="text-violet-300 flex-shrink-0" />
      <h2 className="text-[15px] font-semibold text-white">{STEP_TITLE[current]}</h2>
      <span className="ml-auto text-[10px] text-white/45 tabular-nums uppercase tracking-[0.12em]">
        Step {Math.min(stepIdx + 1, total)} of {total}{!isLast && minsLeft > 0 ? ` · ~${minsLeft} min` : ''}
      </span>
    </div>
  )

  const rail = (
    <div className="flex items-center gap-1.5 mb-3">
      {stepIds.map((s, i) => (
        <span key={s} className={`h-1 flex-1 rounded-full ${i <= stepIdx ? 'bg-violet-400/80' : 'bg-white/[0.10]'}`} />
      ))}
    </div>
  )

  const footer = (
    <div className="flex items-center gap-2">
      {stepIdx > 0 ? (
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1 text-[12px] text-white/55 hover:text-white/85 px-2.5 py-2"
        >
          <ArrowLeft size={13} /> Back
        </button>
      ) : <span />}
      <div className="ml-auto flex items-center gap-3">
        {!isLast && (
          <button
            type="button"
            onClick={setLater}
            className="text-[11px] text-white/35 hover:text-white/60"
          >
            Set later today
          </button>
        )}
        {isLast ? (
          <button
            type="button"
            onClick={done}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-violet-50 bg-violet-500/30 hover:bg-violet-500/45 border border-violet-400/40 rounded-lg px-4 py-2"
          >
            <CheckCircle2 size={13} /> Done
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-violet-50 bg-violet-500/30 hover:bg-violet-500/45 border border-violet-400/40 rounded-lg px-4 py-2"
          >
            {NEXT_LABEL[current]} <ArrowRight size={13} />
          </button>
        )}
      </div>
    </div>
  )

  if (narrow) {
    return (
      <BottomSheet open onClose={setLater} ariaLabel="Focus ritual">
        <div className="h-full flex flex-col">
          <div className="px-4 pt-2">{header}{rail}</div>
          <div className="flex-1 overflow-y-auto px-4 pb-2">{body}</div>
          <div className="px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] border-t border-white/[0.06] bg-[#0f0f12]">{footer}</div>
        </div>
      </BottomSheet>
    )
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Focus ritual">
      <button aria-label="Set later today" onClick={setLater} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl max-h-[88vh] bg-[#0f0f12] border border-white/[0.10] rounded-2xl shadow-2xl shadow-black/60 flex flex-col">
        <div className="px-6 pt-5">{header}{rail}</div>
        <div className="flex-1 overflow-y-auto px-6 pb-2">{body}</div>
        <div className="px-6 py-4 border-t border-white/[0.06]">{footer}</div>
      </div>
    </div>
  )
}

const STEP_TITLE: Record<StepId, string> = {
  portfolio: 'Your objectives',
  weekly: "This week's moves",
  daily: 'Your 3 today',
  summary: "You're set",
}
const NEXT_LABEL: Record<StepId, string> = {
  portfolio: 'These are my objectives',
  weekly: 'Next',
  daily: 'Next',
  summary: 'Done',
}

// ── Portfolio step ───────────────────────────────────────────────────────────
// Ratify the objective board: accept/reject Marcus's nominations inline, then
// confirm the active set. Advancing (footer "These are my objectives") is the
// ratification — nominations left untouched simply persist for later.
function PortfolioStep() {
  const { active, active_count, soft_cap } = useObjectives()
  const overCap = active_count > soft_cap
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-white/55 leading-snug">
        Confirm the objectives you're running. Accept or reject anything Marcus proposed, then move on.
      </p>
      <NominationTray />
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/45 font-semibold">Active objectives ({active_count})</p>
          {overCap && <span className="text-[10px] text-amber-300/85 font-semibold">Over soft cap ({soft_cap})</span>}
        </div>
        {active.length === 0 ? (
          <p className="text-[12px] text-white/45">No active objectives yet. Accept one of Marcus's proposals above to give the OS a multi-week unlock.</p>
        ) : (
          <ul className="space-y-1.5">
            {active.map(o => (
              <li key={o.id} className="flex items-start gap-2 text-[12px] text-white/80">
                <Target size={11} className="text-violet-300/70 mt-0.5 flex-shrink-0" />
                <span className="break-words">{o.title}{o.venture ? <span className="text-white/40"> · {o.venture}</span> : null}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Weekly step ──────────────────────────────────────────────────────────────
// Shape this week's milestones (MilestoneCalibrator per objective), then commit
// up to 3 as the week's moves. Active-pick: nothing is pre-checked (unlike the
// old WeeklyFocusTakeover endowment). Commit hits /api/weekly-focus/commit.
interface PoolMilestone { id: string; title: string; goal_id: string; goal_title: string; hours: number | null }

function WeeklyStep({ onCommitted }: { onCommitted: () => void }) {
  const { active } = useObjectives()
  const wf = useWeeklyFocus()
  const h = useHaptics()
  const { toast } = useToast()

  const [pool, setPool] = useState<PoolMilestone[]>([])
  const [poolLoading, setPoolLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [committing, setCommitting] = useState(false)

  // Gather accepted/active milestones across objectives so the commit checklist
  // reflects whatever shaping just happened above. Re-runs when the objective set
  // changes (realtime after an accept).
  useEffect(() => {
    let cancelled = false
    setPoolLoading(true)
    void (async () => {
      try {
        const results = await Promise.all(active.map(async (o) => {
          const r = await fetch(`/api/objectives/${encodeURIComponent(o.id)}`)
          const j = await r.json().catch(() => ({}))
          const ms = (j?.tree?.milestones || []) as Array<{ id: string; title: string; status: string; est_deep_work_hours: number | null }>
          return ms
            .filter(m => m.status === 'accepted' || m.status === 'active')
            .map(m => ({ id: m.id, title: m.title, goal_id: o.id, goal_title: o.title, hours: typeof m.est_deep_work_hours === 'number' ? m.est_deep_work_hours : null }))
        }))
        if (cancelled) return
        setPool(results.flat())
      } catch {
        if (!cancelled) setPool([])
      } finally {
        if (!cancelled) setPoolLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [active])

  const selectedPool = useMemo(() => pool.filter(m => selected.has(m.id)).slice(0, 3), [pool, selected])
  const totalHours = useMemo(() => selectedPool.reduce((s, m) => s + (m.hours || 0), 0), [selectedPool])

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); h.tap(); return next }
      if (next.size >= 3) { toast('Three is the week. Uncheck one to add another.', 'error'); h.error(); return prev }
      next.add(id); h.tap(); return next
    })
  }

  const commit = async () => {
    if (committing) return
    setCommitting(true)
    h.tap()
    try {
      const r = await fetch('/api/weekly-focus/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_of: wf.currentWeekOf,
          milestones: selectedPool.map(m => ({ milestone_id: m.id, goal_id: m.goal_id })),
          retro_ack: true,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      wf.markSetWeek()
      h.success()
      toast('Locked. Marcus will shape your week around these.', 'success')
      wf.refresh()
      onCommitted()
    } catch (e) {
      h.error()
      toast(`Commit failed: ${(e as Error).message}`, 'error')
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-white/55 leading-snug">
        Shape each objective's milestones, then pick up to 3 to commit. These become the moves your days ladder up to.
      </p>
      <div className="space-y-3">
        {active.map(o => (
          <div key={o.id}>
            <div className="flex items-center gap-2 mb-1.5 px-1">
              <span className="text-[11px] font-semibold text-white/80 break-words">{o.title}</span>
              {o.venture && <span className="text-[10px] text-white/40 uppercase tracking-[0.12em]">{o.venture}</span>}
            </div>
            <MilestoneCalibrator goalId={o.id} />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.04] p-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-violet-200/80 font-semibold mb-2">Commit up to 3 for the week</p>
        {poolLoading ? (
          <div className="text-[12px] text-white/45"><Loader2 size={12} className="animate-spin inline mr-2" />Gathering accepted milestones…</div>
        ) : pool.length === 0 ? (
          <p className="text-[12px] text-white/45">No accepted milestones yet. Accept at least one of Marcus's proposals above, or commit zero and run pure execution this week.</p>
        ) : (
          <ul className="space-y-1.5">
            {pool.map(m => {
              const on = selected.has(m.id)
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => toggle(m.id)}
                    className={`w-full text-left flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${on ? 'border-violet-400/45 bg-violet-500/[0.08]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'}`}
                  >
                    <span className={`mt-0.5 w-5 h-5 rounded-md border flex-shrink-0 inline-flex items-center justify-center ${on ? 'bg-violet-500/80 border-violet-300/60 text-white' : 'border-white/25 text-transparent'}`}>
                      <Check size={12} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] text-white/90 leading-snug break-words">{m.title}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-[10px] text-white/45">
                        <span className="inline-flex items-center gap-1"><Target size={9} className="opacity-60" />{m.goal_title}</span>
                        {typeof m.hours === 'number' && <span className="inline-flex items-center gap-0.5"><Clock size={9} />{m.hours}h</span>}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <button
          type="button"
          onClick={commit}
          disabled={committing}
          className="mt-3 w-full inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-violet-50 bg-violet-500/30 hover:bg-violet-500/45 border border-violet-400/40 rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {committing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          {committing ? 'Locking…' : selectedPool.length > 0 ? `Commit ${selectedPool.length} for the week${totalHours > 0 ? ` · ~${totalHours}h` : ''}` : 'Commit zero — run execution'}
        </button>
      </div>
    </div>
  )
}

// ── Daily step ───────────────────────────────────────────────────────────────
// Frame the day (Marcus's brief + yesterday's open loop), then pick today's 3.
// FocusCalibrator owns the pick + its own Lock button; onLocked advances us.
function DailyStep({ onLocked }: { onLocked: () => void }) {
  const { today } = useDailyFocus()

  if (today) {
    const targets = [today.target_1_text, today.target_2_text, today.target_3_text].filter(Boolean) as string[]
    return (
      <div className="space-y-3">
        <p className="text-[12px] text-emerald-200/80 leading-snug">Today's 3 are locked. Track them on the board.</p>
        <ol className="space-y-1.5">
          {targets.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-white/85">
              <span className="text-[12px] text-violet-200 font-bold tabular-nums">{i + 1}.</span>
              <span className="break-words">{t}</span>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <ContextHeader />
      <CarryOverPrompt />
      <FocusCalibrator onLocked={onLocked} />
    </div>
  )
}

// ── Summary step ─────────────────────────────────────────────────────────────
// The close: green confirmation across altitudes + what's still waiting on you.
function SummaryStep({ onNavigate, onClose }: { onNavigate?: NavigateFn; onClose: () => void }) {
  const { altitudes } = useAltitudes()
  const { decisions } = useRealtimeDecisionsWaiting()
  const streaks = useStreaks()
  const h = useHaptics()
  const waiting = decisions.length
  // Reinforce the chain at the close: the real 3-for-3 streak (consecutive days
  // daily_focus shipped). Display-only — the streak is earned on the board, not here.
  const streak = streaks.three_for_three

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={18} className="text-emerald-400" />
        <p className="text-[15px] font-semibold text-white">You're set for today.</p>
        {isFocusEnabled() && !streaks.loading && streak > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/[0.06] px-2 py-0.5 text-[11px] font-semibold text-amber-300 tabular-nums">
            <Flame size={11} /> {streak}-day 3-for-3
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {altitudes.map(a => (
          <li key={a.id} className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${a.needsAttention ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/55 w-20 flex-shrink-0">{a.label}</span>
            <span className="text-[12px] text-white/75 truncate">{a.summary}</span>
            {!a.needsAttention && <Check size={13} className="ml-auto text-emerald-400/80 flex-shrink-0" />}
          </li>
        ))}
      </ul>
      {waiting > 0 && (
        <button
          type="button"
          onClick={() => { h.tap(); onClose(); onNavigate?.('today') }}
          className="w-full inline-flex items-center justify-between gap-2 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] px-4 py-3 text-left active:bg-amber-500/[0.10]"
        >
          <span className="inline-flex items-center gap-2">
            <Inbox size={14} className="text-amber-400" />
            <span className="text-[13px] text-white/85">{waiting} still waiting on you</span>
          </span>
          <ArrowRight size={14} className="text-amber-300/80" />
        </button>
      )}
    </div>
  )
}
