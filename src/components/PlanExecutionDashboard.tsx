import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Clock, AlertTriangle, Info } from 'lucide-react'
import type { PlanExecutionData } from '../types/plan-execution'

interface Plan {
  agent: string
  plan_name: string
  overall_progress_pct: number
  timeline_status: 'ON_TRACK' | 'AT_RISK' | 'BLOCKED' | 'OVERDUE' | 'UNKNOWN'
  phases: Phase[]
  critical_blockers: string[]
  task_summary: {
    in_progress: number
    waiting: number
    blocked: number
    done: number
  }
  next_milestone: string
  brief_source?: string
  last_updated: string
}

interface Phase {
  name: string
  status: 'complete' | 'in_progress' | 'pending'
  planned_start?: string
  planned_end?: string
  tasks_assigned: string[]
  task_count: number
  completed_count: number
  progress_pct: number
  blockers: string[]
}

function timelineStatusColor(status: string): string {
  switch (status) {
    case 'ON_TRACK': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    case 'AT_RISK': return 'text-amber-400 bg-amber-500/10 border-amber-500/30'
    case 'BLOCKED': return 'text-red-400 bg-red-500/10 border-red-500/30'
    case 'OVERDUE': return 'text-red-500 bg-red-600/10 border-red-500/30'
    default: return 'text-white/40 bg-white/5 border-white/10'
  }
}

function timelineStatusIcon(status: string) {
  switch (status) {
    case 'ON_TRACK': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />
    case 'AT_RISK': return <AlertTriangle className="w-4 h-4 text-amber-400" />
    case 'BLOCKED': return <AlertCircle className="w-4 h-4 text-red-400" />
    case 'OVERDUE': return <AlertCircle className="w-4 h-4 text-red-500" />
    default: return <Clock className="w-4 h-4 text-white/40" />
  }
}

