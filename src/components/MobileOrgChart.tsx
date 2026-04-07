import React, { useState } from 'react'
import { Agent } from '../types'
import { Crown, Bell, Heart, ChevronDown, ChevronUp } from 'lucide-react'
import { useHaptics } from '../hooks/useHaptics'

interface Props { agents: Agent[] }

const STATUS_DOT: Record<string, string> = {
  running: 'bg-emerald-400 shadow-emerald-400/60',
  success: 'bg-emerald-400',
  waiting: 'bg-blue-400',
  blocked: 'bg-red-400 shadow-red-400/60',
  error:   'bg-red-400 shadow-red-400/60',
}

const POD_STYLE: Record<string, {border:string; glow:string; label:string; accent:string; ids:string[]}> = {
  ops: {
    border: 'border-slate-500/25',
    glow:   'from-slate-500/8 to-transparent',
    label:  'Ops Pod',
    accent: 'text-slate-300',
    ids:    ['vera-daily','weekly-synthesis','tools-agent'],
  },
  revenue: {
    border: 'border-emerald-500/25',
    glow:   'from-emerald-500/8 to-transparent',
    label:  'Revenue Pod',
    accent: 'text-emerald-300',
    ids:    ['revenue-agent','product-agent'],
  },
  growth: {
    border: 'border-violet-500/25',
    glow:   'from-violet-500/8 to-transparent',
    label:  'Growth Pod',
    accent: 'text-violet-300',
    ids:    ['content-agent','bd-agent','enterprise-gigs','visibility-agent','marketing-agent'],
  },
}

export function MobileOrgChart({ agents }: Props) {
  const h = useHaptics()
  const [openPods, setOpenPods] = useState<Set<string>>(new Set(['ops','revenue','growth']))

  const toggle = (id: string) => { h.select(); setOpenPods(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const byId = (id: string) => agents.find(a => a.id === id)

  return (
    <div className="space-y-3">

      {/* ── Krish ── */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-4">
        <div className="absolute top-0 right-0 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl -translate-y-6 translate-x-6 pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-amber-400/70 uppercase tracking-widest">Founder & CEO</span>
            </div>
            <p className="text-xl font-bold text-white">Krish Raja</p>
          </div>
          {/* Finno badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-pink-500/10 border border-pink-500/20">
            <Heart className="w-3 h-3 text-pink-400" />
            <div>
              <p className="text-[11px] font-bold text-pink-300 leading-none">Finno</p>
              <p className="text-[9px] text-pink-400/60 leading-none mt-0.5">personal</p>
            </div>
          </div>
        </div>
      </div>

      {/* Connector line */}
      <div className="flex justify-center">
        <div className="w-px h-5 bg-gradient-to-b from-white/20 to-white/5" />
      </div>

      {/* ── Agatha + Iris row ── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Agatha */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/8 to-transparent p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/60 flex-shrink-0" />
            <span className="text-[9px] font-bold text-emerald-400/70 uppercase tracking-widest">COO</span>
          </div>
          <p className="text-base font-bold text-white">Agatha</p>
          <p className="text-[11px] text-white/50">Chief Operating Officer</p>
        </div>

        {/* Iris */}
        <div className="relative overflow-hidden rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-500/8 to-transparent p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-3 h-3 text-sky-400 flex-shrink-0" />
            <span className="text-[9px] font-bold text-sky-400/70 uppercase tracking-widest">Ops-bot</span>
          </div>
          <p className="text-base font-bold text-sky-300">Iris</p>
          <p className="text-[11px] text-sky-400/60">All comms & alerts</p>
        </div>
      </div>

      {/* Connector */}
      <div className="flex justify-center">
        <div className="w-px h-5 bg-gradient-to-b from-white/20 to-white/5" />
      </div>

      {/* ── Pods ── */}
      {Object.entries(POD_STYLE).map(([podId, cfg]) => {
        const podAgents = cfg.ids.map(byId).filter(Boolean) as Agent[]
        const isOpen = openPods.has(podId)
        const blockedCount = podAgents.filter(a => a.status === 'blocked' || a.status === 'error').length

        return (
          <div key={podId} className={`rounded-2xl border overflow-hidden ${cfg.border}`}>
            {/* Pod header */}
            <button
              onClick={() => toggle(podId)}
              className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-white/[0.03] to-transparent active:bg-white/[0.05]"
            >
              {/* Avatar row */}
              <div className="flex -space-x-2 flex-shrink-0">
                {podAgents.slice(0, 4).map((a, i) => (
                  <div key={i} className={`w-7 h-7 rounded-full border-2 border-[#08080e] flex items-center justify-center text-[11px] font-bold ${
                    a.status === 'blocked' || a.status === 'error'
                      ? 'bg-red-500/20 text-red-300'
                      : a.status === 'running' || a.status === 'success'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-blue-500/20 text-blue-300'
                  }`}>
                    {a.humanName[0]}
                  </div>
                ))}
                {podAgents.length > 4 && (
                  <div className="w-7 h-7 rounded-full border-2 border-[#08080e] bg-white/10 flex items-center justify-center text-[10px] text-white/50 font-bold">
                    +{podAgents.length - 4}
                  </div>
                )}
              </div>

              <div className="flex-1 text-left">
                <p className={`text-sm font-bold ${cfg.accent}`}>{cfg.label}</p>
                <p className="text-[11px] text-white/40">{podAgents.length} agents{blockedCount > 0 ? ` · ${blockedCount} blocked` : ''}</p>
              </div>

              {blockedCount > 0 && (
                <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-red-400">{blockedCount}</span>
                </div>
              )}
              {isOpen ? <ChevronUp className="w-4 h-4 text-white/30 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0" />}
            </button>

            {/* Agent rows */}
            {isOpen && (
              <div className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
                {podAgents.map(agent => (
                  <div key={agent.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-2 h-2 rounded-full shadow-sm flex-shrink-0 ${STATUS_DOT[agent.status] ?? 'bg-white/40'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{agent.humanName}</p>
                      <p className="text-[11px] text-white/40 truncate">{agent.role}</p>
                    </div>
                    <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      agent.status === 'running' || agent.status === 'success' ? 'bg-emerald-500/10 text-emerald-400'
                      : agent.status === 'blocked' || agent.status === 'error' ? 'bg-red-500/10 text-red-400'
                      : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {agent.schedule?.split(' ')[0] ?? agent.status}
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
