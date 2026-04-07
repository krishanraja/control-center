import React, { useState, useEffect } from 'react'
import { Target, ChevronRight, Loader2 } from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

interface Goal {
  id: string
  title: string
  venture: string
  owner: string
  kpi: string
  target: number
  current: number
  unit: string
  status: string
  due: string
  why: string
}

interface KrishCommitment {
  id: string
  action: string
  time_required: string
  due: string
  status: string
}

interface GoalsData {
  week_of: string
  north_star: string
  goals: Goal[]
  krish_commitments: KrishCommitment[]
}

const VENTURE_COLORS: Record<string, string> = {
  meliora: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  mindmaker: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
  fractionl: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  onalert: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
}

const OWNER_LABEL: Record<string, string> = {
  felix: 'Felix',
  cleo: 'Cleo',
  nova: 'Nova',
  scout: 'Scout',
  leo: 'Leo',
  zara: 'Zara',
  priya: 'Priya',
  marcus: 'Marcus',
  krish: 'Krish',
}

export function WeeklyGoals() {
  const [data, setData] = useState<GoalsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API}/api/goals`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 flex items-center gap-2 text-white/40">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm">Loading goals...</span>
    </div>
  )

  if (!data || data.goals.length === 0) return null

  const weekLabel = data.week_of
    ? `Week of ${new Date(data.week_of).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    : 'This Week'

  const pendingCommitments = data.krish_commitments?.filter(c => c.status === 'pending') ?? []

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-violet-400" />
            <span className="text-[13px] font-semibold text-white">Weekly Goals</span>
            <span className="text-[11px] text-white/30 font-normal">{weekLabel}</span>
          </div>
          <div className="text-[11px] text-white/40 font-mono">
            {data.goals.filter(g => g.current >= g.target).length}/{data.goals.length} done
          </div>
        </div>
        {data.north_star && (
          <p className="text-[11px] text-white/40 mt-1.5 font-mono">{data.north_star}</p>
        )}
      </div>

      {/* Goals list */}
      <div className="divide-y divide-white/[0.04]">
        {data.goals.map(goal => {
          const pct = goal.target > 0 ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0
          const done = goal.current >= goal.target
          const ventureColor = VENTURE_COLORS[goal.venture] ?? 'text-white/50 bg-white/5 border-white/10'
          const isExpanded = expanded === goal.id

          return (
            <div key={goal.id} className="px-4 py-3">
              <button
                className="w-full text-left"
                onClick={() => setExpanded(isExpanded ? null : goal.id)}
              >
                <div className="flex items-start gap-3">
                  {/* Progress ring / done indicator */}
                  <div className="flex-shrink-0 mt-0.5">
                    {done ? (
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-white/[0.12] flex items-center justify-center">
                        {pct > 0 && (
                          <div
                            className="w-2 h-2 rounded-full bg-violet-400"
                            style={{ opacity: pct / 100 }}
                          />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-medium leading-snug ${done ? 'text-white/40 line-through' : 'text-white'}`}>
                      {goal.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ventureColor}`}>
                        {goal.venture}
                      </span>
                      <span className="text-[11px] text-white/30">
                        {OWNER_LABEL[goal.owner] ?? goal.owner}
                      </span>
                      <span className="text-[11px] text-white/20">·</span>
                      <span className="text-[11px] text-white/30 font-mono">
                        {goal.current}/{goal.target} {goal.unit}
                      </span>
                    </div>

                    {/* Progress bar */}
                    {!done && goal.target > 1 && (
                      <div className="mt-2 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-500 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <ChevronRight
                    className={`w-4 h-4 text-white/20 flex-shrink-0 mt-0.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  />
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="mt-3 ml-8 space-y-1.5">
                  <p className="text-[12px] text-white/50 leading-relaxed">{goal.why}</p>
                  <p className="text-[11px] text-white/30 font-mono">KPI: {goal.kpi}</p>
                  <p className="text-[11px] text-white/25">Due {goal.due}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Krish commitments */}
      {pendingCommitments.length > 0 && (
        <div className="px-4 py-3 bg-amber-500/[0.04] border-t border-amber-500/10">
          <p className="text-[11px] font-semibold text-amber-400/80 mb-2">Your commitments this week</p>
          <div className="space-y-2">
            {pendingCommitments.map(c => (
              <div key={c.id} className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-amber-400/60 mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-[12px] text-white/70">{c.action}</p>
                  <p className="text-[10px] text-white/30 font-mono">{c.time_required} · due {c.due}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
