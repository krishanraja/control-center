import React, { useEffect, useMemo, useState } from 'react'
import {
  Sparkles, Check, Target, Clock, ArrowLeft, ArrowRight, CheckCircle2, AlertOctagon,
} from 'lucide-react'
import { useObjectives } from '../../hooks/useObjectives'
import { useHomeIntelligence } from '../../hooks/useHomeIntelligence'
import { useWeeklyFocus, isWeeklyFocusEnabled } from '../../hooks/useWeeklyFocus'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { BottomSheet } from '../mobile/BottomSheet'
import { NominationTray } from './NominationTray'
import { MilestoneCalibrator } from './MilestoneCalibrator'
import { Working } from '../shared/Working'

// Weekly Focus Takeover (Phase 2). Once a week the Home is taken over by a
// guided wizard that forces a weekly commitment: review last week (peak-end),
// confirm the objective board, shape this week's milestones (reusing the
// MilestoneCalibrator), then commit up to 3 as the week's focus. Those
// committed milestones bias Marcus's daily top_three (serves_milestone chip).
//
// Gating ("insist Monday, soften after"): on Monday's first view there is no
// dismiss; the rest of the week a single "Set later today" snooze is offered.
// The only way to stop it for the week is to commit. Gated by
// VITE_WEEKLY_FOCUS_ENABLED (default off in production).

interface PoolMilestone {
  id: string
  title: string
  goal_id: string
  goal_title: string
  hours: number | null
}

type Step = 'review' | 'board' | 'moves' | 'commit'
const STEPS: Step[] = ['review', 'board', 'moves', 'commit']

