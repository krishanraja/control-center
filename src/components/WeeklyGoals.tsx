import React, { useState, useEffect, useRef } from 'react'
import { Target, Loader2, Pencil, Check, X, ChevronDown, ChevronUp } from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? ''

interface Goal {
  id: string
  title: string
  target: string
  current: string
  owner: string
  progress: number
  notes?: string
}

interface GoalsData {
  week_of: string
  north_star: string
  team_focus?: string
  goals: Goal[]
}

interface GoalEditState {
  current: string
  progress: string
  notes: string
}

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

export function WeeklyGoals() {
  const [data, setData] = useState<GoalsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Team focus editing
  const [editingFocus, setEditingFocus] = useState(false)
  const [focusText, setFocusText] = useState('')
  const focusRef = useRef<HTMLTextAreaElement>(null)

  // Goal inline editing — keyed by goal id
  const [editingGoal, setEditingGoal] = useState<string | null>(null)
  const [goalEdit, setGoalEdit] = useState<GoalEditState>({ current: '', progress: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const fetchGoals = async () => {
    try {
      const res = await fetch(`${API}/api/goals`, { cache: 'no-cache' })
      const d = await res.json()
      setData(d)
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
    setGoalEdit({ current: goal.current, progress: String(goal.progress), notes: goal.notes || '' })
    setExpanded(goal.id)
  }

  const saveGoal = async (goalId: string) => {
    setSaving(true)
    try {
      await fetch(`${API}/api/goals`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId,
          current: goalEdit.current,
          progress: Number(goalEdit.progress),
          notes: goalEdit.notes,
        })
      })
      setEditingGoal(null)
      fetchGoals()
    } finally {
      setSaving(false)
    }
  }

  const cancelEditGoal = () => setEditingGoal(null)

  if (loading) return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 flex items-center gap-2 text-white/40">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm">Loading goals...</span>
    </div>
  )

  if (!data || data.goals.length === 0) return null

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-violet-400" />
            <span className="text-[13px] font-semibold text-white">Weekly Goals</span>
            {data.week_of && (
              <span className="text-[11px] text-white/30 font-normal">{data.week_of}</span>
            )}
          </div>
          <div className="text-[11px] text-white/40 font-mono">
            {data.goals.filter(g => g.progress >= 100).length}/{data.goals.length} done
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
                className="opacity-0 group-hover:opacity-100 transition-opacity text-white/25 hover:text-white/60 flex-shrink-0 mt-0.5"
                title="Edit team focus"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Goals list */}
      <div className="divide-y divide-white/[0.04]">
        {data.goals.map(goal => {
          const pct = Math.max(0, Math.min(100, goal.progress))
          const done = pct >= 100
          const isExpanded = expanded === goal.id
          const isEditing = editingGoal === goal.id

          return (
            <div key={goal.id} className="px-4 py-3 group/goal">
              {/* Row header */}
              <div className="flex items-start gap-3">
                {/* Progress indicator */}
                <button
                  className="flex-shrink-0 mt-0.5"
                  onClick={() => setExpanded(isExpanded ? null : goal.id)}
                  title={`${pct}% — ${progressLabel(pct)}`}
                >
                  {done ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    </div>
                  ) : (
                    <div className="relative w-5 h-5 rounded-full border-2 border-white/[0.12] flex items-center justify-center overflow-hidden">
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
                      className={`text-[13px] font-medium leading-snug cursor-pointer ${done ? 'text-white/40 line-through' : 'text-white'}`}
                      onClick={() => setExpanded(isExpanded ? null : goal.id)}
                    >
                      {goal.title}
                    </p>
                    {/* Edit button */}
                    {!isEditing && (
                      <button
                        onClick={() => startEditGoal(goal)}
                        className="opacity-0 group-hover/goal:opacity-100 transition-opacity text-white/20 hover:text-white/60 flex-shrink-0"
                        title="Update progress"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>

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

                  {/* Progress bar */}
                  {!done && (
                    <div className="mt-2 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${progressColor(pct)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setExpanded(isExpanded ? null : goal.id)}
                  className="flex-shrink-0 mt-0.5 text-white/20 hover:text-white/50 transition-colors"
                >
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4" />
                    : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {/* Expanded: view or edit */}
              {isExpanded && (
                <div className="mt-3 ml-8 space-y-2">
                  {isEditing ? (
                    /* ── EDIT MODE ── */
                    <div className="space-y-2.5 bg-white/[0.03] border border-white/[0.08] rounded-xl p-3">
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
                        <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Progress % (0–100)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="w-full bg-white/[0.06] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-[12px] text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50"
                          value={goalEdit.progress}
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
                      <div className="flex gap-2 pt-0.5">
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
                      </div>
                    </div>
                  ) : (
                    /* ── VIEW MODE ── */
                    <div className="space-y-1">
                      <p className="text-[12px] text-white/50">
                        <span className="text-white/25">Target: </span>{goal.target}
                      </p>
                      {goal.notes && (
                        <p className="text-[11px] text-amber-400/70 italic">{goal.notes}</p>
                      )}
                      <button
                        onClick={() => startEditGoal(goal)}
                        className="text-[11px] text-white/25 hover:text-white/50 transition-colors mt-1"
                      >
                        + Update progress
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