function PhaseRow({ phase, isExpanded, onToggle }: { phase: Phase; isExpanded: boolean; onToggle: () => void }) {
  return (
    <div className="border-l-2 border-white/10 pl-4">
      <button
        onClick={onToggle}
        className="w-full text-left py-3 hover:bg-white/[0.02] rounded transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[11px] font-bold uppercase tracking-widest ${
                phase.status === 'complete' ? 'text-emerald-400' :
                phase.status === 'in_progress' ? 'text-blue-400' :
                'text-white/40'
              }`}>
                {phase.status === 'complete' ? '✓ Complete' : phase.status === 'in_progress' ? '⏳ In Progress' : '⏸ Pending'}
              </span>
            </div>
            <p className="text-[13px] font-semibold text-white">{phase.name}</p>
            {phase.planned_end && (
              <p className="text-[11px] text-white/40 mt-1">Due: {phase.planned_end}</p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="text-[13px] font-semibold text-white">{phase.progress_pct}%</p>
              <p className="text-[10px] text-white/40">{phase.completed_count}/{phase.task_count}</p>
            </div>
            {isExpanded ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1.5 bg-white/[0.07] rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              phase.status === 'complete' ? 'bg-emerald-400' :
              phase.status === 'in_progress' ? 'bg-blue-400' :
              'bg-white/20'
            }`}
            style={{ width: `${phase.progress_pct}%` }}
          />
        </div>
      </button>

      {/* Expanded blockers */}
      {isExpanded && phase.blockers.length > 0 && (
        <div className="mt-2 p-3 bg-red-500/5 border border-red-500/20 rounded-lg ml-3">
          <p className="text-[11px] font-bold text-red-400 mb-2 uppercase">Blockers:</p>
          <ul className="space-y-1">
            {phase.blockers.map((blocker, idx) => (
              <li key={idx} className="text-[12px] text-red-300 flex gap-2">
                <span className="text-red-400">•</span>
                {blocker}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PlanCard({ plan }: { plan: Plan }) {
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set())

  const togglePhase = (idx: number) => {
    const newSet = new Set(expandedPhases)
    if (newSet.has(idx)) {
      newSet.delete(idx)
    } else {
      newSet.add(idx)
    }
    setExpandedPhases(newSet)
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="p-4 border-b border-white/[0.07]">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-1">Agent</p>
            <p className="text-[16px] font-bold text-white">{plan.agent}</p>
          </div>
          <div className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 ${timelineStatusColor(plan.timeline_status)}`}>
            {timelineStatusIcon(plan.timeline_status)}
            <span className="text-[11px] font-bold">{plan.timeline_status}</span>
          </div>
        </div>

        <p className="text-[13px] text-white/70 mb-3">{plan.plan_name}</p>

        {/* Progress bar */}
        <div className="h-2 bg-white/[0.07] rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all duration-500"
            style={{ width: `${plan.overall_progress_pct}%` }}
          />
        </div>
        <p className="text-[11px] text-white/50">{plan.overall_progress_pct}% Complete</p>
      </div>

      {/* Phases */}
      <div className="p-4 space-y-2">
        {plan.phases.map((phase, idx) => (
          <PhaseRow
            key={idx}
            phase={phase}
            isExpanded={expandedPhases.has(idx)}
            onToggle={() => togglePhase(idx)}
          />
        ))}
      </div>

      {/* Critical blockers (if any) */}
      {plan.critical_blockers.length > 0 && (
        <div className="px-4 pb-4">
          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
            <p className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 mb-2 uppercase tracking-wide">
              <AlertTriangle className="w-3.5 h-3.5" />
              Critical Blockers
            </p>
            <ul className="space-y-1">
              {plan.critical_blockers.map((blocker, idx) => (
                <li key={idx} className="text-[11px] text-amber-300">{blocker}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 bg-white/[0.01] border-t border-white/[0.07] flex items-center justify-between gap-3">
        <p className="text-[11px] text-white/40 flex-1 truncate">Next: {plan.next_milestone}</p>
        <div className="flex items-center gap-3 flex-shrink-0">
          {plan.brief_source && plan.brief_source !== 'https://docs.google.com/document/d/...' && (
            <a
              href={plan.brief_source}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors font-medium"
            >
              View Brief →
            </a>
          )}
          <p className="text-[10px] text-white/30">{new Date(plan.last_updated).toLocaleTimeString()}</p>
        </div>
      </div>
    </div>
  )
}

export function PlanExecutionDashboard() {
  const [data, setData] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [dataNoteVisible, setDataNoteVisible] = useState(true)
  const [dataNote, setDataNote] = useState<string>('')

  useEffect(() => {
    const load = async () => {
      try {
        const { supabase } = await import('../lib/supabase')
        const { data: plans } = await supabase.from('plan_execution').select('*')
        if (plans) {
          // Also fetch agent brief sources from agents table
          let agentBriefMap: Record<string, string> = {}
          try {
            const { data: agentRows } = await supabase
              .from('agents')
              .select('name,plan_doc_url')
              .eq('active', true)
            if (agentRows) {
              for (const a of agentRows as any[]) {
                if (a.name && a.plan_doc_url) {
                  agentBriefMap[a.name] = a.plan_doc_url
                }
              }
            }
          } catch { /* fall through with empty map */ }

          const mapped = plans.map((p: any) => ({
            agent: p.agent,
            plan_name: p.plan_name || '',
            overall_progress_pct: p.overall_progress_pct || 0,
            timeline_status: 'ON_TRACK' as const,
            phases: typeof p.phases === 'string' ? JSON.parse(p.phases) : (p.phases || []),
            critical_blockers: [],
            task_summary: typeof p.task_summary === 'string' ? JSON.parse(p.task_summary) : (p.task_summary || {}),
            next_milestone: '',
            brief_source: p.brief_source || agentBriefMap[p.agent] || undefined,
            last_updated: p.updated_at || new Date().toISOString(),
          }))
          setData(mapped)
          setLastUpdated(new Date().toISOString())
        }
      } catch (e) { console.error('Plan load error:', e) }
      setLoading(false)
    }
    load()
    const iv = setInterval(load, 30_000)
    return () => clearInterval(iv)
  }, [])

  if (loading) {
    return <div className="py-16 text-center text-[13px] text-white/30">Loading execution plans...</div>
  }

  const onTrack = data.filter(p => p.timeline_status === 'ON_TRACK').length
  const atRisk = data.filter(p => p.timeline_status === 'AT_RISK').length
  const blocked = data.filter(p => p.timeline_status === 'BLOCKED').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-white tracking-tight">Plan Execution</h1>
        <p className="text-[13px] text-white/40 mt-0.5">Real-time progress on all agent workstreams</p>
      </div>

      {/* Data note banner */}
      {dataNote && dataNoteVisible && (
        <div className="flex items-start gap-2.5 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
          <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-300/70 flex-1">{dataNote}</p>
          <button onClick={() => setDataNoteVisible(false)} className="text-white/20 hover:text-white/50 text-[10px] flex-shrink-0">✕</button>
        </div>
      )}

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-lg p-3">
          <p className="text-[11px] text-emerald-400 font-bold mb-1">ON TRACK</p>
          <p className="text-[18px] font-bold text-white">{onTrack}</p>
        </div>
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-lg p-3">
          <p className="text-[11px] text-amber-400 font-bold mb-1">AT RISK</p>
          <p className="text-[18px] font-bold text-white">{atRisk}</p>
        </div>
        <div className="bg-red-500/8 border border-red-500/20 rounded-lg p-3">
          <p className="text-[11px] text-red-400 font-bold mb-1">BLOCKED</p>
          <p className="text-[18px] font-bold text-white">{blocked}</p>
        </div>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.map(plan => (
          <PlanCard key={plan.agent} plan={plan} />
        ))}
      </div>

      {/* Last updated */}
      <div className="text-center text-[11px] text-white/30">
        Last synced: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'Never'}
      </div>
    </div>
  )
}