export function WeeklyFocusTakeover({ narrow, tab }: { narrow: boolean; tab: string }) {
  const { active, loading: objLoading } = useObjectives()
  const { intel, ackRetro } = useHomeIntelligence()
  const wf = useWeeklyFocus()
  const h = useHaptics()
  const { toast } = useToast()

  const [step, setStep] = useState<Step>('review')
  const [pool, setPool] = useState<PoolMilestone[]>([])
  const [poolLoading, setPoolLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [committing, setCommitting] = useState(false)

  const shouldShow =
    tab === 'home'
    && isWeeklyFocusEnabled()
    && !objLoading && active.length > 0
    && !wf.loading
    && !wf.thisWeek
    && !wf.committedThisWeekLS
    && !wf.snoozedToday

  // Fetch the accepted/active milestone pool when reaching the commit step, so
  // the checklist reflects whatever shaping happened on the moves step. Fresh
  // each entry to commit.
  useEffect(() => {
    if (!shouldShow || step !== 'commit') return
    let cancelled = false
    setPoolLoading(true)
    void (async () => {
      try {
        const results = await Promise.all(active.map(async (o) => {
          const r = await fetch(`/api/objectives/${encodeURIComponent(o.id)}`)
          const j = await r.json().catch(() => ({}))
          const ms = (j?.tree?.milestones || []) as Array<{
            id: string; title: string; status: string; est_deep_work_hours: number | null
          }>
          return ms
            .filter(m => m.status === 'accepted' || m.status === 'active')
            .map(m => ({
              id: m.id,
              title: m.title,
              goal_id: o.id,
              goal_title: o.title,
              hours: typeof m.est_deep_work_hours === 'number' ? m.est_deep_work_hours : null,
            }))
        }))
        if (cancelled) return
        const flat = results.flat()
        setPool(flat)
        // Endowment: pre-check the first up-to-3 if nothing chosen yet.
        setSelected(prev => (prev.size > 0 ? prev : new Set(flat.slice(0, 3).map(m => m.id))))
      } catch {
        if (!cancelled) setPool([])
      } finally {
        if (!cancelled) setPoolLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [shouldShow, step, active])

  const selectedPool = useMemo(() => pool.filter(m => selected.has(m.id)).slice(0, 3), [pool, selected])
  const totalHours = useMemo(
    () => selectedPool.reduce((sum, m) => sum + (m.hours || 0), 0),
    [selectedPool],
  )

  if (!shouldShow) return null

  const canSnooze = !wf.isMonday
  const stepIndex = STEPS.indexOf(step)
  const retro = intel.weekly_retro

  const handleDismiss = () => {
    if (!canSnooze) return // Monday: no dismiss, only commit.
    h.tap()
    wf.snoozeToday()
  }

  const goNext = () => {
    h.tap()
    if (step === 'review' && retro) void ackRetro()
    const next = STEPS[Math.min(stepIndex + 1, STEPS.length - 1)]
    setStep(next)
  }
  const goBack = () => {
    h.tap()
    setStep(STEPS[Math.max(stepIndex - 1, 0)])
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); h.tap(); return next }
      if (next.size >= 3) {
        toast('Three is the week. Uncheck one to add another.', 'error')
        h.error()
        return prev
      }
      next.add(id)
      h.tap()
      return next
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
      wf.refresh() // gate flips, takeover closes
    } catch (e) {
      h.error()
      toast(`Commit failed: ${(e as Error).message}`, 'error')
    } finally {
      setCommitting(false)
    }
  }

  // ---- step bodies ----
  const reviewBody = (
    <div className="space-y-3">
      <p className="text-[12px] text-white/55 leading-snug">An honest look at last week, then set this one.</p>
      {retro ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-300/80 font-semibold mb-1.5">What worked</p>
            <ul className="space-y-1 text-[12px] text-white/80">
              {(retro.what_worked || []).slice(0, 4).map((w, i) => <li key={i} className="break-words">· {w}</li>)}
              {(!retro.what_worked || retro.what_worked.length === 0) && <li className="text-white/35 italic">Nothing logged.</li>}
            </ul>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-amber-300/80 font-semibold mb-1.5">What flopped</p>
            <ul className="space-y-1 text-[12px] text-white/80">
              {(retro.what_flopped || []).slice(0, 4).map((w, i) => <li key={i} className="break-words">· {w}</li>)}
              {(!retro.what_flopped || retro.what_flopped.length === 0) && <li className="text-white/35 italic">Nothing logged.</li>}
            </ul>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-[12px] text-white/45">
          No retro from Marcus this week. Plan this one fresh.
        </div>
      )}
      {retro?.next_focus && (
        <p className="text-[12px] text-violet-200/85 leading-snug">
          <span className="font-semibold text-violet-300/80">Marcus steer: </span>{retro.next_focus}
        </p>
      )}
    </div>
  )

  const boardBody = (
    <div className="space-y-3">
      <p className="text-[12px] text-white/55 leading-snug">Confirm the objectives you are running. Accept or reject anything Marcus nominated.</p>
      <NominationTray />
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-white/45 font-semibold mb-2">Active objectives ({active.length})</p>
        <ul className="space-y-1.5">
          {active.map(o => (
            <li key={o.id} className="flex items-start gap-2 text-[12px] text-white/80">
              <Target size={11} className="text-violet-300/70 mt-0.5 flex-shrink-0" />
              <span className="break-words">{o.title}{o.venture ? <span className="text-white/40"> · {o.venture}</span> : null}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )

  const movesBody = (
    <div className="space-y-3">
      <p className="text-[12px] text-white/55 leading-snug">For each objective, have Marcus propose milestones, then accept, tweak, or reject. You will commit up to 3 as this week's moves next.</p>
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
    </div>
  )

  const commitBody = (
    <div className="space-y-3">
      <p className="text-[12px] text-white/55 leading-snug">Pick up to 3 milestones to commit to this week. These become the moves your days ladder up to.</p>
      {poolLoading ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-[12px] text-white/45">
          <Working size={12} className="inline mr-2" />Gathering your accepted milestones...
        </div>
      ) : pool.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.10] p-4 text-[12px] text-white/45 text-center">
          No accepted milestones yet. Go back and accept at least one of Marcus's proposals, or commit zero and run pure execution this week.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {pool.map(m => {
            const on = selected.has(m.id)
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => toggleSelect(m.id)}
                  className={`w-full text-left flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                    on ? 'border-violet-400/45 bg-violet-500/[0.08]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
                  }`}
                >
                  <span className={`mt-0.5 w-5 h-5 rounded-md border flex-shrink-0 inline-flex items-center justify-center ${
                    on ? 'bg-violet-500/80 border-violet-300/60 text-white' : 'border-white/25 text-transparent'
                  }`}>
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
      {selectedPool.length > 0 && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-violet-300/80 font-semibold mb-1.5">This week I will</p>
          <ul className="space-y-1 text-[12px] text-white/85">
            {selectedPool.map(m => <li key={m.id} className="break-words">· {m.title}</li>)}
          </ul>
          {totalHours > 0 && <p className="text-[11px] text-white/45 mt-2">About {totalHours}h of deep work committed.</p>}
        </div>
      )}
    </div>
  )

  const stepBody =
    step === 'review' ? reviewBody
    : step === 'board' ? boardBody
    : step === 'moves' ? movesBody
    : commitBody

  const primaryLabel =
    step === 'review' ? 'Plan this week'
    : step === 'board' ? 'These are my objectives'
    : step === 'moves' ? "Pick this week's moves"
    : 'I commit to these this week'

  const onPrimary = step === 'commit' ? commit : goNext

  const header = (
    <div className="flex items-center gap-2 mb-1">
      <Sparkles size={15} className="text-violet-300 flex-shrink-0" />
      <h2 className="text-[15px] font-semibold text-white">Set your weekly focus</h2>
      {wf.isMonday && (
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-violet-200/80 uppercase tracking-[0.12em]">
          <AlertOctagon size={10} /> New week
        </span>
      )}
    </div>
  )

  const rail = (
    <div className="flex items-center gap-1.5 mb-3">
      {STEPS.map((s, i) => (
        <span key={s} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? 'bg-violet-400/80' : 'bg-white/[0.10]'}`} />
      ))}
    </div>
  )

  const footer = (
    <div className="flex items-center gap-2">
      {stepIndex > 0 ? (
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1 text-[12px] text-white/55 hover:text-white/85 px-2.5 py-2"
        >
          <ArrowLeft size={13} /> Back
        </button>
      ) : <span />}
      <div className="ml-auto flex items-center gap-3">
        {canSnooze && (
          <button
            type="button"
            onClick={handleDismiss}
            className="text-[11px] text-white/35 hover:text-white/60"
          >
            Set later today
          </button>
        )}
        <button
          type="button"
          onClick={onPrimary}
          disabled={committing}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-violet-50 bg-violet-500/30 hover:bg-violet-500/45 border border-violet-400/40 rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {step === 'commit'
            ? (committing ? <Working size={13} /> : <CheckCircle2 size={13} />)
            : <ArrowRight size={13} />}
          {step === 'commit' && committing ? 'Locking…' : primaryLabel}
        </button>
      </div>
    </div>
  )

  if (narrow) {
    return (
      <BottomSheet open onClose={handleDismiss} ariaLabel="Set your weekly focus">
        <div className="h-full flex flex-col">
          <div className="px-4 pt-2">{header}{rail}</div>
          <div className="flex-1 overflow-y-auto px-4">{stepBody}</div>
          <div className="px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] border-t border-white/[0.06] bg-base">{footer}</div>
        </div>
      </BottomSheet>
    )
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Set your weekly focus">
      <button
        aria-label={canSnooze ? 'Set later today' : 'Commit to dismiss'}
        onClick={handleDismiss}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-2xl max-h-[88vh] bg-base border border-white/[0.10] rounded-2xl shadow-2xl shadow-black/60 flex flex-col">
        <div className="px-6 pt-5">{header}{rail}</div>
        <div className="flex-1 overflow-y-auto px-6">{stepBody}</div>
        <div className="px-6 py-4 border-t border-white/[0.06]">{footer}</div>
      </div>
    </div>
  )
}
