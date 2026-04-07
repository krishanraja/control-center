import React, { useState } from 'react'
import { Agent } from '../types'
import { AgentDetailModal } from './AgentDetailModal'
import { Crown, Bell, Heart } from 'lucide-react'

interface Props {
  agents: Agent[]
  currentTime: Date
}

const PODS = [
  {
    id: 'ops',
    label: 'Ops Pod',
    color: 'border-slate-500/40 bg-slate-500/5',
    headerColor: 'text-slate-400',
    agents: ['vera-daily', 'tools-agent', 'weekly-synthesis'],
  },
  {
    id: 'revenue',
    label: 'Revenue Pod',
    color: 'border-emerald-500/40 bg-emerald-500/5',
    headerColor: 'text-emerald-400',
    agents: ['revenue-agent', 'product-agent'],
  },
  {
    id: 'growth',
    label: 'Growth Pod',
    color: 'border-violet-500/40 bg-violet-500/5',
    headerColor: 'text-violet-400',
    agents: ['bd-agent', 'enterprise-gigs', 'visibility-agent', 'marketing-agent'],
  },
]

function StatusDot({ status }: { status: Agent['status'] }) {
  switch (status) {
    case 'running': return <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
    case 'waiting': return <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
    case 'success': return <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
    case 'blocked': return <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse inline-block" />
    case 'error': return <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
  }
}

function AgentPill({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  const isBlocked = agent.status === 'blocked' || agent.status === 'error'
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left w-full
        transition-all duration-200 hover:scale-[1.02] group
        ${isBlocked
          ? 'border-red-500/40 bg-red-500/10 hover:border-red-400/60'
          : 'border-command-border bg-command-bg/40 hover:border-command-accent/50 hover:bg-command-accent/5'
        }`}
    >
      <StatusDot status={agent.status} />
      <div className="min-w-0">
        <p className={`text-sm font-semibold truncate group-hover:text-command-accent transition-colors
          ${isBlocked ? 'text-red-300' : 'text-white'}`}>
          {agent.humanName}
        </p>
        <p className="text-[10px] text-command-text/50 truncate">{agent.role}</p>
      </div>
      {isBlocked && <span className="text-[10px] text-red-400 ml-auto flex-shrink-0">⚠</span>}
    </button>
  )
}

function ConnectorV({ className = '' }: { className?: string }) {
  return <div className={`w-px bg-command-border/40 mx-auto ${className}`} style={{ height: 24 }} />
}

function ConnectorH({ pods }: { pods: number }) {
  if (pods <= 1) return null
  return <div className="h-px bg-command-border/40 w-full" />
}

export function OrgChart({ agents, currentTime }: Props) {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  const agatha = agents.find(a => a.id === 'agatha')!

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Organisation Chart</h2>
        <p className="text-sm text-command-text/50">Click any agent for full profile</p>
      </div>

      <div className="bg-command-card border border-command-border rounded-xl p-6">

        {/* Tier 1: Krish + Finno side by side */}
        <div className="flex justify-center items-start gap-8 mb-0">

          {/* Finno — personal system, dotted connection to Krish */}
          <div className="flex flex-col items-center gap-1 pt-2">
            <div className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl border border-pink-400/25 bg-pink-400/5 min-w-[130px] text-center">
              <div className="flex items-center gap-1.5">
                <Heart className="w-3 h-3 text-pink-400" />
                <span className="text-[10px] text-pink-400/60 font-semibold tracking-widest uppercase">Personal</span>
              </div>
              <p className="text-base font-bold text-pink-300">Finno</p>
              <p className="text-[10px] text-pink-400/50 leading-tight">Mind, money<br/>& relationships</p>
            </div>
            <div className="text-[9px] text-pink-400/40 mt-1 italic">personal layer</div>
          </div>

          {/* Krish */}
          <div className="flex flex-col items-center gap-1 px-6 py-3 rounded-xl border border-amber-400/30 bg-amber-400/5 min-w-[140px] text-center">
            <div className="flex items-center gap-2">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] text-amber-400/70 font-semibold tracking-widest uppercase">Founder</span>
            </div>
            <p className="text-lg font-bold text-amber-400">Krish</p>
            <p className="text-[11px] text-amber-400/60">CEO & Founder</p>
          </div>

          {/* Spacer to balance layout */}
          <div className="min-w-[130px]" />
        </div>

        <ConnectorV />

        {/* Tier 2: Agatha + Iris side by side */}
        <div className="flex justify-center items-center gap-6 mb-0">

          {/* Agatha */}
          <button
            onClick={() => setSelectedAgent(agatha)}
            className="flex flex-col items-center gap-1 px-6 py-3 rounded-xl border border-command-success/40 bg-command-success/5
              hover:border-command-accent/60 hover:bg-command-accent/5 transition-all duration-200 min-w-[140px] text-center group"
          >
            <div className="flex items-center gap-2">
              <StatusDot status={agatha.status} />
              <span className="text-[10px] text-command-text/50 font-semibold tracking-widest uppercase">COO</span>
            </div>
            <p className="text-lg font-bold text-white group-hover:text-command-accent transition-colors">Agatha</p>
            <p className="text-[11px] text-command-text/50">Chief Operating Officer</p>
          </button>

          {/* Horizontal connector */}
          <div className="h-px w-8 bg-sky-400/30" />

          {/* Iris — beside Agatha, not in the reporting chain */}
          <div className="flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl border border-sky-400/30 bg-sky-400/5 min-w-[150px] text-center">
            <div className="flex items-center gap-1.5">
              <Bell className="w-3 h-3 text-sky-400" />
              <span className="text-[10px] text-sky-400/60 font-semibold tracking-widest uppercase">Comms · Ops-bot</span>
            </div>
            <p className="text-base font-bold text-sky-300">Iris</p>
            <p className="text-[10px] text-sky-400/50 leading-tight">All notifications &<br/>escalations route via me</p>
          </div>
        </div>

        <ConnectorV />

        {/* Tier 3: Pods */}
        <div className="flex items-start gap-4 justify-center">
          {PODS.map((pod, podIdx) => {
            const podAgents = pod.agents
              .map(id => agents.find(a => a.id === id))
              .filter(Boolean) as Agent[]

            return (
              <React.Fragment key={pod.id}>
                <div className="flex flex-col items-center flex-1 max-w-xs">
                  <ConnectorV />
                  <div className={`border rounded-xl p-3 w-full ${pod.color}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 text-center ${pod.headerColor}`}>
                      {pod.label}
                    </p>
                    <div className="flex flex-col gap-2">
                      {podAgents.map(agent => (
                        <AgentPill
                          key={agent.id}
                          agent={agent}
                          onClick={() => setSelectedAgent(agent)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                {podIdx < PODS.length - 1 && (
                  <div className="w-px bg-command-border/20 self-stretch mt-6" />
                )}
              </React.Fragment>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-5 pt-4 border-t border-command-border/30">
          <div className="flex items-center gap-2 text-xs text-command-text/50">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" /> Running
          </div>
          <div className="flex items-center gap-2 text-xs text-command-text/50">
            <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Waiting
          </div>
          <div className="flex items-center gap-2 text-xs text-command-text/50">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Success
          </div>
          <div className="flex items-center gap-2 text-xs text-command-text/50">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse inline-block" /> Blocked
          </div>
        </div>
      </div>

      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          isOpen={true}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  )
}