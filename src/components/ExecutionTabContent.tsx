import React, { useEffect, useState } from 'react'
import { Server, ShieldCheck, PlayCircle, AlertCircle, Clock } from 'lucide-react'

interface EngineState {
  id: string
  name: string
  domain: string
  cron: string
  n8n_workflow: string
  infra_status: 'green' | 'amber' | 'red'
  qa_status: 'green' | 'amber' | 'red'
  infra_note: string
  qa_note: string
  state: string
  next_run: string
}

export function ExecutionTabContent() {
  const [engines, setEngines] = useState<EngineState[]>([])
  const [lastUpdate, setLastUpdate] = useState<string>('')

  useEffect(() => {
    fetch('/data/execution-state.json', { cache: 'no-cache' })
      .then(r => r.json())
      .then(d => {
        // Defensively normalise each engine so missing fields never crash the render
        const raw: unknown[] = Array.isArray(d?.engines) ? d.engines : []
        const safe: EngineState[] = raw.map((e: unknown) => {
          const eng = (e ?? {}) as Record<string, unknown>
          return {
            id:            String(eng.id   ?? eng.name ?? 'unknown'),
            name:          String(eng.name ?? 'Unknown'),
            domain:        String(eng.domain ?? eng.data_source ?? '—'),
            cron:          String(eng.cron  ?? eng.last_sync   ?? '—'),
            n8n_workflow:  String(eng.n8n_workflow ?? eng.webhook_endpoint ?? 'None'),
            infra_status:  (['green','amber','red'].includes(String(eng.infra_status)) ? eng.infra_status : (eng.status === 'operational' || eng.status === 'healthy' ? 'green' : eng.status === 'error' ? 'red' : 'amber')) as 'green'|'amber'|'red',
            qa_status:     (['green','amber','red'].includes(String(eng.qa_status)) ? eng.qa_status : 'amber') as 'green'|'amber'|'red',
            infra_note:    String(eng.infra_note ?? eng.note ?? ''),
            qa_note:       String(eng.qa_note ?? ''),
            state:         String(eng.state ?? (eng.status === 'operational' ? 'Running' : eng.status ?? 'Unknown')),
            next_run:      String(eng.next_run ?? eng.next_check ?? '—'),
          }
        })
        setEngines(safe)
        setLastUpdate(d?.updated_at ? new Date(String(d.updated_at)).toLocaleString() : '—')
      })
      .catch(e => console.error('Failed to load execution state:', e))
  }, [])

  const getStatusColor = (status: string) => {
    if (status === 'green') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    if (status === 'amber') return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    if (status === 'red') return 'bg-rose-500/20 text-rose-400 border-rose-500/30'
    return 'bg-white/10 text-white/50 border-white/10'
  }

  const getStateColor = (state: string) => {
    if (state.toLowerCase().includes('running')) return 'text-emerald-400'
    if (state.toLowerCase().includes('error')) return 'text-rose-400'
    if (state.toLowerCase().includes('awaiting')) return 'text-amber-400'
    return 'text-white/60'
  }

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto pb-24">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-semibold text-white/90">Execution Engine</h2>
          <p className="text-sm text-white/50 mt-1">Live telemetry for all agents, crons, and N8N workflows.</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-white/40 font-mono">Last Sync: {lastUpdate || 'Loading...'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {/* Header Row */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 border-b border-white/[0.05] text-[11px] font-semibold text-white/40 uppercase tracking-wider">
          <div className="col-span-3">Agent / Domain</div>
          <div className="col-span-2">Engine</div>
          <div className="col-span-2 text-center">Infra (Arlo)</div>
          <div className="col-span-2 text-center">Quality (Vera)</div>
          <div className="col-span-3 text-right">State & Next Action</div>
        </div>

        {engines.map(e => (
          <div key={e.id} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-5 md:py-4 md:px-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center hover:bg-white/[0.03] transition-colors">
            
            {/* Identity */}
            <div className="col-span-1 md:col-span-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
                <span className="text-[14px] font-bold text-violet-300">{e.name.charAt(0)}</span>
              </div>
              <div>
                <p className="text-[14px] font-medium text-white/90">{e.name}</p>
                <p className="text-[12px] text-white/50">{e.domain}</p>
              </div>
            </div>

            {/* Machinery */}
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-1.5 text-[12px] text-white/70 mb-1">
                <Clock className="w-3.5 h-3.5 text-white/40" />
                {e.cron}
              </div>
              <div className="flex items-center gap-1.5 text-[12px] text-white/50">
                <Server className="w-3.5 h-3.5 text-white/40" />
                {e.n8n_workflow !== 'None' ? e.n8n_workflow : 'OpenClaw Native'}
              </div>
            </div>

            {/* Infra Health */}
            <div className="col-span-1 md:col-span-2 flex flex-col md:items-center">
              <span className="md:hidden text-[11px] font-semibold text-white/40 uppercase mb-1">Infra Health</span>
              <div className={`px-2.5 py-1 rounded-md border text-[11px] font-medium flex items-center gap-1.5 ${getStatusColor(e.infra_status)}`}>
                <Server className="w-3 h-3" />
                {e.infra_status.toUpperCase()}
              </div>
              <p className="text-[11px] text-white/40 mt-1.5 text-left md:text-center max-w-[140px] truncate" title={e.infra_note}>{e.infra_note}</p>
            </div>

            {/* Quality Health */}
            <div className="col-span-1 md:col-span-2 flex flex-col md:items-center">
              <span className="md:hidden text-[11px] font-semibold text-white/40 uppercase mb-1">Quality Health</span>
              <div className={`px-2.5 py-1 rounded-md border text-[11px] font-medium flex items-center gap-1.5 ${getStatusColor(e.qa_status)}`}>
                <ShieldCheck className="w-3 h-3" />
                {e.qa_status.toUpperCase()}
              </div>
              <p className="text-[11px] text-white/40 mt-1.5 text-left md:text-center max-w-[140px] truncate" title={e.qa_note}>{e.qa_note}</p>
            </div>

            {/* State & Next */}
            <div className="col-span-1 md:col-span-3 flex flex-col md:items-end mt-2 md:mt-0 pt-3 md:pt-0 border-t border-white/[0.05] md:border-t-0">
              <div className="flex items-center gap-2">
                {e.state === 'Running' && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                {e.state === 'Errored' && <div className="w-2 h-2 rounded-full bg-rose-500" />}
                <p className={`text-[13px] font-medium ${getStateColor(e.state)}`}>{e.state}</p>
              </div>
              <p className="text-[12px] text-white/40 mt-1 flex items-center gap-1.5">
                <PlayCircle className="w-3 h-3" />
                {e.next_run}
              </p>
            </div>

          </div>
        ))}
      </div>
    </div>
  )
}
