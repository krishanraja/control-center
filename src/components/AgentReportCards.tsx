import React, { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useAgents } from '../hooks/useAgents'
import { AgentDetailModal } from './AgentDetailModal'
import { LastUpdated } from './shared/LastUpdated'
import { Agent } from '../types'

const STATUS_DOT: Record<string, string> = {
  running: 'bg-emerald-400 shadow-emerald-400/50 animate-pulse shadow-sm',
  success: 'bg-emerald-400',
  waiting: 'bg-blue-400',
  blocked: 'bg-red-400 shadow-red-400/50 animate-pulse shadow-sm',
  error:   'bg-red-400',
}

const POD_STYLE: Record<string, string> = {
  revenue: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  growth:  'text-violet-400 bg-violet-400/10 border-violet-400/20',
  ops:     'text-slate-400 bg-slate-400/10 border-slate-400/20',
}

export function AgentReportCards() {
  const { agents, updatedAt } = useAgents()
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  const pods = [
    { key: 'revenue', label: 'Revenue Pod', agents: agents.filter(a => a.pod === 'revenue') },
    { key: 'growth',  label: 'Growth Pod',  agents: agents.filter(a => a.pod === 'growth') },
    { key: 'ops',     label: 'Ops Pod',     agents: agents.filter(a => a.pod === 'ops') },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-white">Agent Report Cards</h2>
        <LastUpdated date={updatedAt} />
      </div>

      {pods.map(pod => (
        <div key={pod.key}>
          <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${POD_STYLE[pod.key].split(' ')[0]}`}>
            {pod.label}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {pod.agents.map(agent => {
              const status = agent.status as keyof typeof STATUS_DOT
              const isBlocked = status === 'blocked' || status === 'error'

              return (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent)}
                  className={`text-left p-4 rounded-xl border transition-all duration-200 hover:scale-[1.02] group
                    ${isBlocked
                      ? 'bg-red-500/5 border-red-500/25 hover:border-red-400/40'
                      : 'bg-white/[0.02] border-white/[0.07] hover:border-white/[0.14] hover:bg-white/[0.04]'
                    }`}
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[status] ?? STATUS_DOT.waiting}`} />
                      <span className={`text-[10px] font-bold uppercase tracking-wider
                        ${isBlocked ? 'text-red-400' : 'text-white/30'}`}>
                        {status}
                      </span>
                    </div>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${POD_STYLE[agent.pod ?? 'ops']}`}>
                      {agent.pod}
                    </span>
                  </div>

                  {/* Name + role */}
                  <p className="text-[14px] font-semibold text-white mb-0.5 leading-tight">{agent.humanName}</p>
                  <p className="text-[11px] text-white/40 leading-snug mb-3 truncate">{agent.role}</p>

                  {/* KPI */}
                  {agent.kpi && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-white/45 uppercase tracking-wider">{agent.kpi.label}</p>
                      <p className="text-[11px] text-white/60 truncate">
                        {agent.kpi.current ?? '—'}
                      </p>
                      <p className="text-[10px] text-white/35 truncate">Target: {agent.kpi.target}</p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
                    <p className="text-[10px] text-white/25 font-mono">
                      {agent.lastRun ? formatDistanceToNow(agent.lastRun, { addSuffix: true }) : 'Not run'}
                    </p>
                    {agent.planDocUrl && (
                      <a
                        href={agent.planDocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-[10px] text-violet-400/60 hover:text-violet-300 flex items-center gap-0.5 transition-colors"
                      >
                        Brief <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          isOpen={!!selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  )
}
