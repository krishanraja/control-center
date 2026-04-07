import React, { useState } from 'react'
import { Agent } from '../types'
import { AgentCard } from './AgentCard'
import { AgentDetailModal } from './AgentDetailModal'
import { Filter, Users } from 'lucide-react'

interface Props {
  agents: Agent[]
  currentTime: Date
}

type StatusFilter = 'all' | 'running' | 'waiting' | 'blocked' | 'error' | 'success'

export function AgentGrid({ agents, currentTime }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  const filteredAgents = agents.filter(agent => {
    if (statusFilter === 'all') return true
    return agent.status === statusFilter
  })

  const statusCounts = {
    all: agents.length,
    running: agents.filter(a => a.status === 'running').length,
    waiting: agents.filter(a => a.status === 'waiting').length,
    blocked: agents.filter(a => a.status === 'blocked').length,
    error: agents.filter(a => a.status === 'error').length,
    success: agents.filter(a => a.status === 'success').length,
  }

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent)
  }

  const handleCloseModal = () => {
    setSelectedAgent(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-command-text/70" />
          <h2 className="text-xl font-semibold text-white">Agent Status</h2>
          <span className="text-command-text/70">({filteredAgents.length})</span>
        </div>

        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-command-text/70" />
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="bg-command-card border border-command-border rounded px-3 py-1 text-sm text-command-text"
          >
            <option value="all">All ({statusCounts.all})</option>
            <option value="running">Running ({statusCounts.running})</option>
            <option value="waiting">Waiting ({statusCounts.waiting})</option>
            <option value="success">Success ({statusCounts.success})</option>
            <option value="blocked">Blocked ({statusCounts.blocked})</option>
            <option value="error">Error ({statusCounts.error})</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredAgents.map(agent => (
          <AgentCard 
            key={agent.id} 
            agent={agent} 
            currentTime={currentTime}
            onClick={() => handleAgentClick(agent)}
          />
        ))}
      </div>

      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          isOpen={true}
          onClose={handleCloseModal}
        />
      )}
    </div>
  )
}