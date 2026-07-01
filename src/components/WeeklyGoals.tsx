import React, { useState, useEffect, useRef } from 'react'
import { Target, Loader2, Pencil, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import { AgentAvatar } from './shared/AgentAvatar'

const API = import.meta.env.VITE_API_URL ?? ''

interface MappedTask {
  id: string
  title: string
  status: string
  agent: string
}

interface Goal {
  id: string
  title: string
  target: string
  current: string
  owner: string
  progress: number
  notes?: string
  tasks?: MappedTask[]
  calculated_progress?: number
}

export interface GoalsData {
  week_of: string
  north_star: string
  team_focus?: string
  goals: Goal[]
}

interface GoalEditState {
  title: string
  current: string
  progress: string
  notes: string
}

interface WeeklyGoalsProps {
  variant?: 'compact' | 'spacious'
  hideHeader?: boolean
  onDataLoaded?: (data: GoalsData) => void
}

const TASKS_PREVIEW_CAP = 5

const progressColor = (p: number) => {
  if (p >= 80) return 'bg-emerald-500'
  if (p >= 40) return 'bg-violet-500'
  return 'bg-amber-500'
}

const progressLabel = (p: number) => {
  if (p >= 100) return 'Done'
  if (p >= 80) return 'On track'
  if (p >= 40) return 'In progress'
  if (p > 0) return 'Started'
  return 'Not started'
}

const isTaskDone = (status: string) => ['Complete', 'Closed', 'Done'].includes(status)

export function WeeklyGoals({ variant = 'compact', hideHeader = false, onDataLoaded }: WeeklyGoalsProps = {}) {
  const [data, setData] = useState<GoalsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Team focus editing (compact variant only — hero owns it in spacious)
  const [editingFocus, setEditingFocus] = useState(false)
  const [focusText, setFocusText] = useState('')
  const focusRef = useRef<HTMLTextAreaElement>(null)

  // Goal inline editing — keyed by goal id
  const [editingGoal, setEditingGoal] = useState<string | null>(null)
  const [goalEdit, setGoalEdit] = useState<GoalEditState>({ title: '', current: '', progress: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const isSpacious = variant === 'spacious'

  const fetchGoals = async () => {
    try {
      const res = await fetch(`${API}/api/goals`, { cache: 'no-cache' })
      const d = await res.json()
      setData(d)
      if (d) onDataLoaded?.(d)
    } catch {
      // fail silently on refresh
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchGoals()
    const iv = setInterval(fetchGoals, 30000)
    return () => clearInterval(iv)
  }, [])

  const saveFocus = async () => {
    await fetch(`${API}/api/goals`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_focus: focusText })
    })
    setEditingFocus(false)
    fetchGoals()
  }

  const startEditGoal = (goal: Goal) => {
    setEditingGoal(goal.id)
    setGoalEdit({ title: goal.title, current: goal.current, progress: String(goal.progress), notes: goal.notes || '' })
    setExpanded(goal.id)
    setSaveError(null)
  }

  const saveGoal = async (goalId: string) => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${API}/api/goals`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId,
          title: goalEdit.title,
          current: goalEdit.current,
          progress: Number(goalEdit.progress),
          notes: goalEdit.notes,
        })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) {
        setSaveError(body?.error || `Save failed (${res.status})`)
        return
      }
      setEditingGoal(null)
      await fetchGoals()
      setSavedFlash(goalId)
      setTimeout(() => setSavedFlash(prev => (prev === goalId ? null : prev)), 2000)
    } catch (err: any) {
      setSaveError(err?.message || 'Network error')
    } finally {
      setSaving(false)
    }
  }

  const toggleDone = async (goal: Goal, currentPct: number) => {
    if (goal.tasks && goal.tasks.length > 0) return // auto-calculated; not user-toggleable
    const newProgress = currentPct >= 100 ? 0 : 100
    setSaving(true)
    try {
      await fetch(`${API}/api/goals`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId: goal.id, progress: newProgress })
      })
      await fetchGoals()
      setSavedFlash(goal.id)
      setTimeout(() => setSavedFlash(prev => (prev === goal.id ? null : prev)), 2000)
    } finally {
      setSaving(false)
    }
  }

  const addGoal = async () => {
    setSaving(true)
    try {
      await fetch(`${API}/api/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Goal', current: 'Define goal...' })
      })
      await fetchGoals()
    } finally {
      setSaving(false)
    }
  }

  const cancelEditGoal = () => {
    setEditingGoal(null)
    setSaveError(null)
  }

  if (loading) return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 flex items-center gap-2 text-white/40">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm">Loading goals...</span>
    </div>
  )

  if (!data) return null

  const doneCount = data.goals.filter(g => {
    const pct = g.tasks && g.tasks.length > 0 ? (g.calculated_progress || 0) : g.progress
    return pct >= 100
  }).length

  if (data.goals.length === 0) return (
    <div className="bg-base border border-white/[0.08] rounded-2xl overflow-hidden">
      <div className="px-4 py-3">
        <p className="text-[12px] text-white/35">No goals this week.</p>
        <button onClick={addGoal} disabled={saving} className="mt-2 text-[11px] text-violet-400 hover:text-violet-300">+ Add Goal</button>
      </div>
    </div>
  )

  const containerClass = isSpacious
    ? 'bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden flex flex-col'
    : 'bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden flex flex-col h-full max-h-[calc(100vh-8rem)]'

  const listClass = isSpacious
    ? 'divide-y divide-white/[0.04]'
    : 'divide-y divide-white/[0.04] flex-1 min-h-0 overflow-y-auto'

  return (
    <div className={containerClass}>
      {/* Header — hidden in spacious mode (parent renders OS Mission hero) */}
      {!hideHeader && (
        <div className="px-4 pt-4 pb-3 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-violet-400" />
              <span className="text-[13px] font-semibold text-white">Weekly Goals</span>
              {data.week_of && (
                <span className="text-[11px] text-white/30 font-normal">{data.week_of}</span>
              )}
            </div>
            <div className="text-[11px] text-white/40 font-mono">
              {doneCount}/{data.goals.length} done
            </div>
          </div>

          {data.north_star && (
            <p className="text-[11px] text-white/40 mt-1.5 font-mono leading-relaxed">{data.north_star}</p>
          )}

          {/* Team focus — editable */}
          <div className="mt-2 flex items-start gap-1.5">
            {editingFocus ? (
              <div className="flex-1 flex gap-1.5">
                <textarea
                  ref={focusRef}
                  value={focusText}
                  onChange={e => setFocusText(e.target.value)}
                  className="flex-1 bg-white/[0.06] border border-violet-500/40 rounded-lg px-2.5 py-1.5 text-[11px] text-white resize-none focus:outline-none"
                  rows={2}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) saveFocus() }}
                />
                <div className="flex flex-col gap-1 mt-1">
                  <button onClick={saveFocus} className="text-violet-400 hover:text-violet-300">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setEditingFocus(false)} className="text-white/25 hover:text-white/60">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-start gap-1.5 group">
                <p className="text-[11px] text-violet-300/70 flex-1 leading-relaxed">
                  {data.team_focus ?? 'Set team focus for this week…'}
                </p>
                <button
                  onClick={() => { setFocusText(data.team_focus ?? ''); setEditingFocus(true) }}
                  className="text-white/40 hover:text-white/70 transition-colors flex-shrink-0 mt-0.5"
                  title="Edit team focus"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slim header in spacious/hideHeader mode — just the done counter */}
      {hideHeader && (
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-white/[0.04]">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-violet-400" />
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">This Week</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-white/40 font-mono tabular-nums">{doneCount} / {data.goals.length} done</span>
            <button onClick={addGoal} disabled={saving} className="text-[11px] text-violet-400 hover:text-violet-300">+ Add goal</button>
          </div>
        </div>
      )}

      {/* Goals list */}
      <div className={listClass}>
        {data.goals.map(goal => {
          const pct = Math.max(0, Math.min(100, goal.tasks && goal.tasks.length > 0 ? (goal.calculated_progress || 0) : goal.progress))
          const done = pct >= 100
          const isExpanded = expanded === goal.id
          const isEditing = editingGoal === goal.id
          const taskCount = goal.tasks?.length ?? 0
          const tasksDone = goal.tasks?.filter(t => isTaskDone(t.status)).length ?? 0
          const autoCalc = taskCount > 0
          const visibleTasks = goal.tasks?.slice(0, TASKS_PREVIEW_CAP) ?? []
          const hiddenTaskCount = Math.max(0, taskCount - visibleTasks.length)

          const rowPad = isSpacious ? 'px-5 py-5' : 'px-4 py-3'

          return (
            <div key={goal.id} className={`${rowPad} group/goal`}>
              {/* Row header */}
              <div className="flex items-start gap-3">
                {/* Progress indicator — click to toggle done in spacious mode (when not auto-calc) */}
                <button
                  className="flex-shrink-0 mt-0.5 disabled:cursor-not-allowed"
                  onClick={() => {
                    if (isSpacious && !autoCalc) toggleDone(goal, pct)
                    else setExpanded(isExpanded ? null : goal.id)
                  }}
                  disabled={isSpacious && autoCalc ? false : false}
                  title={isSpacious && !autoCalc ? `Click to mark ${done ? 'not done' : 'done'} (${pct}% — ${progressLabel(pct)})` : `${pct}% — ${progressLabel(pct)}`}
                >
                  {done ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center hover:bg-emerald-500/30 transition-colors">
                      <Check className="w-3 h-3 text-emerald-400" />
                    </div>
                  ) : (
                    <div className="relative w-5 h-5 rounded-full border-2 border-white/[0.12] flex items-center justify-center overflow-hidden hover:border-white/30 transition-colors">
                      {pct > 0 && (
                        <div
                          className="w-2 h-2 rounded-full bg-violet-400"
                          style={{ opacity: 0.4 + (pct / 100) * 0.6 }}
                        />
                      )}
                    </div>
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className={`${isSpacious ? 'text-[14px]' : 'text-[13px]'} font-medium leading-snug cursor-pointer ${done ? 'text-white/40 line-through' : 'text-white'}`}
                      onClick={() => setExpanded(isExpanded ? null : goal.id)}
                    >
                      {goal.title}
                    </p>
                    {!isEditing && (
                      <button
                        onClick={() => startEditGoal(goal)}
                        className="text-white/40 hover:text-white/70 transition-colors flex-shrink-0"
                        title="Update progress"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                    {savedFlash === goal.id && (
                      <span className="text-[11px] text-emerald-400 flex-shrink-0">✓ Saved</span>
                    )}
                  </div>

                  {/* Owner row */}
                  {isSpacious ? (
                    <div className="flex items-center gap-2 mt-2">
                      {goal.owner && (
                        <AgentAvatar agent={goal.owner} name={goal.owner} size="xs" />
                      )}
                      <span className="text-[12px] text-white/65">{goal.owner || 'Unassigned'}</span>
                      <span className="text-[11px] text-white/20">·</span>
                      <span className="text-[12px] text-white/45 tabular-nums">
                        {autoCalc ? `${tasksDone} of ${taskCount} tasks done · ${pct}%` : `${pct}% — ${progressLabel(pct)}`}
                      </span>
                      {autoCalc && (
                        <span className="text-[9px] text-emerald-400/70 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">auto</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-white/40">{goal.owner}</span>
                      <span className="text-[11px] text-white/20">·</span>
                      <span className="text-[11px] text-white/40 font-mono truncate">{goal.current}</span>
                      {pct > 0 && !done && (
                        <>
                          <span className="text-[11px] text-white/20">·</span>
                          <span className={`text-[10px] font-semibold ${pct >= 80 ? 'text-emerald-400' : pct >= 40 ? 'text-violet-400' : 'text-amber-400'}`}>
                            {pct}%
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Current status (spacious only — pulled out from owner line for breathing room) */}
                  {isSpacious && goal.current && (
                    <p className="text-[12px] text-white/45 font-mono mt-1.5 leading-snug">{goal.current}</p>
                  )}

                  {/* Progress bar */}
                  {!done && (
                    <div className={`mt-${isSpacious ? '3' : '2'} ${isSpacious ? 'h-1.5' : 'h-1'} bg-white/[0.06] rounded-full overflow-hidden`}>
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${progressColor(pct)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}

                  {/* Inline tasks (spacious only — always visible) */}
                  {isSpacious && taskCount > 0 && !isEditing && (
                    <div className="mt-3 space-y-1.5">
                      {visibleTasks.map(t => (
                        <div key={t.id} className="flex items-center gap-2 text-[12px] bg-white/[0.02] border border-white/[0.04] px-2 py-1.5 rounded-lg">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isTaskDone(t.status) ? 'bg-emerald-400' : 'bg-violet-400'}`} />
                          <span className="text-white/40 uppercase text-[9px] font-bold w-12 truncate flex-shrink-0">{t.agent}</span>
                          <span className={`truncate flex-1 ${isTaskDone(t.status) ? 'text-white/45 line-through' : 'text-white/85'}`}>{t.title}</span>
                          <span className="text-[10px] text-white/30 flex-shrink-0">{t.status.toLowerCase()}</span>
                        </div>
                      ))}
                      {hiddenTaskCount > 0 && (
                        <button
                          onClick={() => setExpanded(isExpanded ? null : goal.id)}
                          className="text-[11px] text-violet-400/80 hover:text-violet-300 transition-colors"
                        >
                          + {hiddenTaskCount} more {hiddenTaskCount === 1 ? 'task' : 'tasks'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setExpanded(isExpanded ? null : goal.id)}
                  className="flex-shrink-0 mt-0.5 text-white/20 hover:text-white/50 transition-colors"
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4" />
                    : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {/* Expanded: view or edit */}
              {isExpanded && (
                <div className={`mt-3 ${isSpacious ? 'ml-8' : 'ml-8'} space-y-2`}>
                  {isEditing ? (
                    /* ── EDIT MODE ── */
                    <div className="space-y-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl p-3">

                      <div>
                        <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Goal Title</label>
                        <input
                          className="w-full bg-white/[0.06] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-[12px] text-white font-medium placeholder-white/20 focus:outline-none focus:border-violet-500/50"
                          value={goalEdit.title}
                          onChange={e => setGoalEdit(s => ({ ...s, title: e.target.value }))}
                          placeholder="e.g. Launch Product X"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Current status</label>
                        <input
                          className="w-full bg-white/[0.06] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-[12px] text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50"
                          value={goalEdit.current}
                          onChange={e => setGoalEdit(s => ({ ...s, current: e.target.value }))}
                          placeholder="What's the current state?"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/30 uppercase tracking-wider flex items-center gap-2 mb-1">
                          Progress % (0–100)
                          {autoCalc && <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono lowercase">Auto-calculated</span>}
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          disabled={autoCalc}
                          className="w-full bg-white/[0.06] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-[12px] text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                          value={autoCalc ? (goal.calculated_progress || 0) : goalEdit.progress}
                          onChange={e => setGoalEdit(s => ({ ...s, progress: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Notes (optional)</label>
                        <textarea
                          className="w-full bg-white/[0.06] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-[12px] text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50 resize-none"
                          rows={2}
                          value={goalEdit.notes}
                          onChange={e => setGoalEdit(s => ({ ...s, notes: e.target.value }))}
                          placeholder="Any context or feedback for the agent…"
                        />
                      </div>
                      <div className="flex gap-2 pt-0.5 items-center">
                        <button
                          onClick={() => saveGoal(goal.id)}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-violet-500/15 border border-violet-500/30 text-violet-400 hover:bg-violet-500/25 transition-colors disabled:opacity-50"
                        >
                          <Check className="w-3 h-3" />
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEditGoal}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/40 hover:text-white/60 transition-colors"
                        >
                          Cancel
                        </button>
                        {saveError && (
                          <span className="text-[11px] text-rose-400 ml-1">{saveError}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ── VIEW MODE ── */
                    <div className="space-y-1">
                      {goal.target && (
                        <p className="text-[12px] text-white/50">
                          <span className="text-white/25">Target: </span>{goal.target}
                        </p>
                      )}
                      {goal.notes && (
                        <p className="text-[11px] text-amber-400/70 italic">{goal.notes}</p>
                      )}
                      <button
                        onClick={() => startEditGoal(goal)}
                        className="text-[11px] text-white/25 hover:text-white/50 transition-colors mt-1"
                      >
                        + Update progress
                      </button>

                      {/* Full task list when expanded — only shown in compact mode (spacious shows them inline above) */}
                      {!isSpacious && (
                        <div className="mt-4 pt-3 border-t border-white/[0.04]">
                          <h4 className="text-[10px] font-semibold tracking-wider uppercase text-white/40 mb-2">Mapped Tactical Tasks</h4>
                          {!goal.tasks || goal.tasks.length === 0 ? (
                            <p className="text-[11px] text-white/30 italic">No tasks mapped to this goal yet.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {goal.tasks.map(t => (
                                <div key={t.id} className="flex items-center gap-2 text-[11.5px] bg-white/[0.015] border border-white/[0.04] p-1.5 rounded-lg">
                                  <div className={`w-1.5 h-1.5 rounded-full ${isTaskDone(t.status) ? 'bg-emerald-400' : 'bg-violet-400'}`} />
                                  <span className="text-white/40 uppercase text-[9px] font-bold w-12 truncate">{t.agent}</span>
                                  <span className="text-white/80 truncate flex-1">{t.title}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Spacious: show the remaining tasks beyond the preview cap */}
                      {isSpacious && hiddenTaskCount > 0 && goal.tasks && (
                        <div className="mt-4 pt-3 border-t border-white/[0.04]">
                          <h4 className="text-[10px] font-semibold tracking-wider uppercase text-white/40 mb-2">All tasks</h4>
                          <div className="space-y-1.5">
                            {goal.tasks.slice(TASKS_PREVIEW_CAP).map(t => (
                              <div key={t.id} className="flex items-center gap-2 text-[11.5px] bg-white/[0.015] border border-white/[0.04] p-1.5 rounded-lg">
                                <div className={`w-1.5 h-1.5 rounded-full ${isTaskDone(t.status) ? 'bg-emerald-400' : 'bg-violet-400'}`} />
                                <span className="text-white/40 uppercase text-[9px] font-bold w-12 truncate">{t.agent}</span>
                                <span className="text-white/80 truncate flex-1">{t.title}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

      </div>
      {!hideHeader && (
        <div className="px-4 py-3 border-t border-white/[0.04] flex-shrink-0">
          <button onClick={addGoal} disabled={saving} className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1">
            + Add New Goal
          </button>
        </div>
      )}
    </div>
  )
}
