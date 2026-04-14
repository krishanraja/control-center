import React from 'react'
import { Agent } from '../types'
import { X, Clock, Users, CheckSquare, User, Brain, Target, MessageCircle, CheckCircle, XCircle, ExternalLink, FileText } from 'lucide-react'
import { formatRelativeTime, formatNextRun } from '../utils/time'

interface Props {
  agent: Agent
  isOpen: boolean
  onClose: () => void
}

export function AgentDetailModal({ agent, isOpen, onClose }: Props) {
  if (!isOpen) return null

  const getStatusIcon = () => {
    switch (agent.status) {
      case 'running': return <CheckCircle className="w-5 h-5 text-command-success animate-pulse" />
      case 'waiting': return <Clock className="w-5 h-5 text-command-info" />
      case 'success': return <CheckCircle className="w-5 h-5 text-command-success" />
      case 'blocked': return <XCircle className="w-5 h-5 text-command-error" />
      case 'error': return <XCircle className="w-5 h-5 text-command-error" />
    }
  }

  const getModelBadge = () => {
    const colors = {
      haiku: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      sonnet: 'bg-green-500/20 text-green-300 border-green-500/30',
      opus: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
    }
    return `${colors[agent.model]} px-3 py-1 rounded-full text-sm font-mono border`
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-command-card border border-command-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-command-border">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              {getStatusIcon()}
              <div>
                <h2 className="text-2xl font-bold text-white">{agent.humanName}</h2>
                <p className="text-command-text/70 font-medium">{agent.role}</p>
              </div>
            </div>
            <div className={getModelBadge()}>{agent.model}</div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-command-bg/50 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-command-text/70" />
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* Agent Brief link + Supabase sync status */}
          {agent.planDocUrl && (
            <a
              href={agent.planDocUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-500/10 border border-violet-500/30 hover:bg-violet-500/20 transition-colors group"
            >
              <FileText className="w-5 h-5 text-violet-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-violet-300 group-hover:text-violet-200 transition-colors">
                  Open Agent Brief →
                </p>
                <p className="text-[11px] text-white/40 truncate">
                  KPIs · Mission · Feedback from Krish · Run Log
                </p>
                {agent.briefUpdatedAt && (
                  <p className="text-[10px] text-white/30 mt-0.5">
                    Brief synced: {formatRelativeTime(new Date(agent.briefUpdatedAt))}
                    {agent.briefChecksum && <span className="ml-2 font-mono text-white/20">{agent.briefChecksum.slice(0, 8)}</span>}
                  </p>
                )}
              </div>
              <ExternalLink className="w-4 h-4 text-violet-400/60 flex-shrink-0 group-hover:text-violet-300 transition-colors" />
            </a>
          )}

          {/* Brief content from Supabase (if available) */}
          {agent.briefContent && (
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-command-accent" />
                <h3 className="text-lg font-semibold text-white">Brief Summary</h3>
              </div>
              <div className="text-command-text/80 bg-command-bg/30 p-4 rounded-lg text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                {agent.briefContent.length > 2000
                  ? agent.briefContent.slice(0, 2000) + '...'
                  : agent.briefContent}
              </div>
            </div>
          )}

          {/* Personality & Mission */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-3">
              <User className="w-5 h-5 text-command-accent" />
              <h3 className="text-lg font-semibold text-white">Personality</h3>
            </div>
            <p className="text-command-text/80 bg-command-bg/30 p-4 rounded-lg italic">
              "{agent.personality}"
            </p>

            <div className="flex items-center space-x-2 mb-3">
              <Target className="w-5 h-5 text-command-accent" />
              <h3 className="text-lg font-semibold text-white">Mission</h3>
            </div>
            <p className="text-command-text bg-command-bg/30 p-4 rounded-lg leading-relaxed">
              {agent.mission}
            </p>
          </div>

          {/* Current Work */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <Brain className="w-5 h-5 text-command-info" />
              <h3 className="text-lg font-semibold text-white">Currently Working On</h3>
            </div>
            <div className="space-y-2">
              {agent.currentWork.map((work, i) => (
                <div key={i} className="flex items-start space-x-3 p-3 bg-command-bg/20 rounded-lg">
                  <div className="w-2 h-2 bg-command-info rounded-full mt-2 flex-shrink-0"></div>
                  <span className="text-command-text">{work}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Collaborations */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <Users className="w-5 h-5 text-command-success" />
              <h3 className="text-lg font-semibold text-white">Collaborations</h3>
            </div>
            <div className="space-y-2">
              {agent.collaborations.map((collab, i) => (
                <div key={i} className="flex items-start space-x-3 p-3 bg-command-bg/20 rounded-lg">
                  <div className="w-2 h-2 bg-command-success rounded-full mt-2 flex-shrink-0"></div>
                  <span className="text-command-text">{collab}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Next Actions */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <CheckSquare className="w-5 h-5 text-command-warning" />
              <h3 className="text-lg font-semibold text-white">Next Actions</h3>
            </div>
            <div className="space-y-2">
              {agent.nextActions.map((action, i) => (
                <div key={i} className="flex items-start space-x-3 p-3 bg-command-bg/20 rounded-lg">
                  <div className="w-2 h-2 bg-command-warning rounded-full mt-2 flex-shrink-0"></div>
                  <span className="text-command-text">{action}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Blockers (if any) */}
          {agent.blockers && agent.blockers.length > 0 && (
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <XCircle className="w-5 h-5 text-command-error" />
                <h3 className="text-lg font-semibold text-white">Blockers</h3>
              </div>
              <div className="space-y-2">
                {agent.blockers.map((blocker, i) => (
                  <div key={i} className="flex items-start space-x-3 p-3 bg-command-error/10 border border-command-error/30 rounded-lg">
                    <div className="w-2 h-2 bg-command-error rounded-full mt-2 flex-shrink-0"></div>
                    <span className="text-command-error/90">{blocker}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Schedule & Status */}
          <div className="border-t border-command-border pt-6 grid grid-cols-2 gap-6">
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <Clock className="w-4 h-4 text-command-text/70" />
                <span className="text-sm font-medium text-command-text/70">Schedule</span>
              </div>
              <p className="text-command-text font-mono text-sm">{agent.schedule}</p>
            </div>
            
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <MessageCircle className="w-4 h-4 text-command-text/70" />
                <span className="text-sm font-medium text-command-text/70">Timing</span>
              </div>
              <div className="text-sm text-command-text/80 space-y-1">
                <div>Last: {agent.lastRun ? formatRelativeTime(agent.lastRun) : 'Never'}</div>
                <div>Next: {formatNextRun(agent.nextRun)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}