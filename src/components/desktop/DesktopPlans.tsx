import React, { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Target, AlertTriangle, TrendingUp, CheckCircle, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useRealtimeTasks } from '../../hooks/useRealtimeTasks'
import { SplitPane } from '../SplitPane'
import { AgentAvatar } from '../shared/AgentAvatar'

interface AgentPlan {
  agent_id: string
  current_phase: string | null
  objective: string | null
  blockers: string | null
  next_milestone: string | null
  progress_pct: number | null
  last_updated: string | null
  updated_at: string | null
}

interface AgentRow {
  id: string
  name: string
  role?: string
  pod?: string
  active?: boolean
  kpi_label?: string
  kpi_target?: string
  kpi_current?: string
  last_run?: string
  mission?: string
}

type MergedPlan = AgentRow & { plan?: AgentPlan }

const POD_ORDER = ['executive', 'ops', 'growth']

function podSort(a: MergedPlan, b: MergedPlan) {
  const ai = POD_ORDER.indexOf((a.pod || '').toLowerCase())
  const bi = POD_ORDER.indexOf((b.pod || '').toLowerCase())
  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
}

export function DesktopPlans() {
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [plans, setPlans] = useState<AgentPlan[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { tasks } = useRealtimeTasks()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      const [ag, pl] = await Promise.all([
        supabase.from('agents').select('*').eq('active', true),
        supabase.from('agent_plans').select('*'),
      ])
      if (cancelled) return
      if (ag.error) {
        setError(ag.error.message)
        setLoading(false)
        return
      }
      // Missing agent_plans table shouldn't break the tab — plans view falls
      // back to the KPI card from the agents row.
      if (pl.error) console.warn('agent_plans load failed:', pl.error.message)
      setAgents((ag.data as AgentRow[]) || [])
      setPlans(pl.error ? [] : ((pl.data as AgentPlan[]) || []))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const merged: MergedPlan[] = useMemo(() => {
    const planMap = new Map(plans.map(p => [p.agent_id, p]))
    return agents
      .map(a => ({ ...a, plan: planMap.get(a.id) }))
      .sort(podSort)
  }, [agents, plans])

  const selected = selectedId ? (merged.find(m => m.id === selectedId) ?? null) : null

  const agentTasks = useMemo(() => {
    if (!selected) return []
    const id = selected.id.toLowerCase()
    const name = selected.name.toLowerCase()
    return tasks
      .filter(t => {
        const agent = (t.agent || '').toLowerCase()
        const owner = (t.owner || '').toLowerCase()
        return (agent === id || agent === name || owner === id || owner === name) && t.status !== 'done'
      })
      .slice(0, 8)
  }, [selected?.id, tasks])

  const list = (
    <div className="space-y-4 pr-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white tracking-tight">Plans</h1>
          <p className="text-[11px] md:text-[12px] text-white/40 mt-0.5">Strategic roadmap by agent — where we are, where we're headed.</p>
        </div>
        <p className="text-[12px] text-white/35 font-mono tabular-nums">{merged.length} agents</p>
      </div>

      {loading && (
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] py-12 text-center">
          <p className="text-[13px] text-white/45">Loading plans…</p>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.04] py-6 px-4 text-center">
          <p className="text-[13px] text-rose-300 font-medium">Couldn't load agents.</p>
          <p className="text-[11px] text-rose-300/60 mt-1 font-mono">{error}</p>
        </div>
      )}

      {!loading && !error && merged.length === 0 && (
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] py-12 text-center">
          <p className="text-[13px] text-white/45">No active agents.</p>
        </div>
      )}

      {!loading && !error && merged.length > 0 && (
        <div className="space-y-2">
          {merged.map(m => {
            const plan = m.plan
            const pct = plan?.progress_pct ?? null
            const isSel = selected?.id === m.id
            const hasBlocker = !!(plan?.blockers && plan.blockers.length > 0)

            return (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className={`w-full text-left rounded-xl border p-3.5 transition-all ${
                  isSel
                    ? 'border-violet-500/40 bg-violet-500/[0.07]'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <AgentAvatar agent={m.id} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] text-white font-semibold truncate">{m.name}</p>
                      {hasBlocker && <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />}
                    </div>
                    <p className="text-[11px] text-white/45 truncate mt-0.5">
                      {plan?.current_phase || m.role || 'No plan set'}
                    </p>
                    {pct !== null && (
                      <div className="mt-2 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            pct >= 80 ? 'bg-emerald-400' : pct >= 40 ? 'bg-violet-400' : 'bg-amber-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-white/20 flex-shrink-0 mt-1" />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  const detail = selected ? (
    <div className="space-y-6 pb-6">
      <div className="flex items-start gap-4">
        <AgentAvatar agent={selected.id} size="lg" />
        <div>
          <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white tracking-tight">{selected.name}</h1>
          {selected.role && <p className="text-[13px] text-white/55 mt-1">{selected.role}</p>}
        </div>
      </div>

      {selected.plan ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-400/70 mb-1.5">Current Phase</p>
            <p className="text-[14px] text-white font-medium leading-snug">{selected.plan.current_phase || '—'}</p>
          </div>

          {selected.plan.objective && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-2">
                <Target size={10} className="inline mr-1.5" />Objective
              </p>
              <p className="text-[13px] text-white/75 leading-relaxed">{selected.plan.objective}</p>
            </div>
          )}

          {selected.plan.progress_pct !== null && selected.plan.progress_pct !== undefined && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Progress</p>
                <span className="text-[12px] font-mono text-white/50">{selected.plan.progress_pct}%</span>
              </div>
              <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    selected.plan.progress_pct >= 80 ? 'bg-emerald-400' : selected.plan.progress_pct >= 40 ? 'bg-violet-400' : 'bg-amber-400'
                  }`}
                  style={{ width: `${selected.plan.progress_pct}%` }}
                />
              </div>
            </div>
          )}

          {selected.plan.blockers && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400/70 mb-1.5">
                <AlertTriangle size={10} className="inline mr-1.5" />Blockers
              </p>
              <p className="text-[13px] text-amber-200/80 leading-relaxed whitespace-pre-wrap">{selected.plan.blockers}</p>
            </div>
          )}

          {selected.plan.next_milestone && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-2">
                <TrendingUp size={10} className="inline mr-1.5" />Next Milestone
              </p>
              <p className="text-[13px] text-white/75 leading-relaxed">{selected.plan.next_milestone}</p>
            </div>
          )}

          {selected.plan.updated_at && (
            <p className="text-[10px] text-white/25">Plan updated {formatDistanceToNow(new Date(selected.plan.updated_at), { addSuffix: true })}</p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <p className="text-[11px] text-white/35 italic">No strategic plan set yet. Showing KPI summary from agent config.</p>
          {selected.kpi_label && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-1">{selected.kpi_label}</p>
              <p className="text-[13px] text-white/70">Target: {selected.kpi_target || '—'}</p>
              <p className="text-[13px] text-white/70">Current: {selected.kpi_current || '—'}</p>
            </div>
          )}
          {selected.mission && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-1">Mission</p>
              <p className="text-[13px] text-white/55 leading-relaxed">{selected.mission}</p>
            </div>
          )}
        </div>
      )}

      {agentTasks.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-2.5">
            <CheckCircle size={10} className="inline mr-1.5" />Active Tasks ({agentTasks.length})
          </p>
          <div className="space-y-1.5">
            {agentTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  t.status === 'waiting' ? 'bg-amber-400' : t.status === 'active' ? 'bg-emerald-400' : t.status === 'in_progress' ? 'bg-blue-400' : 'bg-white/20'
                }`} />
                <p className="text-[12px] text-white/70 truncate flex-1">{t.title}</p>
                <span className="text-[10px] text-white/30">{t.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : (
    <div className="h-full flex items-center justify-center text-[13px] text-white/30">Select an agent</div>
  )

  return <SplitPane left={list} right={detail} hasSelection={!!selectedId} onBack={() => setSelectedId(null)} />
}
