import React, { useState, useEffect } from 'react'

interface TopAction {
  id: string
  title: string
  owner: string
  status: string
}

interface AgentHealth {
  total_agents: number
  brief_files: number
  all_have_mcf: boolean
}

interface SystemHealth {
  contradictions: number
  workspace_clean: boolean
  control_center_synced: boolean
}

interface HomeIntelligenceData {
  schema_version?: string
  generated_at: string
  executive_summary: string
  top_3_actions: TopAction[]
  agent_health: AgentHealth
  system_health: SystemHealth
}

const statusDot: Record<string, string> = {
  blocked:     'bg-red-400',
  at_risk:     'bg-amber-400',
  on_track:    'bg-violet-400',
  in_progress: 'bg-blue-400',
  waiting:     'bg-white/30',
  ahead:       'bg-emerald-400',
  done:        'bg-emerald-400',
}

const statusLabel: Record<string, string> = {
  blocked:     'Blocked',
  at_risk:     'At risk',
  on_track:    'On track',
  in_progress: 'In progress',
  waiting:     'Waiting',
  ahead:       'Ahead',
  done:        'Done',
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function HomeIntelligence() {
  const [data, setData] = useState<HomeIntelligenceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = () =>
      fetch('/data/home-intelligence.json', { cache: 'no-cache' })
        .then(r => r.json())
        .then(d => { setData(d); setError(null); setLoading(false) })
        .catch(e => { setError(String(e)); setLoading(false) })
    load()
    const iv = setInterval(load, 5 * 60_000)
    return () => clearInterval(iv)
  }, [])

  if (loading) return <div className="py-16 text-center text-[13px] text-white/30">Loading…</div>
  if (error || !data) return <div className="py-16 text-center text-[13px] text-white/30">No intelligence yet</div>

  const actions = data.top_3_actions ?? []
  const agentHealth = data.agent_health
  const sysHealth = data.system_health

  const sysOk =
    sysHealth &&
    sysHealth.contradictions === 0 &&
    sysHealth.workspace_clean &&
    sysHealth.control_center_synced

  return (
    <div className="space-y-5">

      {/* ── Executive Summary ── */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
        <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-3">
          Executive Summary{data.generated_at ? ` · ${timeAgo(data.generated_at)}` : ''}
        </p>
        <p className="text-[15px] font-semibold text-white leading-snug">
          {data.executive_summary}
        </p>
      </div>

      {/* ── Top 3 Actions ── */}
      {actions.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-white/[0.05] flex items-center justify-between">
            <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest">
              Top {actions.length} Actions
            </p>
            <span className="text-[10px] text-white/20">{actions.length}</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {actions.map(a => {
              const dot = statusDot[a.status] ?? 'bg-white/20'
              const label = statusLabel[a.status] ?? a.status
              return (
                <div key={a.id} className="px-5 py-3 flex items-start gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2 ${dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-white/80 leading-snug">{a.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-white/40 uppercase tracking-wide">{a.owner}</span>
                      <span className="text-[10px] text-white/20">·</span>
                      <span className="text-[10px] text-white/40 uppercase tracking-wide">{label}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Health Strip ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {agentHealth && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2">
              Agent Health
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-[20px] font-bold text-white leading-none">
                {agentHealth.brief_files}
              </span>
              <span className="text-[12px] text-white/30">/ {agentHealth.total_agents} briefs</span>
            </div>
            <p className={`text-[11px] mt-2 ${agentHealth.all_have_mcf ? 'text-emerald-400/80' : 'text-amber-300/80'}`}>
              {agentHealth.all_have_mcf ? 'All agents standardized with MCF' : 'MCF coverage incomplete'}
            </p>
          </div>
        )}
        {sysHealth && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2">
              System Health
            </p>
            <div className="flex items-baseline gap-2">
              <span className={`text-[20px] font-bold leading-none ${sysOk ? 'text-emerald-400' : 'text-amber-300'}`}>
                {sysOk ? 'Healthy' : 'Attention'}
              </span>
            </div>
            <div className="mt-2 space-y-1">
              <p className="text-[11px] text-white/40">
                Contradictions: <span className={sysHealth.contradictions === 0 ? 'text-emerald-400/80' : 'text-red-400/80'}>{sysHealth.contradictions}</span>
              </p>
              <p className="text-[11px] text-white/40">
                Workspace: <span className={sysHealth.workspace_clean ? 'text-emerald-400/80' : 'text-amber-300/80'}>{sysHealth.workspace_clean ? 'clean' : 'dirty'}</span>
              </p>
              <p className="text-[11px] text-white/40">
                CC sync: <span className={sysHealth.control_center_synced ? 'text-emerald-400/80' : 'text-amber-300/80'}>{sysHealth.control_center_synced ? 'live' : 'stale'}</span>
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
