import React, { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
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

const POD_COLOR: Record<string, string> = {
  executive: 'text-purple-400 border-purple-500/25 bg-purple-500/10',
  ops:       'text-blue-400 border-blue-500/25 bg-blue-500/10',
  growth:    'text-emerald-400 border-emerald-500/25 bg-emerald-500/10',
}

export function DesktopOrg() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ tasks: any[]; activity: any[]; runs: any[] }>({ tasks: [], activity: [], runs: [] })

  useEffect(() => {
    supabase.from('agents').select('*').eq('active', true).order('pod').then(({ data }) => {
      setAgents((data as any) || [])
    })
  }, [])

  const selected = agents.find(a => a.id === selectedId) || agents[0] || null

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
    <div className="space-y-4 pr-2">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-[26px] font-semibold text-white tracking-tight">Organisation</h1>
        <p className="text-[12px] text-white/35 font-mono tabular-nums">{agents.length} {agents.length === 1 ? 'agent' : 'agents'}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {agents.map(a => {
          const podCls = POD_COLOR[a.pod || ''] || 'text-white/50 border-white/10 bg-white/[0.03]'
          const isSel = selected?.id === a.id
          return (
            <button
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className={`text-left rounded-xl border p-3.5 transition-all ${
                isSel ? 'border-violet-500/40 bg-violet-500/[0.07]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-start gap-3">
                <AgentAvatar agent={a.id} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-white font-semibold truncate">{a.name}</p>
                  <span className={`inline-block text-[10px] px-1.5 py-0.5 mt-1 rounded border font-medium ${podCls}`}>{a.pod || 'unassigned'}</span>
                  {a.last_run && <p className="text-[10px] text-white/30 mt-1.5">Last run {formatDistanceToNow(new Date(a.last_run), { addSuffix: true })}</p>}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )

  const rightPanel = selected ? (
    <div className="space-y-6 pb-6">
      <div className="flex items-start gap-4">
        <AgentAvatar agent={selected.id} size="lg" />
        <div className="flex-1 min-w-0">
          <h1 className="text-[26px] font-semibold text-white leading-tight tracking-tight">{selected.name}</h1>
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
          <p className="text-[11px] text-white/30">No recent activity.</p>
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
