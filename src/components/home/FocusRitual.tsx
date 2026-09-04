import React, { useEffect, useMemo, useState } from 'react'
import {
  Sparkles, Check, Target, ArrowLeft, ArrowRight,
  CheckCircle2, Inbox, Plus, X, RotateCcw,
} from '@/lib/icons'
import { useAltitudes, type AltitudeId } from '../../hooks/useAltitudes'
import { useGoalCanon, type CanonGoal } from '../../hooks/useGoalCanon'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { usePilotState } from '../../hooks/usePilot'
import { useRealtimeDecisionsWaiting } from '../../hooks/useRealtimeDecisionsWaiting'
import { splitDecisions } from '../../lib/decisionKinds'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { BottomSheet } from '../mobile/BottomSheet'
import { MicButton } from '../shared/VoiceCapture'
import { ContextHeader } from '../focus/ContextHeader'
import { CarryOverPrompt } from '../focus/CarryOverPrompt'
import { FocusCalibrator } from '../focus/FocusCalibrator'
import { useFocusRitualOpen, closeFocusRitual } from '../../lib/focusRitual'
import { weekOf } from '../../lib/civilDate'
import {
  createGoal, patchGoal, acceptProposed, rejectProposed,
  type GateVerdictWire,
} from '../../lib/goalsApi'
import { Working } from '../shared/Working'
import { ServesPicker, VentureChips } from '../goals/GoalPickers'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

// The unified Focus Ritual, two steps since the 2026-08-20 recompose: shape the
// week (up to 3 weekly objectives, each serving an OS goal), then pick today's
// 3. One decision per screen, then a "you're set" summary. The old portfolio
// step died with the venture_objective rung; OS goals are edited inline on the
// ladder, not in a ritual. Mounted once at App level (z-stacks above both
// shells) and self-gates to tab==='home' + the open bus.

type StepId = 'weekly' | 'daily' | 'summary'

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

  // Build the ordered step list: the pending ritual altitudes (or, if launched
  // at a specific one, that one first), then the closing summary. The OS layer
  // never enters the ritual (it is edited inline on the ladder), so an 'os'
  // startAt just opens at the first pending step.
  const stepIds = useMemo<StepId[]>(() => {
    const pendingIds = alt.pending.map(p => p.id).filter((id): id is 'weekly' | 'daily' => id !== 'os')
    const startId = startAt === 'weekly' || startAt === 'daily' ? startAt : null
    const ids = startId ? [startId, ...pendingIds.filter(id => id !== startId)] : pendingIds
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
  // snooze), in line with every other dialog in the app.
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

  if (tab !== 'home' || !open) return null

  const total = stepIds.length
  const current = stepIds[Math.min(stepIdx, total - 1)]
  const isLast = stepIdx >= total - 1

  const goNext = () => {
    h.tap()
    if (isLast) { closeFocusRitual(); return }
    setStepIdx(i => Math.min(i + 1, total - 1))
  }
  const goBack = () => { h.tap(); setStepIdx(i => Math.max(i - 1, 0)) }
  const setLater = () => { h.tap(); alt.dismissToday(); closeFocusRitual() }
  const done = () => { h.tap(); closeFocusRitual() }

  const body =
    current === 'weekly'  ? <WeeklyStep />
    : current === 'daily' ? <DailyStep onLocked={goNext} />
    : <SummaryStep onNavigate={onNavigate} onClose={done} />

  const header = (
    <div className="flex items-center gap-2 mb-2">
      <Sparkles size={15} className="text-violet-300 flex-shrink-0" />
      <h2 className="text-ui font-semibold text-white">{STEP_TITLE[current]}</h2>
      <span className="sr-only">Step {Math.min(stepIdx + 1, total)} of {total}</span>
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
          className="inline-flex items-center gap-1 text-label text-white/55 hover:text-white/85 px-2.5 py-2"
        >
          <ArrowLeft size={13} /> Back
        </button>
      ) : <span />}
      <div className="ml-auto flex items-center gap-3">
        {!isLast && (
          <button
            type="button"
            onClick={setLater}
            className="text-micro text-white/35 hover:text-white/60"
          >
            Set later today
          </button>
        )}
        {isLast ? (
          <button
            type="button"
            onClick={done}
            className="inline-flex items-center gap-1.5 text-body font-semibold text-violet-50 bg-violet-500/30 hover:bg-violet-500/45 border border-violet-400/40 rounded-lg px-4 py-2"
          >
            <CheckCircle2 size={13} /> Done
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-1.5 text-body font-semibold text-violet-50 bg-violet-500/30 hover:bg-violet-500/45 border border-violet-400/40 rounded-lg px-4 py-2"
          >
            Next <ArrowRight size={13} />
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
          {/* Keyboard clearance comes from the sheet primitive itself
              (ui/dialog's keyboard contract), so the footer stays visible
              while a field has focus. */}
          <div className="px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] border-t border-white/[0.06] bg-base">{footer}</div>
        </div>
      </BottomSheet>
    )
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Focus ritual">
      <button aria-label="Set later today" onClick={setLater} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl max-h-[88vh] bg-base border border-white/[0.10] rounded-2xl shadow-2xl shadow-black/60 flex flex-col">
        <div className="px-6 pt-5">{header}{rail}</div>
        <div className="flex-1 overflow-y-auto px-6 pb-2">{body}</div>
        <div className="px-6 py-4 border-t border-white/[0.06]">{footer}</div>
      </div>
    </div>
  )
}

