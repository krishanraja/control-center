import React from 'react'
import { Activity, Server, AlertTriangle, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useLiveStatus } from '../hooks/useLiveStatus'

export function SystemHealth() {
  const live = useLiveStatus(60_000)

  const hasErrors = live.workflows.errors > 0
  const overall = live.error ? 'offline'
    : live.loading ? 'syncing'
    : hasErrors ? 'warning'
    : 'healthy'

  const statusConfig = {
    healthy: { dot: 'bg-emerald-400 shadow-emerald-400/60', label: 'All Systems Go', text: 'text-emerald-400' },
    warning: { dot: 'bg-amber-400 shadow-amber-400/60', label: `${live.workflows.errors} workflow errors`, text: 'text-amber-400' },
    offline: { dot: 'bg-red-400 shadow-red-400/60', label: 'API unreachable', text: 'text-red-400' },
    syncing: { dot: 'bg-blue-400 animate-pulse', label: 'Syncing…', text: 'text-blue-400' },
  }[overall]

  const lastSync = live.fetched_at
    ? new Date(live.fetched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—'

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      {/* Live indicator */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${statusConfig.dot}`} />
          <span className={`text-[11px] font-bold uppercase tracking-widest ${statusConfig.text}`}>{statusConfig.label}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-white/30">
          {live.error ? <WifiOff className="w-3 h-3 text-red-400" /> : <Wifi className="w-3 h-3 text-white/30" />}
          <span>Live · {lastSync}</span>
          {live.loading && <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/[0.03] rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Activity className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {live.loading ? '—' : live.workflows.active}
            <span className="text-base text-white/30">/{live.loading ? '—' : live.workflows.total}</span>
          </div>
          <div className="text-[10px] text-white/40 mt-0.5">Active Workflows</div>
        </div>

        <div className={`rounded-xl p-3 text-center ${hasErrors ? 'bg-red-500/[0.08] border border-red-500/20' : 'bg-white/[0.03]'}`}>
          <div className="flex items-center justify-center gap-1 mb-1">
            <AlertTriangle className={`w-3.5 h-3.5 ${hasErrors ? 'text-red-400' : 'text-white/20'}`} />
          </div>
          <div className={`text-2xl font-bold ${hasErrors ? 'text-red-400' : 'text-white'}`}>
            {live.loading ? '—' : live.workflows.errors}
          </div>
          <div className="text-[10px] text-white/40 mt-0.5">Errors</div>
        </div>

        <div className="bg-white/[0.03] rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Server className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {live.loading ? '—' : live.workflows.running > 0 ? live.workflows.running : <span className="text-emerald-400">✓</span>}
          </div>
          <div className="text-[10px] text-white/40 mt-0.5">Running Now</div>
        </div>
      </div>

      {/* Error list if any */}
      {!live.loading && live.workflows.errors > 0 && (
        <div className="mt-3 pt-3 border-t border-white/[0.05]">
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2">Workflow Errors</p>
          {live.workflows.list.filter(w => w.lastStatus === 'error').map(w => (
            <div key={w.id} className="flex items-center gap-2 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
              <span className="text-[11px] text-red-300">{w.name}</span>
              {w.lastRun && (
                <span className="text-[10px] text-white/30 ml-auto">
                  {new Date(w.lastRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* API error */}
      {live.error && (
        <div className="mt-3 pt-3 border-t border-white/[0.05]">
          <p className="text-[11px] text-red-400">Could not reach status API: {live.error}</p>
        </div>
      )}
    </div>
  )
}
