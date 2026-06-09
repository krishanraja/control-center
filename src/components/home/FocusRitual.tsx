import React, { useEffect, useMemo, useState } from 'react'
import {
  Sparkles, Check, Loader2, Target, Clock, ArrowLeft, ArrowRight,
  CheckCircle2, Inbox, Flame, Plus, X,
} from 'lucide-react'
import { useAltitudes, type AltitudeId } from '../../hooks/useAltitudes'
import { useObjectives, reorderObjectives } from '../../hooks/useObjectives'
import { useWeeklyFocus } from '../../hooks/useWeeklyFocus'
import { useDailyFocus, isFocusEnabled } from '../../hooks/useDailyFocus'
import { useStreaks } from '../../hooks/useStreaks'
import { useRealtimeDecisionsWaiting } from '../../hooks/useRealtimeDecisionsWaiting'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { BottomSheet } from '../mobile/BottomSheet'
import { NominationTray } from '../objectives/NominationTray'
import { ObjectiveReviewCard } from '../objectives/ObjectiveReviewCard'
import { ObjectiveProposalReview, type ObjectiveProposal } from '../objectives/ObjectiveProposalReview'
import { OwnerSplit } from '../objectives/OwnerSplit'
import type { OwnerSplit as OwnerSplitData, AgentContribution } from '../../hooks/useObjectiveTree'
import { MicButton } from '../shared/VoiceCapture'
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

  // Escape dismisses the ritual, mirroring a backdrop click (soft "set later"
  // snooze). Brings the modal in line with every other dialog in the app
  // (Capture, IdeaCapture, FocusCalibrator) which all close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        alt.dismissToday()
        closeFocusRitual()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, alt])

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
// Review the objective board at the OBJECTIVE altitude: reorder priority, edit
// wording / KPI / definition, or narrate a reaction and let Marcus turn it into a
// confirmable change set that recalibrates the milestones beneath. Accept/reject
// Marcus's objective nominations inline. Milestone shaping is demoted to a
// per-card disclosure — it is no longer what this step is about.
function PortfolioStep() {
  const { active, active_count, soft_cap, refresh } = useObjectives()
  const { toast } = useToast()
  const overCap = active_count > soft_cap
  const [proposal, setProposal] = useState<{ p: ObjectiveProposal; transcript: string } | null>(null)

  const move = async (idx: number, dir: 'up' | 'down') => {
    const order = active.map(o => o.id)
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= order.length) return
    const tmp = order[idx]; order[idx] = order[swap]; order[swap] = tmp
    await reorderObjectives(active, order)
    refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <p className="text-[12px] text-white/55 leading-snug flex-1">
          Do these objectives — and this order — look right? Reorder, edit, or just talk. Marcus recalibrates the milestones beneath.
        </p>
        <MicButton
          endpoint="/api/objectives/voice"
          label="Narrate"
          onJson={(j) => {
            if (j.proposal) setProposal({ p: j.proposal as ObjectiveProposal, transcript: (j.transcript as string) || '' })
            else toast('Heard you, but no clear change — edit a card directly.', 'info' as 'success')
          }}
          onError={() => toast('Voice unavailable. Edit directly.', 'error')}
        />
      </div>

      {proposal && (
        <ObjectiveProposalReview
          proposal={proposal.p}
          transcript={proposal.transcript}
          objectives={active}
          onApplied={() => { setProposal(null); refresh() }}
          onDismiss={() => setProposal(null)}
        />
      )}

      <NominationTray />

      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] uppercase tracking-[0.14em] text-white/45 font-semibold">Active objectives ({active_count})</p>
        {overCap && <span className="text-[10px] text-amber-300/85 font-semibold">Over soft cap ({soft_cap})</span>}
      </div>

      {active.length === 0 ? (
        <p className="text-[12px] text-white/45">No active objectives yet. Accept one of Marcus's proposals above to give the OS a multi-week unlock.</p>
      ) : (
        <div className="space-y-2">
          {active.map((o, i) => (
            <ObjectiveReviewCard
              key={o.id}
              objective={o}
              isFirst={i === 0}
              isLast={i === active.length - 1}
              onMove={(dir) => move(i, dir)}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Weekly step ──────────────────────────────────────────────────────────────
// Commit up to 3 of this week's moves. The candidate slate comes from
// /api/weekly-focus/slate: accomplishment-altitude milestones across ALL active
// objectives (not just the 2 that happened to be 'accepted'), each laddering up
// to its objective and showing the OS-vs-you split. Krish can also write/speak
// his own move — that creates a krish_authored milestone and teaches the slate
// (marcus_weekly_slate_override). Commit hits /api/weekly-focus/commit, which
// ladders the committed milestones down into agent-assigned tasks.
interface SlateItem {
  milestone_id: string
  title: string
  goal_id: string
  goal_title: string
  goal_priority: number | null
  venture: string | null
  status: string
  source: string
  blessed: boolean
  est_deep_work_hours: number | null
  owner_split: OwnerSplitData | null
  auto_executable_pct: number | null
  contributions: AgentContribution[]
}

function WeeklyStep({ onCommitted }: { onCommitted: () => void }) {
  const { active } = useObjectives()
  const wf = useWeeklyFocus()
  const h = useHaptics()
  const { toast } = useToast()

  const [slate, setSlate] = useState<SlateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [committing, setCommitting] = useState(false)
  const [customs, setCustoms] = useState<Array<{ title: string; goal_id: string }>>([])
  const [customText, setCustomText] = useState('')
  const [customGoal, setCustomGoal] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const r = await fetch('/api/weekly-focus/slate')
        const j = await r.json().catch(() => ({}))
        if (!cancelled) setSlate(j.ok ? (j.slate || []) : [])
      } catch {
        if (!cancelled) setSlate([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => { if (!customGoal && active.length > 0) setCustomGoal(active[0].id) }, [active, customGoal])

  const totalPicked = selected.size + customs.length
  const totalHours = useMemo(
    () => slate.filter(m => selected.has(m.milestone_id)).reduce((s, m) => s + (m.est_deep_work_hours || 0), 0),
    [slate, selected],
  )

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); h.tap(); return next }
      if (totalPicked >= 3) { toast('Three is the week. Drop one to add another.', 'error'); h.error(); return prev }
      next.add(id); h.tap(); return next
    })
  }

  const addCustom = () => {
    const t = customText.trim()
    if (!t) return
    if (totalPicked >= 3) { toast('Three is the week.', 'error'); h.error(); return }
    if (!customGoal) { toast('Pick which objective it serves.', 'error'); return }
    setCustoms(c => [...c, { title: t.slice(0, 200), goal_id: customGoal }])
    setCustomText('')
    h.tap()
  }

  const commit = async () => {
    if (committing) return
    setCommitting(true)
    h.tap()
    try {
      // Custom moves become krish_authored milestones first, then commit.
      const created: Array<{ milestone_id: string; goal_id: string; title: string }> = []
      for (const c of customs) {
        const r = await fetch(`/api/objectives/${encodeURIComponent(c.goal_id)}/milestones`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: c.title }),
        })
        const j = await r.json().catch(() => ({}))
        if (j.ok && j.milestone?.id) created.push({ milestone_id: j.milestone.id, goal_id: c.goal_id, title: c.title })
      }
      const slatePicks = slate.filter(m => selected.has(m.milestone_id)).map(m => ({ milestone_id: m.milestone_id, goal_id: m.goal_id }))
      const committed = [...slatePicks, ...created.map(c => ({ milestone_id: c.milestone_id, goal_id: c.goal_id }))].slice(0, 3)
      const r = await fetch('/api/weekly-focus/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_of: wf.currentWeekOf, milestones: committed, retro_ack: true, custom_added: created }),
      })
      const j = await r.json().catch(() => ({}))
      if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      wf.markSetWeek()
      h.success()
      toast('Locked. Marcus is laddering these down into tasks.', 'success')
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
        Pick up to 3 moves for the week — each ladders up to an objective and shows what the OS will drive vs what needs you. Or write your own.
      </p>

      <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.04] p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-[0.14em] text-violet-200/80 font-semibold">
          Commit up to 3 · {totalPicked}/3 picked
        </p>

        {loading ? (
          <div className="text-[12px] text-white/45"><Loader2 size={12} className="animate-spin inline mr-2" />Marcus is assembling the slate…</div>
        ) : slate.length === 0 && customs.length === 0 ? (
          <p className="text-[12px] text-white/45">No candidate moves yet. Accept milestones in the Objectives step, or write your own below.</p>
        ) : (
          <ul className="space-y-1.5">
            {slate.map(m => {
              const on = selected.has(m.milestone_id)
              return (
                <li key={m.milestone_id}>
                  <button
                    type="button"
                    onClick={() => toggle(m.milestone_id)}
                    className={`w-full text-left flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${on ? 'border-violet-400/45 bg-violet-500/[0.08]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'}`}
                  >
                    <span className={`mt-0.5 w-5 h-5 rounded-md border flex-shrink-0 inline-flex items-center justify-center ${on ? 'bg-violet-500/80 border-violet-300/60 text-white' : 'border-white/25 text-transparent'}`}>
                      <Check size={12} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] text-white/90 leading-snug break-words">{m.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-white/45">
                        <span className="inline-flex items-center gap-1"><Target size={9} className="opacity-60" />{m.goal_title}</span>
                        {typeof m.est_deep_work_hours === 'number' && <span className="inline-flex items-center gap-0.5"><Clock size={9} />{m.est_deep_work_hours}h</span>}
                        {!m.blessed && <span className="text-amber-300/70">proposed</span>}
                      </span>
                      <span className="mt-1 block">
                        <OwnerSplit ownerSplit={m.owner_split} contributions={m.contributions} autoPct={m.auto_executable_pct} compact />
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {/* Custom moves Krish has added this turn. */}
        {customs.length > 0 && (
          <ul className="space-y-1">
            {customs.map((c, i) => (
              <li key={`c-${i}`} className="flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/[0.05] px-3 py-2">
                <Check size={12} className="text-emerald-300 flex-shrink-0" />
                <span className="flex-1 min-w-0 text-[12px] text-white/85 break-words">{c.title}</span>
                <button type="button" onClick={() => setCustoms(list => list.filter((_, j) => j !== i))} className="text-white/40 hover:text-white/70" aria-label="Remove">
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Write / speak your own move. */}
        <div className="rounded-lg border border-white/[0.06] bg-black/20 p-2 space-y-2">
          <div className="relative">
            <textarea
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              placeholder="Write your own move for the week…"
              rows={2}
              className="w-full bg-black/30 border border-white/[0.08] rounded px-2.5 py-2 pr-10 text-[12px] text-white placeholder:text-white/30 focus:border-violet-400/40 focus:outline-none resize-none"
            />
            <div className="absolute top-1.5 right-1.5">
              <MicButton
                endpoint="/api/daily-focus/voice"
                onJson={(j) => { const t = (j.text as string) || ''; if (t) setCustomText(v => (v ? `${v} ${t}` : t)) }}
                onError={() => toast('Voice unavailable. Type instead.', 'error')}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {active.length > 0 && (
              <select
                value={customGoal}
                onChange={e => setCustomGoal(e.target.value)}
                className="flex-1 min-w-0 bg-black/30 border border-white/[0.08] rounded px-2 py-1.5 text-[11px] text-white/80 focus:outline-none"
              >
                {active.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
              </select>
            )}
            <button
              type="button"
              onClick={addCustom}
              disabled={!customText.trim() || totalPicked >= 3}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/70 hover:text-white border border-white/[0.10] hover:border-white/25 rounded px-2.5 py-1.5 disabled:opacity-40"
            >
              <Plus size={11} /> Add move
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={commit}
          disabled={committing}
          className="mt-1 w-full inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-violet-50 bg-violet-500/30 hover:bg-violet-500/45 border border-violet-400/40 rounded-lg px-4 py-2 disabled:opacity-50"
        >
          {committing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          {committing ? 'Locking…' : totalPicked > 0 ? `Commit ${totalPicked} for the week${totalHours > 0 ? ` · ~${totalHours}h` : ''}` : 'Commit zero — run execution'}
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