const STEP_TITLE: Record<StepId, string> = {
  weekly: "This week's objectives",
  daily: 'Your 3 today',
  summary: "You're set",
}

// ── Weekly step ──────────────────────────────────────────────────────────────
// Shape the week directly against the canon: up to 3 weekly goals, each naming
// the OS goal it serves (optional venture tag). Last week's set is carried,
// completed, or dropped right here; Marcus-proposed weekly goals arrive as
// accept/pass chips (a pass feeds his learning loop). Every action writes
// immediately through the one goal wire path — there is no separate commit.
function WeeklyStep() {
  const { canon, loading, refresh } = useGoalCanon()
  const h = useHaptics()
  const { toast } = useToast()

  const os = canon?.os ?? []
  const weekly = canon?.weekly ?? []
  const proposed = canon?.weeklyProposed ?? []
  const ventures = canon?.ventures ?? []
  const currentWeek = weekOf(new Date())

  const [text, setText] = useState('')
  const [servesId, setServesId] = useState('')
  const [venture, setVenture] = useState('')
  const [gate, setGate] = useState<GateVerdictWire | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => { if (!servesId && os.length > 0) setServesId(os[0].id) }, [os, servesId])

  const activeCount = weekly.filter(g => g.status === 'active').length
  const osTitle = useMemo(() => new Map(os.map(g => [g.id, g.title])), [os])
  const touchedThisWeek = (g: CanonGoal) => {
    try { return weekOf(new Date(g.updated_at)) === currentWeek } catch { return false }
  }

  const run = async (key: string, fn: () => Promise<void>, okMsg?: string) => {
    if (busy) return
    setBusy(key)
    try {
      await fn()
      refresh()
      h.success()
      if (okMsg) toast(okMsg, 'success')
    } catch (e) {
      h.error()
      toast((e as Error).message || 'That did not save.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const add = (override = false) => {
    const t = text.trim()
    if (!t || !servesId) return
    if (activeCount >= 3) { toast('Three is the week. Complete or drop one first.', 'error'); h.error(); return }
    void run('add', async () => {
      const result = await createGoal({ title: t, horizon: 'weekly', parentId: servesId, venture: venture || null, override })
      if (result.ok === false) { setGate(result.gate); throw new Error('Blocked by the gate below.') }
      setText(''); setVenture(''); setGate(null)
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-label text-white/55 leading-snug">
        Pick up to 3 objectives for the week. Each one serves an OS goal, and today's 3 come from them.
      </p>

      {/* Marcus-proposed weekly goals: take or pass, one tap each. */}
      {proposed.length > 0 && (
        <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.04] p-3 space-y-2">
          <p className="text-micro uppercase tracking-[0.14em] text-violet-200/80 font-semibold">Marcus proposes</p>
          <ul className="space-y-1.5">
            {proposed.map(g => (
              <li key={g.id} className="flex items-start gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-body text-white/90 leading-snug break-words">{g.title}</span>
                  {g.parent_id && osTitle.get(g.parent_id) && (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-micro text-white/45">
                      <Target size={9} className="opacity-60" />{osTitle.get(g.parent_id)}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => void run(`take-${g.id}`, () => acceptProposed(g.id), 'Taken for the week.')}
                  className="min-h-[30px] px-2.5 rounded-md bg-emerald-400/15 border border-emerald-300/30 text-label text-emerald-100 hover:bg-emerald-400/25 disabled:opacity-50"
                >
                  Take it
                </button>
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => void run(`pass-${g.id}`, () => rejectProposed(g.id))}
                  className="min-h-[30px] px-2 rounded-md text-label text-white/45 hover:text-white/80 disabled:opacity-50"
                >
                  Pass
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The week's set. */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3 space-y-2">
        <p className="text-micro uppercase tracking-[0.14em] text-white/45 font-semibold">
          This week · {activeCount}/3
        </p>
        {loading ? (
          <div className="text-label text-white/45"><Working size={12} className="inline mr-2" />Loading the canon…</div>
        ) : weekly.length === 0 ? (
          <p className="text-label text-white/45">Nothing set yet. Write the first one below.</p>
        ) : (
          <ul className="space-y-1.5">
            {weekly.map(g => {
              const done = g.status === 'done'
              const carried = !touchedThisWeek(g)
              return (
                <li key={g.id} className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <button
                    type="button"
                    aria-label={done ? 'Mark not done' : 'Mark done'}
                    disabled={busy != null}
                    onClick={() => void run(`done-${g.id}`, () => patchGoal({ goalId: g.id, status: done ? 'active' : 'done' }))}
                    className={`mt-[2px] w-4 h-4 shrink-0 rounded-[5px] border ${done ? 'bg-emerald-400/80 border-emerald-300/60' : 'border-white/25 hover:border-white/50'}`}
                  />
                  <span className="flex-1 min-w-0">
                    <span className={`block text-body leading-snug break-words ${done ? 'text-white/40 line-through' : 'text-white/90'}`}>{g.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-micro text-white/45">
                      {g.parent_id && osTitle.get(g.parent_id) && (
                        <span className="inline-flex items-center gap-1"><Target size={9} className="opacity-60" />{osTitle.get(g.parent_id)}</span>
                      )}
                      {g.venture && <span className="px-1 py-0.5 rounded bg-white/[0.06]">{g.venture}</span>}
                      {carried && <span className="text-amber-300/70">from last week</span>}
                    </span>
                  </span>
                  {carried && !done && (
                    <button
                      type="button"
                      disabled={busy != null}
                      title="Carry this into the new week"
                      onClick={() => void run(`keep-${g.id}`, () => patchGoal({ goalId: g.id, status: 'active' }), 'Carried into this week.')}
                      className="min-h-[28px] px-2 rounded-md text-micro inline-flex items-center gap-1 text-white/60 hover:text-white/90 border border-white/[0.10]"
                    >
                      <RotateCcw size={11} /> Keep
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Drop this objective"
                    disabled={busy != null}
                    onClick={() => void run(`drop-${g.id}`, () => patchGoal({ goalId: g.id, status: 'dropped' }))}
                    className="mt-[2px] text-white/30 hover:text-white/70"
                  >
                    <X size={13} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {/* Write a new one — only while the week has room. */}
        {activeCount < 3 && (
          <div className="rounded-lg border border-white/[0.06] bg-sunk p-2 space-y-2">
            <div className="relative">
              <textarea
                value={text}
                onChange={e => { setText(e.target.value); if (gate) setGate(null) }}
                placeholder="Write a weekly objective…"
                rows={2}
                className="w-full bg-sunk border border-white/[0.08] rounded px-2.5 py-2 pr-10 text-label text-white placeholder:text-white/30 focus:border-violet-400/40 focus:outline-none resize-none"
              />
              <div className="absolute top-1.5 right-1.5">
                <MicButton
                  endpoint="/api/daily-focus/voice"
                  onJson={(j) => { const t = (j.text as string) || ''; if (t) setText(v => (v ? `${v} ${t}` : t)) }}
                  onError={() => toast('Voice unavailable. Type instead.', 'error')}
                />
              </div>
            </div>
            <div className="space-y-2.5">
              <ServesPicker os={os} value={servesId} onChange={setServesId} disabled={busy != null} />
              <VentureChips ventures={ventures} value={venture} onChange={setVenture} disabled={busy != null} />
              <button
                type="button"
                onClick={() => add()}
                disabled={!text.trim() || !servesId || busy != null}
                className="inline-flex items-center gap-1 text-micro font-semibold text-white/70 hover:text-white border border-white/[0.10] hover:border-white/25 rounded px-2.5 py-1.5 disabled:opacity-40"
              >
                <Plus size={11} /> Add
              </button>
            </div>

            {/* The gate held it: the form stays open with the verdict attached. */}
            {gate && (
              <div className="rounded-lg border border-amber-400/25 bg-amber-500/[0.07] p-2.5">
                <p className="text-micro uppercase tracking-[0.14em] font-semibold text-amber-200/85">
                  {gate.verdict === 'wrong_tier' ? 'Wrong rung' : 'Not saved yet'}
                </p>
                {gate.reasoning && <p className="mt-1 text-label text-white/70 leading-snug">{gate.reasoning}</p>}
                {gate.issues.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {gate.issues.map((it, i) => (
                      <li key={i} className="text-label leading-snug">
                        <span className="text-amber-200/80 font-medium">{it.dimension}: </span>
                        <span className="text-white/70">{it.problem}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {gate.suggested_rewrite && (
                    <button
                      type="button"
                      onClick={() => { setText(gate.suggested_rewrite!); setGate(null) }}
                      className="min-h-[28px] px-2.5 rounded-md bg-white/[0.07] border border-white/15 text-label text-white/85 hover:bg-white/[0.12]"
                    >
                      Use the suggested wording
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => add(true)}
                    className="min-h-[28px] px-2 rounded-md text-label text-white/45 hover:text-white/80 underline underline-offset-2"
                  >
                    Save as written
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Daily step ───────────────────────────────────────────────────────────────
// Frame the day (Marcus's brief + yesterday's open loop), then pick today's 3.
// FocusCalibrator owns the pick + its own Lock button; onLocked advances us.
function DailyStep({ onLocked }: { onLocked: () => void }) {
  const { state: pilot } = usePilotState()
  const pilotOne = pilot?.last_evening?.tomorrow_one ?? null
  const { today } = useDailyFocus()

  if (today) {
    const targets = [today.target_1_text, today.target_2_text, today.target_3_text].filter(Boolean) as string[]
    return (
      <div className="space-y-3">
        <p className="text-label text-emerald-200/80 leading-snug">Today's 3 are locked. Track them on the board.</p>
        <ol className="space-y-1.5">
          {targets.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-body text-white/85">
              <span className="text-label text-violet-200 font-bold tabular-nums">{i + 1}.</span>
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
      <FocusCalibrator onLocked={onLocked} pilotOne={pilotOne} />
    </div>
  )
}

// ── Summary step ─────────────────────────────────────────────────────────────
// The close: green confirmation across the canon + what's still waiting on you.
function SummaryStep({ onNavigate, onClose }: { onNavigate?: NavigateFn; onClose: () => void }) {
  const { altitudes } = useAltitudes()
  const { decisions } = useRealtimeDecisionsWaiting()
  const h = useHaptics()
  const waiting = splitDecisions(decisions).decisions.length

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={18} className="text-emerald-400" />
        <p className="text-ui font-semibold text-white">You're set for today.</p>
      </div>
      <ul className="space-y-2">
        {altitudes.map(a => (
          <li key={a.id} className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${a.needsAttention ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            <span className="text-label font-bold uppercase tracking-[0.14em] text-white/55 w-20 flex-shrink-0">{a.label}</span>
            <span className="text-label text-white/75 truncate">{a.summary}</span>
            {!a.needsAttention && <Check size={13} className="ml-auto text-emerald-400/80 flex-shrink-0" />}
          </li>
        ))}
      </ul>
      {waiting > 0 && (
        <button
          type="button"
          onClick={() => { h.tap(); onClose(); onNavigate?.('os', { sub: 'queue' }) }}
          className="w-full inline-flex items-center justify-between gap-2 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] px-4 py-3 text-left active:bg-amber-500/[0.10]"
        >
          <span className="inline-flex items-center gap-2">
            <Inbox size={14} className="text-amber-400" />
            <span className="text-body text-white/85">{waiting} still waiting on you</span>
          </span>
          <ArrowRight size={14} className="text-amber-300/80" />
        </button>
      )}
    </div>
  )
}
