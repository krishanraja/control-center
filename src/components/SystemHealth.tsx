import React from 'react'
import { SystemHealth as SystemHealthType } from '../types'
import { Activity, Server, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'

interface Props {
  health: SystemHealthType
}

export function SystemHealth({ health }: Props) {
  const getStatusIcon = () => {
    switch (health.overall) {
      case 'healthy': return <CheckCircle className="w-5 h-5 text-command-success" />
      case 'warning': return <AlertTriangle className="w-5 h-5 text-command-warning" />
      case 'critical': return <XCircle className="w-5 h-5 text-command-error" />
    }
  }

  const getStatusColor = () => {
    switch (health.overall) {
      case 'healthy': return 'border-command-success/20 bg-command-success/5'
      case 'warning': return 'border-command-warning/20 bg-command-warning/5'  
      case 'critical': return 'border-command-error/20 bg-command-error/5'
    }
  }

  return (
    <div className={`border rounded-lg p-4 ${getStatusColor()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {getStatusIcon()}
          <div>
            <h2 className="text-lg font-semibold text-white">System Health</h2>
            <p className="text-command-text/70 text-sm capitalize">{health.overall}</p>
          </div>
        </div>

        <div className="flex items-center space-x-8">
          <div className="text-center">
            <div className="flex items-center space-x-1">
              <Activity className="w-4 h-4 text-command-info" />
              <span className="text-lg font-mono text-white">{health.agentsRunning}</span>
              <span className="text-command-text/70">/ {health.totalAgents}</span>
            </div>
            <div className="text-xs text-command-text/70">agents</div>
          </div>

          <div className="text-center">
            <div className="flex items-center space-x-1">
              <Server className="w-4 h-4 text-command-info" />
              <span className="text-lg font-mono text-white">{health.workflowsActive}</span>
              <span className="text-command-text/70">/ {health.totalWorkflows}</span>
            </div>
            <div className="text-xs text-command-text/70">workflows</div>
          </div>

          <div className="text-center">
            <div className="text-lg font-mono text-white">{health.uptime}</div>
            <div className="text-xs text-command-text/70">uptime</div>
          </div>
        </div>
      </div>
    </div>
  )
}
