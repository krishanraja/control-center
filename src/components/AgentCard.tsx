import React from 'react'
import { Agent } from '../types'
import { formatRelativeTime, formatNextRun } from '../utils/time'
import { Clock, AlertCircle, CheckCircle, Loader2, XCircle, Pause } from 'lucide-react'

interface Props {
  agent: Agent
  currentTime: Date
}

export function AgentCard({ agent, currentTime }: Props) {
  const getStatusIcon = () => {
    switch (agent.status) {
      case 'running': return <Loader2 className="w-4 h-4 text-command-success animate-spin" />
      case 'waiting': return <Clock className="w-4 h-4 text-command-info" />
      case 'success': return <CheckCircle className="w-4 h-4 text-command-success" />
      case 'blocked': return <XCircle className="w-4 h-4 text-command-error" />
      case 'error': return <AlertCircle className="w-4 h-4 text-command-error" />
    }
  }

  const getStatusColor = () => {
    switch (agent.status) {
      case 'running': return 'border-command-success/30 bg-command-success/5'
      case 'waiting': return 'border-command-info/30 bg-command-info/5'
      case 'success': return 'border-command-success/30 bg-command-success/5'
      case 'blocked': return 'border-command-error/30 bg-command-error/5'
      case 'error': return 'border-command-error/30 bg-command-error/5'
    }
  }

  const getModelBadge = () => {
    const colors = {
      haiku: 'bg-blue-500/20 text-blue-300',
      sonnet: 'bg-green-500/20 text-green-300',
      opus: 'bg-purple-500/20 text-purple-300'
    }
    return `${colors[agent.model]} px-2 py-1 rounded text-xs font-mono`
  }

  return (
    <div className={`border border-command-border rounded-lg p-4 bg-command-card ${getStatusColor()}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <div>
            <h3 className="font-semibold text-white">{agent.name}</h3>
            <p className="text-xs text-command-text/70">{agent.role}</p>
          </div>
        </div>
        <div className={getModelBadge()}>{agent.model}</div>
      </div>

      <p className="text-sm text-command-text/80 mb-3 leading-relaxed">
        {agent.description}
      </p>

      {agent.workSummary && (
        <div className="mb-3 p-2 bg-command-bg/50 rounded border border-command-border/50">
          <p className="text-sm text-command-text">{agent.workSummary}</p>
        </div>
      )}

      {agent.blockers && agent.blockers.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center space-x-1 mb-1">
            <AlertCircle className="w-3 h-3 text-command-error" />
            <span className="text-xs font-medium text-command-error">Blocked</span>
          </div>
          {agent.blockers.map((blocker, i) => (
            <p key={i} className="text-xs text-command-error/80 ml-4">• {blocker}</p>
          ))}
        </div>
      )}

      <div className="flex justify-between text-xs text-command-text/70 border-t border-command-border/50 pt-3">
        <div>
          {agent.lastRun ? (
            <span>Last: {formatRelativeTime(agent.lastRun)}</span>
          ) : (
            <span>Never run</span>
          )}
        </div>
        <div>
          Next: {formatNextRun(agent.nextRun)}
        </div>
      </div>
    </div>
  )
}
