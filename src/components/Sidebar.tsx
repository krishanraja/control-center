import React from 'react'
import { Agent } from '../types'
import { BarChart3, Circle, GitBranch, ExternalLink } from '@/lib/icons'

interface Props {
  agents: Agent[]
  currentTime: Date
}

export function Sidebar({ agents, currentTime }: Props) {
  const getStatusDot = (status: string) => {
    const colors = {
      running: 'text-command-success',
      waiting: 'text-command-info', 
      success: 'text-command-success',
      blocked: 'text-command-error',
      error: 'text-command-error'
    }
    return <Circle className={`w-2 h-2 ${colors[status as keyof typeof colors]} fill-current`} />
  }

  const agatha = agents.find(a => a.id === 'agatha')
  const otherAgents = agents.filter(a => a.id !== 'agatha')

  return (
    <div className="w-72 bg-command-surface border-r border-command-border p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <GitBranch size={20} />
            <span>Organization</span>
          </h2>
          
          {/* Agatha at top */}
          {agatha && (
            <div className="mb-4 p-3 bg-command-card border border-command-border rounded">
              <div className="flex items-center space-x-2">
                {getStatusDot(agatha.status)}
                <div>
                  <div className="font-medium text-white">{agatha.name}</div>
                  <div className="text-xs text-command-text/70">{agatha.role}</div>
                </div>
              </div>
            </div>
          )}

          {/* Other agents */}
          <div className="space-y-1">
            {otherAgents.map(agent => (
              <div key={agent.id} className="flex items-center space-x-2 p-2 hover:bg-command-card/50 rounded text-sm group">
                {getStatusDot(agent.status)}
                <div className="flex-1 min-w-0">
                  <div className="text-command-text truncate">{agent.name}</div>
                  <div className="text-xs text-command-text/50 truncate">{agent.role}</div>
                </div>
                {agent.planDocUrl && (
                  <a
                    href={agent.planDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open Agent Brief"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-command-text/30 hover:text-violet-400 flex-shrink-0"
                    onClick={e => e.stopPropagation()}
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Status Legend */}
        <div>
          <h3 className="text-sm font-medium text-white mb-3 flex items-center space-x-2">
            <BarChart3 size={16} />
            <span>Status</span>
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center space-x-2">
              <Circle className="w-2 h-2 text-command-success fill-current" />
              <span className="text-command-text/70">Running / Success</span>
            </div>
            <div className="flex items-center space-x-2">
              <Circle className="w-2 h-2 text-command-info fill-current" />
              <span className="text-command-text/70">Waiting</span>
            </div>
            <div className="flex items-center space-x-2">
              <Circle className="w-2 h-2 text-command-error fill-current" />
              <span className="text-command-text/70">Blocked / Error</span>
            </div>
          </div>
        </div>

        {/* Last Update */}
        <div className="text-xs text-command-text/50 border-t border-command-border/50 pt-4">
          <div>Last update:</div>
          <div className="font-mono">{currentTime.toLocaleTimeString()}</div>
        </div>
      </div>
    </div>
  )
}
