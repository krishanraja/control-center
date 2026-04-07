import React from 'react'
import { Agent } from '../types'
import { formatRelativeTime, formatNextRun } from '../utils/time'
import { Clock, AlertCircle, CheckCircle, Loader2, XCircle, ChevronRight } from 'lucide-react'
import { useHaptics } from '../hooks/useHaptics'

interface Props {
  agent: Agent
  currentTime: Date
  onClick: () => void
}

const STATUS_CONFIG = {
  running: {
    dot: 'bg-emerald-400 shadow-emerald-400/60 animate-pulse',
    bar: 'from-emerald-500/20 to-transparent',
    border: 'border-emerald-500/20',
    badge: 'bg-emerald-500/10 text-emerald-400',
    label: 'Running',
    icon: (c: string) => <Loader2 className={`w-3.5 h-3.5 ${c} animate-spin`} />,
  },
  waiting: {
    dot: 'bg-blue-400',
    bar: 'from-blue-500/10 to-transparent',
    border: 'border-blue-500/10',
    badge: 'bg-blue-500/10 text-blue-400',
    label: 'Waiting',
    icon: (c: string) => <Clock className={`w-3.5 h-3.5 ${c}`} />,
  },
  success: {
    dot: 'bg-emerald-400',
    bar: 'from-emerald-500/15 to-transparent',
    border: 'border-emerald-500/15',
    badge: 'bg-emerald-500/10 text-emerald-400',
    label: 'Success',
    icon: (c: string) => <CheckCircle className={`w-3.5 h-3.5 ${c}`} />,
  },
  blocked: {
    dot: 'bg-red-400 shadow-red-400/60 animate-pulse',
    bar: 'from-red-500/15 to-transparent',
    border: 'border-red-500/20',
    badge: 'bg-red-500/10 text-red-400',
    label: 'Blocked',
    icon: (c: string) => <XCircle className={`w-3.5 h-3.5 ${c}`} />,
  },
  error: {
    dot: 'bg-red-400 shadow-red-400/60 animate-pulse',
    bar: 'from-red-500/15 to-transparent',
    border: 'border-red-500/20',
    badge: 'bg-red-500/10 text-red-400',
    label: 'Error',
    icon: (c: string) => <AlertCircle className={`w-3.5 h-3.5 ${c}`} />,
  },
}

const MODEL_COLORS: Record<string, string> = {
  haiku:  'bg-sky-500/10 text-sky-400',
  sonnet: 'bg-violet-500/10 text-violet-400',
  opus:   'bg-amber-500/10 text-amber-400',
}

const POD_ACCENT: Record<string, string> = {
  ops:     'text-slate-400',
  revenue: 'text-emerald-400',
  growth:  'text-violet-400',
}

export function AgentCard({ agent, currentTime, onClick }: Props) {
  const h = useHaptics()
  const s = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.waiting

  const handleClick = () => {
    h.tap()
    onClick()
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left relative overflow-hidden rounded-2xl border ${s.border} bg-white/[0.03] backdrop-blur-sm
        active:scale-[0.98] transition-all duration-200 hover:bg-white/[0.05]
        focus:outline-none focus:ring-2 focus:ring-violet-500/40`}
    >
      {/* Top gradient bar */}
      <div className={`absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r ${s.bar}`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Status dot */}
            <div className={`w-2.5 h-2.5 rounded-full shadow-sm flex-shrink-0 mt-0.5 ${s.dot}`} />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-bold text-white leading-none">{agent.humanName}</h3>
                <span className={`text-[9px] font-bold uppercase tracking-widest ${POD_ACCENT[agent.pod] ?? 'text-white/40'}`}>
                  {agent.pod}
                </span>
              </div>
              <p className="text-[12px] text-white/50 mt-0.5">{agent.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full font-mono ${MODEL_COLORS[agent.model] ?? 'bg-white/10 text-white/60'}`}>
              {agent.model}
            </span>
            <ChevronRight className="w-4 h-4 text-white/20" />
          </div>
        </div>

        {/* Personality tagline */}
        {agent.personality && (
          <p className="text-[11px] text-white/40 italic mb-3 leading-relaxed">"{agent.personality}"</p>
        )}

        {/* Work summary */}
        {agent.workSummary && (
          <div className="mb-3 px-3 py-2 bg-white/[0.03] rounded-xl border border-white/[0.06]">
            <p className="text-[12px] text-white/70 leading-relaxed">{agent.workSummary}</p>
          </div>
        )}

        {/* Blocker */}
        {agent.blockers && agent.blockers.length > 0 && (
          <div className="mb-3 px-3 py-2 bg-red-500/[0.08] rounded-xl border border-red-500/20">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Blocked</span>
            </div>
            <p className="text-[11px] text-red-300/80">{agent.blockers[0]}</p>
          </div>
        )}

        {/* KPI */}
        {agent.kpi && (
          <div className="mb-3 px-3 py-2 bg-violet-500/[0.06] rounded-xl border border-violet-500/15">
            <span className="text-[9px] font-bold text-violet-400 uppercase tracking-widest">April KPI</span>
            <p className="text-[12px] text-white/80 font-medium mt-0.5">{agent.kpi.target}</p>
            {agent.kpi.current && (
              <p className="text-[10px] text-white/40 mt-0.5">{agent.kpi.current}</p>
            )}
          </div>
        )}

        {/* Footer: timing */}
        <div className="flex justify-between text-[10px] text-white/30 pt-2 border-t border-white/[0.05]">
          <span>{agent.lastRun ? `Last: ${formatRelativeTime(agent.lastRun)}` : 'Never run'}</span>
          <span>Next: {formatNextRun(agent.nextRun)}</span>
        </div>
      </div>
    </button>
  )
}
