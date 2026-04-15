import React, { useEffect, useState, useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Crown, Cog, Rocket, Users, Activity as ActivityIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { SplitPane } from '../SplitPane'
import { AgentAvatar } from '../shared/AgentAvatar'

interface Agent {
  id: string
  name: string
  role?: string
  pod?: string
  active?: boolean
  mandate?: string
  last_run?: string
  last_output?: string
  brief_content?: string
}

const POD_CONFIG: Record<string, { 
  label: string
  icon: typeof Crown
  color: string
  headerBg: string
  order: number
}> = {
  executive: { 
    label: 'Executive', 
    icon: Crown, 
    color: 'text-purple-400 border-purple-500/25 bg-purple-500/10',
    headerBg: 'bg-gradient-to-r from-purple-500/10 to-transparent border-purple-500/20',
    order: 1
  },
  ops: { 
    label: 'Operations', 
    icon: Cog, 
    color: 'text-blue-400 border-blue-500/25 bg-blue-500/10',
    headerBg: 'bg-gradient-to-r from-blue-500/10 to-transparent border-blue-500/20',
    order: 2
  },
  growth: { 
    label: 'Growth', 
    icon: Rocket, 
    color: 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10',
    headerBg: 'bg-gradient-to-r from-emerald-500/10 to-transparent border-emerald-500/20',
    order: 3
  },
}

const POD_COLOR: Record<string, string> = {
  executive: 'text-purple-400 border-purple-500/25 bg-purple-500/10',
  ops:       'text-blue-400 border-blue-500/25 bg-blue-500/10',
  growth:    'text-emerald-400 border-emerald-500/25 bg-emerald-500/10',
}

interface AgentWorkload {
  active: number
  blocked: number
  waiting: number
}

export function DesktopOrg() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ tasks: any[]; activity: any[]; runs: any[] }>({ tasks: [], activity: [], runs: [] })
  const [workloads, setWorkloads] = useState<Record<string, AgentWorkload>>({})

  useEffect(() => {
    supabase.from('agents').select('*').eq('active', true).order('pod').then(({ data }) => {
      setAgents((data as any) || [])
    })
    
    const loadWorkloads = async () => {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('agent, owner, status')
        .neq('status', 'done')
      
      if (!tasks) return
      
      const wl: Record<string, AgentWorkload> = {}
      tasks.forEach((t: any) => {
        const agentId = t.agent || t.owner
        if (!agentId) return
        if (!wl[agentId]) wl[agentId] = { active: 0, blocked: 0, waiting: 0 }
        if (t.status === 'active' || t.status === 'in_progress') wl[agentId].active++
        else if (t.status === 'blocked') wl[agentId].blocked++
        else if (t.status === 'waiting') wl[agentId].waiting++
      })
      setWorkloads(wl)
    }
    loadWorkloads()

    const ch = supabase
      .channel('org-workloads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, loadWorkloads)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const selected = agents.find(a => a.id === selectedId) || agents[0] || null

  // Group agents by pod with proper ordering
  const groupedAgents = useMemo(() => {
    const groups: Record<string, Agent[]> = {}
    agents.forEach(a => {
      const pod = a.pod || 'unassigned'
      if (!groups[pod]) groups[pod] = []
      groups[pod].push(a)
    })
    
    // Sort pods by configured order
    return Object.entries(groups).sort(([a], [b]) => {
      const orderA = POD_CONFIG[a]?.order ?? 99
      const orderB = POD_CONFIG[b]?.order ?? 99
      return orderA - orderB
    })
  }, [agents])

  useEffect(() => {
    if (!selected) return
    const load = async () => {
      const [tasks, activity, runs] = await Promise.all([
        supabase.from('tasks').select('*').or(`owner.eq.${selected.id},agent.eq.${selected.id}`).neq('status', 'done').order('updated_at', { ascending: false }).limit(20),
        supabase.from('audit_log').select('*').eq('actor', selected.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('workflow_runs').select('*').eq('agent_id', selected.id).order('run_at', { ascending: false }).limit(10),
      ])
      setDetail({ tasks: (tasks.data as any) || [], activity: (activity.data as any) || [], runs: (runs.data as any) || [] })
    }
    load()
  }, [selected?.id])

  const list = (
    <div className="space-y-5 pr-2">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-semibold text-white tracking-tight">Organisation</h1>
        <p className="text-[12px] text-white/35 font-mono tabular-nums">{agents.length} {agents.length === 1 ? 'agent' : 'agents'}</p>
      </div>
      
      {groupedAgents.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-12 flex flex-col items-center justify-center text-center">
          <Users size={24} className="text-white/20 mb-3" />
          <p className="text-[13px] text-white/45">No agents found</p>
          <p className="text-[11px] text-white/25 mt-1">Agents will appear here when active</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedAgents.map(([podName, podAgents]) => {
            const config = POD_CONFIG[podName]
            const Icon = config?.icon || Users
            const headerBg = config?.headerBg || 'bg-white/[0.02] border-white/[0.06]'
            const labelColor = config ? config.color.split(' ')[0] : 'text-white/50'
            
            return (
              <div key={podName} className="space-y-2">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${headerBg}`}>
                  <Icon size={14} className={labelColor} />
                  <span className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${labelColor}`}>
                    {config?.label || podName}
                  </span>
                  <span className="text-[10px] text-white/30 font-mono ml-auto">{podAgents.length}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {podAgents.map(a => {
                    const podCls = POD_COLOR[a.pod || ''] || 'text-white/50 border-white/10 bg-white/[0.03]'
                    const isSel = selected?.id === a.id
                    const wl = workloads[a.id] || { active: 0, blocked: 0, waiting: 0 }
                    const hasWork = wl.active > 0 || wl.blocked > 0 || wl.waiting > 0
                    return (
                      <button
                        key={a.id}
                        onClick={() => setSelectedId(a.id)}
                        className={`text-left rounded-xl border p-3 transition-all ${
                          isSel ? 'border-violet-500/40 bg-violet-500/[0.07]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <AgentAvatar agent={a.id} size="md" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-white font-semibold truncate">{a.name}</p>
                            {a.role && <p className="text-[10px] text-white/40 truncate mt-0.5">{a.role}</p>}
                            {hasWork && (
                              <div className="flex items-center gap-1.5 mt-1.5">
                                {wl.active > 0 && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono tabular-nums" title="Active tasks">
                                    {wl.active}
                                  </span>
                                )}
                                {wl.waiting > 0 && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 font-mono tabular-nums" title="Waiting tasks">
                                    {wl.waiting}
                                  </span>
                                )}
                                {wl.blocked > 0 && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-rose-500/15 text-rose-400 font-mono tabular-nums" title="Blocked tasks">
                                    {wl.blocked}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const rightPanel = selected ? (
    <div className="space-y-6 pb-6">
      <div className="flex items-start gap-4">
        <AgentAvatar agent={selected.id} size="lg" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold text-white leading-tight tracking-tight">{selected.name}</h1>
          {selected.role && <p className="text-[13px] text-white/55 mt-1">{selected.role}</p>}
          {selected.pod && (
            <span className={`inline-block text-[10px] px-1.5 py-0.5 mt-2 rounded border font-medium ${POD_COLOR[selected.pod || ''] || 'text-white/50 border-white/10 bg-white/[0.03]'}`}>{selected.pod}</span>
          )}
        </div>
      </div>

      {selected.mandate && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-2">Mandate</p>
          <p className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap">{selected.mandate}</p>
        </div>
      )}

      {selected.brief_content && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-2">Brief</p>
          <p className="text-[12px] text-white/60 leading-relaxed line-clamp-6 whitespace-pre-wrap">{selected.brief_content}</p>
        </div>
      )}

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-2.5">Recent Activity</p>
        {detail.activity.length === 0 ? (
          <div className="flex flex-col items-center py-4 text-center">
            <ActivityIcon size={16} className="text-white/15 mb-1.5" />
            <p className="text-[11px] text-white/30">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {detail.activity.slice(0, 5).map(a => (
              <p key={a.id} className="text-[12px] text-white/60 leading-snug">
                <span className="text-white/30">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                <span className="text-white/25 mx-1.5">·</span>
                {a.event_type}{a.target && <span className="text-white/45"> → {a.target}</span>}
              </p>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-2.5">N8N Runs</p>
        {detail.runs.length === 0 ? (
          <p className="text-[11px] text-white/30">No workflow runs.</p>
        ) : (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
            {detail.runs.slice(0, 5).map(r => (
              <div key={r.id} className="flex items-center justify-between px-3 py-2 text-[12px]">
                <span className="text-white/70 truncate">{r.workflow_name}</span>
                <span className={`text-[11px] font-medium ${r.status === 'success' ? 'text-emerald-400' : r.status === 'error' ? 'text-rose-400' : 'text-white/40'}`}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  ) : <div className="h-full flex items-center justify-center text-[13px] text-white/30">Select an agent</div>

  return <SplitPane left={list} right={rightPanel} hasSelection={!!selectedId} onBack={() => setSelectedId(null)} leftWidth="45%" />
}
