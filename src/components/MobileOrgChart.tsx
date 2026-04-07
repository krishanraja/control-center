import React, { useState } from 'react'
import { Agent } from '../types'
import { Crown, ChevronDown, ChevronUp, Users, Target, Zap, Bell, Heart } from 'lucide-react'
import { useHaptics } from '../hooks/useHaptics'

interface Props {
  agents: Agent[]
}

const POD_CONFIG = {
  ops: {
    label: 'Ops Pod',
    icon: <Zap className="w-4 h-4" />,
    color: 'border-slate-500/30 bg-slate-500/5',
    textColor: 'text-slate-400',
    agents: ['vera-daily', 'tools-agent', 'weekly-synthesis']
  },
  revenue: {
    label: 'Revenue Pod',
    icon: <Target className="w-4 h-4" />,
    color: 'border-emerald-500/30 bg-emerald-500/5',
    textColor: 'text-emerald-400',
    agents: ['revenue-agent', 'product-agent']
  },
  growth: {
    label: 'Growth Pod',
    icon: <Users className="w-4 h-4" />,
    color: 'border-violet-500/30 bg-violet-500/5',
    textColor: 'text-violet-400',
    agents: ['content-agent', 'bd-agent', 'enterprise-gigs', 'visibility-agent', 'marketing-agent']
  }
}

export function MobileOrgChart({ agents }: Props) {
  const [expandedPods, setExpandedPods] = useState<Set<string>>(new Set(['ops', 'revenue', 'growth']))
  const h = useHaptics()
  
  const agatha = agents.find(a => a.id === 'agatha')
  const finno = { name: 'Finno', role: 'Personal Layer', status: 'personal' }
  const iris = { name: 'Iris', role: 'Ops-bot · Comms', status: 'system' }
  
  const togglePod = (podId: string) => {
    h.select()
    const newExpanded = new Set(expandedPods)
    if (newExpanded.has(podId)) {
      newExpanded.delete(podId)
    } else {
      newExpanded.add(podId)
    }
    setExpandedPods(newExpanded)
  }
  
  return (
    <div className="space-y-4">
      
      {/* Leadership row */}
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Crown className="w-4 h-4 text-amber-400" />
          <h3 className="font-bold text-white">Leadership</h3>
        </div>
        
        <div className="grid grid-cols-1 gap-3">
          {/* Krish */}
          <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl">
            <div className="w-3 h-3 rounded-full bg-amber-400 shadow-lg shadow-amber-400/40"></div>
            <div>
              <div className="font-bold text-white">Krish Raja</div>
              <div className="text-xs text-amber-300">Founder & CEO</div>
            </div>
          </div>
          
          {/* Finno + Agatha row */}
          <div className="grid grid-cols-2 gap-2">
            {/* Finno */}
            <div className="flex items-center gap-2 p-2.5 bg-pink-500/5 border border-pink-500/20 rounded-lg">
              <Heart className="w-3 h-3 text-pink-400" />
              <div>
                <div className="text-sm font-semibold text-pink-300">{finno.name}</div>
                <div className="text-[10px] text-pink-400/70">{finno.role}</div>
              </div>
            </div>
            
            {/* Agatha */}
            {agatha && (
              <div className="flex items-center gap-2 p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
                <div>
                  <div className="text-sm font-semibold text-white">{agatha.humanName}</div>
                  <div className="text-[10px] text-emerald-300">COO</div>
                </div>
              </div>
            )}
          </div>
          
          {/* Iris */}
          <div className="flex items-center gap-3 p-2.5 bg-sky-500/5 border border-sky-500/20 rounded-lg">
            <Bell className="w-3 h-3 text-sky-400" />
            <div>
              <div className="text-sm font-semibold text-sky-300">{iris.name}</div>
              <div className="text-[10px] text-sky-400/70">{iris.role}</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Pods */}
      {Object.entries(POD_CONFIG).map(([podId, config]) => {
        const podAgents = agents.filter(a => config.agents.includes(a.id))
        const isExpanded = expandedPods.has(podId)
        
        return (
          <div key={podId} className={`border backdrop-blur-sm rounded-2xl overflow-hidden ${config.color}`}>
            
            {/* Pod header */}
            <button
              onClick={() => togglePod(podId)}
              className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={config.textColor}>{config.icon}</div>
                <div>
                  <h3 className="font-bold text-white text-left">{config.label}</h3>
                  <p className="text-xs text-white/40">{podAgents.length} agents</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1">
                  {podAgents.slice(0, 3).map((agent, i) => (
                    <div
                      key={i}
                      className={`w-6 h-6 rounded-full border border-white/20 flex items-center justify-center text-[10px] font-bold ${
                        agent.status === 'running' || agent.status === 'success' 
                          ? 'bg-emerald-500/20 text-emerald-400' 
                          : agent.status === 'blocked' || agent.status === 'error'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}
                    >
                      {agent.humanName[0]}
                    </div>
                  ))}
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
              </div>
            </button>
            
            {/* Pod agents */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-2">
                {podAgents.map(agent => (
                  <div key={agent.id} className="flex items-center gap-3 p-3 bg-white/[0.04] border border-white/[0.06] rounded-xl">
                    <div className={`w-2 h-2 rounded-full ${
                      agent.status === 'running' || agent.status === 'success' 
                        ? 'bg-emerald-400' 
                        : agent.status === 'blocked' || agent.status === 'error'
                        ? 'bg-red-400'
                        : 'bg-blue-400'
                    }`}></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">{agent.humanName}</div>
                      <div className="text-xs text-white/50 truncate">{agent.role}</div>
                    </div>
                    <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      agent.status === 'running' ? 'bg-emerald-500/10 text-emerald-400'
                      : agent.status === 'success' ? 'bg-emerald-500/10 text-emerald-400'
                      : agent.status === 'blocked' ? 'bg-red-500/10 text-red-400'
                      : agent.status === 'error' ? 'bg-red-500/10 text-red-400'
                      : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {agent.status}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}