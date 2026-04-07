import React, { useState } from 'react'
import { Agent } from '../types'
import { AgentDetailModal } from './AgentDetailModal'
import { Crown, Loader2, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

interface Props {
  agents: Agent[]
  currentTime: Date
}

function StatusDot({ status }: { status: Agent['status'] }) {
  switch (status) {
    case 'running':
      return <span className="w-2.5 h-2.5 rounded-full bg-command-success animate-pulse block" />
    case 'waiting':
      return <span className="w-2.5 h-2.5 rounded-full bg-command-info block" />
    case 'success':
      return <span className="w-2.5 h-2.5 rounded-full bg-command-success block" />
    case 'blocked':
      return <span className="w-2.5 h-2.5 rounded-full bg-command-error animate-pulse block" />
    case 'error':
      return <span className="w-2.5 h-2.5 rounded-full bg-command-error block" />
  }
}

function AgentNode({ agent, onClick, isRoot }: { agent: Agent; onClick: () => void; isRoot?: boolean }) {
  const borderColor = {
    running: 'border-command-success/60',
    waiting: 'border-command-info/40',
    success: 'border-command-success/40',
    blocked: 'border-command-error/60',
    error: 'border-command-error/60',
  }[agent.status]

  const bgColor = {
    running: 'bg-command-success/10',
    waiting: 'bg-command-info/5',
    success: 'bg-command-success/5',
    blocked: 'bg-command-error/10',
    error: 'bg-command-error/10',
  }[agent.status]

  return (
    <button
      onClick={onClick}
      className={`
        group relative flex flex-col items-center p-3 rounded-xl border ${borderColor} ${bgColor}
        ${isRoot ? 'min-w-[160px] px-5 py-4' : 'min-w-[130px]'}
        hover:border-command-accent/70 hover:shadow-lg hover:shadow-command-accent/10
        transition-all duration-200 cursor-pointer text-left
      `}
    >
      {isRoot && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-command-accent/20 border border-command-accent/40 
          rounded-full px-2 py-0.5 text-[10px] text-command-accent font-semibold tracking-wide">
          COO
        </div>
      )}
      <div className="flex items-center justify-between w-full mb-1.5">
        <StatusDot status={agent.status} />
        <span className="text-[10px] font-mono text-command-text/50 bg-command-bg/40 px-1.5 py-0.5 rounded">
          {agent.model}
        </span>
      </div>
      <div className="text-center w-full">
        <p className={`font-bold text-white group-hover:text-command-accent transition-colors
          ${isRoot ? 'text-base' : 'text-sm'}`}>
          {agent.humanName}
        </p>
        <p className="text-[11px] text-command-text/60 leading-tight mt-0.5">{agent.role}</p>
      </div>
      {agent.status === 'blocked' && (
        <div className="mt-1.5 text-[10px] text-command-error/80 text-center">
          ⚠ Blocked
        </div>
      )}
    </button>
  )
}

// SVG connector line between parent and child
function Connector({ x1, y1, x2, y2, color = '#3a3a3d' }: {
  x1: number; y1: number; x2: number; y2: number; color?: string
}) {
  const midY = (y1 + y2) / 2
  const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
  return <path d={d} stroke={color} strokeWidth="1.5" fill="none" strokeDasharray="none" opacity="0.5" />
}

export function OrgChart({ agents, currentTime }: Props) {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  const agatha = agents.find(a => a.id === 'agatha')!
  const reports = agents.filter(a => a.reportsTo === 'agatha')

  // Krish (CEO) node — not a real agent, just visual
  const krishNode = (
    <div className="flex flex-col items-center">
      <div className="flex flex-col items-center p-3 px-5 rounded-xl border border-amber-400/40 bg-amber-400/5 min-w-[140px]">
        <div className="flex items-center justify-between w-full mb-1">
          <Crown className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] text-amber-400/60 font-semibold">FOUNDER</span>
        </div>
        <p className="font-bold text-amber-400 text-base">Krish</p>
        <p className="text-[11px] text-amber-400/60">CEO & Founder</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Organisation Chart</h2>
        <p className="text-sm text-command-text/60">Click any agent to see full profile</p>
      </div>

      <div className="bg-command-card border border-command-border rounded-xl p-8 overflow-x-auto">
        <div className="flex flex-col items-center space-y-0 min-w-[900px]">

          {/* Tier 1: Krish */}
          <div className="flex justify-center">
            {krishNode}
          </div>

          {/* Connector: Krish → Agatha */}
          <div className="flex justify-center">
            <div className="w-px h-8 bg-command-border/50" />
          </div>

          {/* Tier 2: Agatha */}
          <div className="flex justify-center">
            {agatha && (
              <AgentNode
                agent={agatha}
                isRoot={true}
                onClick={() => setSelectedAgent(agatha)}
              />
            )}
          </div>

          {/* Connector: Agatha → Reports */}
          <div className="relative flex justify-center w-full">
            <div className="w-px h-8 bg-command-border/50" />
          </div>

          {/* Horizontal rule spanning all children */}
          <div className="relative w-full flex justify-center">
            <div
              className="h-px bg-command-border/50"
              style={{
                width: `${Math.min(reports.length * 160, 900)}px`,
              }}
            />
          </div>

          {/* Tier 3: All reports — vertical connectors */}
          <div className="flex justify-center gap-0" style={{ width: `${Math.min(reports.length * 160, 900)}px` }}>
            {reports.map((_, i) => {
              const count = reports.length
              return (
                <div
                  key={i}
                  className="flex justify-center"
                  style={{ width: `${100 / count}%` }}
                >
                  <div className="w-px h-6 bg-command-border/50" />
                </div>
              )
            })}
          </div>

          {/* Tier 3: Agent nodes */}
          <div
            className="flex justify-center gap-4"
            style={{ width: `${Math.min(reports.length * 160, 900)}px` }}
          >
            {reports.map(agent => (
              <div key={agent.id} className="flex-1 flex justify-center" style={{ minWidth: 0 }}>
                <AgentNode
                  agent={agent}
                  onClick={() => setSelectedAgent(agent)}
                />
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-command-text/60">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-command-success animate-pulse block" />
              Running
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-command-info block" />
              Waiting
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-command-success block" />
              Success
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-command-error animate-pulse block" />
              Blocked
            </div>
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