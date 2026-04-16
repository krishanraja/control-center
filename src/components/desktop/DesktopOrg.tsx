import React, { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Crown, Cog, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { SplitPane } from '../SplitPane'
import { AgentAvatar } from '../shared/AgentAvatar'
import { humanize } from '../shared/tokens'

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

interface PodDef {
  key: string
  label: string
  accent: string      // text color for section header
  ring: string        // border accent
  tint: string        // subtle background tint
  chip: string        // pod-chip classes
  icon: React.ReactNode
  description?: string
}

// Pods are rendered in strict hierarchy order: Executive → Ops → Growth → other.
const POD_DEFS: Record<string, PodDef> = {
  executive: {
    key: 'executive',
    label: 'Executive',
    accent: 'text-purple-300',
    ring: 'border-purple-500/30',
    tint: 'from-purple-500/[0.06] to-transparent',
    chip: 'text-purple-300 border-purple-500/30 bg-purple-500/10',
    icon: <Crown size={13} />,
    description: 'Sets direction. Owns cross-venture decisions.',
  },
  ops: {
    key: 'ops',
    label: 'Operations',
    accent: 'text-blue-300',
    ring: 'border-blue-500/30',
    tint: 'from-blue-500/[0.06] to-transparent',
    chip: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
    icon: <Cog size={13} />,
    description: 'Runs the machine. Quality, infra, product.',
  },
  growth: {
    key: 'growth',
    label: 'Growth',
    accent: 'text-emerald-300',
    ring: 'border-emerald-500/30',
    tint: 'from-emerald-500/[0.06] to-transparent',
    chip: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    icon: <Sparkles size={13} />,
    description: 'Revenue, pipeline, visibility.',
  },
}
const POD_ORDER = ['executive', 'ops', 'growth']

function podOf(pod?: string): PodDef {
  const key = (pod || '').toLowerCase()
  return POD_DEFS[key] || {
    key: key || 'unassigned',
    label: humanize(pod) || 'Unassigned',
    accent: 'text-white/60',
    ring: 'border-white/15',
    tint: 'from-white/[0.02] to-transparent',
    chip: 'text-white/55 border-white/15 bg-white/[0.04]',
    icon: <Cog size={13} />,
  }
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

  // Group agents by pod, preserving POD_ORDER then alphabetical for unknown pods.
  const groups = useMemo(() => {
    const map = new Map<string, Agent[]>()
    for (const a of agents) {
      const k = (a.pod || 'unassigned').toLowerCase()
      const arr = map.get(k) || []
      arr.push(a)
      map.set(k, arr)
    }
    const knownKeys = POD_ORDER.filter(k => map.has(k))
    const extraKeys = Array.from(map.keys()).filter(k => !POD_ORDER.includes(k)).sort()
    return [...knownKeys, ...extraKeys].map(k => ({ pod: podOf(k), members: map.get(k)! }))
  }, [agents])

  const list = (
    <div className="space-y-5 pr-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white tracking-tight">Organisation</h1>
          <p className="text-[11px] md:text-[12px] text-white/40 mt-0.5">Pod hierarchy — Executive sets direction, Ops runs the machine, Growth drives revenue.</p>
        </div>
        <p className="text-[11px] md:text-[12px] text-white/35 font-mono tabular-nums whitespace-nowrap">{agents.length} {agents.length === 1 ? 'agent' : 'agents'}</p>
      </div>

      {groups.length === 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] py-10 md:py-12 text-center">
          <p className="text-[13px] text-white/45">No active agents.</p>
        </div>
      )}

      <div className="space-y-5">
        {groups.map(({ pod, members }) => (
          <PodSection key={pod.key} pod={pod} members={members} selectedId={selected?.id} onSelect={setSelectedId} />
        ))}
      </div>
    </div>
  )

  const rightPanel = selected ? (
    <div className="space-y-5 md:space-y-6 pb-6">
      <div className="flex items-start gap-4">
        <AgentAvatar agent={selected.id} size="lg" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white leading-tight tracking-tight">{selected.name}</h1>
          {selected.role && <p className="text-xs md:text-[13px] text-white/55 mt-1">{selected.role}</p>}
          {selected.pod && (
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 mt-2 rounded-full border font-medium ${podOf(selected.pod).chip}`}>
              {podOf(selected.pod).icon}
              {podOf(selected.pod).label}
            </span>
          )}
        </div>
      </div>

      {selected.mandate && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-2">Mandate</p>
          <p className="text-xs md:text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap">{selected.mandate}</p>
        </div>
      )}

      {selected.brief_content && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-2">Brief</p>
          <p className="text-[11px] md:text-[12px] text-white/60 leading-relaxed line-clamp-6 whitespace-pre-wrap">{selected.brief_content}</p>
        </div>
      )}

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40 mb-2.5">Recent Activity</p>
        {detail.activity.length === 0 ? (
          <p className="text-[11px] text-white/30">No recent activity.</p>
        ) : (
          <div className="space-y-1.5">
            {detail.activity.slice(0, 5).map(a => (
              <p key={a.id} className="text-[11px] md:text-[12px] text-white/60 leading-snug">
                <span className="text-white/30">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                <span className="text-white/25 mx-1.5">·</span>
                {humanize(a.event_type)}{a.target && <span className="text-white/45"> → {humanize(a.target)}</span>}
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
              <div key={r.id} className="flex items-center justify-between px-3 py-2 text-[11px] md:text-[12px] gap-3">
                <span className="text-white/70 truncate">{humanize(r.workflow_name) || r.workflow_name}</span>
                <span className={`text-[11px] font-medium whitespace-nowrap ${r.status === 'success' ? 'text-emerald-400' : r.status === 'error' ? 'text-rose-400' : 'text-white/40'}`}>{humanize(r.status)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  ) : <div className="h-full flex items-center justify-center text-[13px] text-white/30">Select an agent</div>

  return <SplitPane left={list} right={rightPanel} hasSelection={!!selectedId} onBack={() => setSelectedId(null)} leftWidth="45%" />
}

function PodSection({ pod, members, selectedId, onSelect }: { pod: PodDef; members: Agent[]; selectedId?: string; onSelect: (id: string) => void }) {
  return (
    <section className={`rounded-xl border ${pod.ring} bg-gradient-to-br ${pod.tint} p-3 md:p-4`}>
      <header className="flex items-center gap-2 mb-3 px-0.5">
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md border ${pod.chip}`}>
          {pod.icon}
        </span>
        <h3 className={`text-[11px] md:text-[12px] font-semibold uppercase tracking-[0.18em] ${pod.accent}`}>{pod.label}</h3>
        <span className="text-[10px] font-mono tabular-nums text-white/30 ml-auto">{members.length}</span>
      </header>

      {pod.description && (
        <p className="text-[10.5px] md:text-[11px] text-white/35 leading-snug mb-3 px-0.5">{pod.description}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2 md:gap-2.5">
        {members.map(a => {
          const isSel = selectedId === a.id
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className={`text-left rounded-lg border p-2.5 md:p-3 transition-all min-h-[64px] ${
                isSel
                  ? 'border-violet-500/40 bg-violet-500/[0.08]'
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <AgentAvatar agent={a.id} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] md:text-[13px] text-white font-semibold truncate">{a.name}</p>
                  {a.role && <p className="text-[10.5px] md:text-[11px] text-white/45 truncate">{a.role}</p>}
                  {a.last_run && (
                    <p className="text-[10px] text-white/25 mt-1 truncate">
                      Last run {formatDistanceToNow(new Date(a.last_run), { addSuffix: true })}
                    </p>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
