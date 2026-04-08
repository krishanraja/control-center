import React, { useState, useEffect } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, RefreshCw, ExternalLink } from 'lucide-react'

interface Service {
  id: string
  name: string
  url?: string
  status: 'green' | 'amber' | 'red' | 'unknown'
  note: string
  credits?: number | null
  last_checked: string | null
}

interface Category {
  id: string
  label: string
  services: Service[]
}

interface SystemsData {
  updated_at: string
  updated_by: string
  next_check: string
  categories: Category[]
}

const STATUS_CONFIG = {
  green:   { icon: CheckCircle2,  color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', dot: 'bg-emerald-400',  label: 'Healthy' },
  amber:   { icon: AlertTriangle, color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   dot: 'bg-amber-400',    label: 'Warning' },
  red:     { icon: XCircle,       color: 'text-red-400',     bg: 'bg-red-500/10',      border: 'border-red-500/20',     dot: 'bg-red-400',      label: 'Down' },
  unknown: { icon: HelpCircle,    color: 'text-white/25',    bg: 'bg-white/[0.02]',    border: 'border-white/[0.06]',   dot: 'bg-white/20',     label: 'Unchecked' },
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 1) return `${Math.floor(diff / 60000)}m ago`
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function ServiceRow({ service }: { service: Service }) {
  const cfg = STATUS_CONFIG[service.status]
  const Icon = cfg.icon
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors`}>
      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${cfg.color}`} strokeWidth={2} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-white/90">{service.name}</span>
          {service.url && (
            <a href={service.url} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100">
              <ExternalLink className="w-3 h-3 text-white/30" />
            </a>
          )}
        </div>
        <p className="text-[11px] text-white/35 truncate">{service.note}</p>
      </div>
      <span className="text-[10px] text-white/20 flex-shrink-0 font-mono">{timeAgo(service.last_checked)}</span>
    </div>
  )
}

function CategoryBlock({ category }: { category: Category }) {
  const counts = { green: 0, amber: 0, red: 0, unknown: 0 }
  category.services.forEach(s => counts[s.status]++)

  const overallStatus: Service['status'] = counts.red > 0 ? 'red' : counts.amber > 0 ? 'amber' : counts.unknown === category.services.length ? 'unknown' : 'green'
  const cfg = STATUS_CONFIG[overallStatus]

  return (
    <div className={`rounded-2xl border ${cfg.border} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">{category.label}</p>
        <div className="flex items-center gap-3">
          {counts.red > 0    && <span className="text-[10px] text-red-400 font-semibold">{counts.red} down</span>}
          {counts.amber > 0  && <span className="text-[10px] text-amber-400 font-semibold">{counts.amber} warn</span>}
          {counts.green > 0  && <span className="text-[10px] text-emerald-400 font-semibold">{counts.green} ok</span>}
          {counts.unknown > 0 && <span className="text-[10px] text-white/25 font-semibold">{counts.unknown} unk</span>}
        </div>
      </div>
      <div className="divide-y divide-white/[0.03]">
        {category.services.map(s => <ServiceRow key={s.id} service={s} />)}
      </div>
    </div>
  )
}

export function SystemsPanel() {
  const [data, setData] = useState<SystemsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetch(`/data/systems-status.json?t=${Date.now()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const allServices = data?.categories.flatMap(c => c.services) ?? []
  const redCount    = allServices.filter(s => s.status === 'red').length
  const amberCount  = allServices.filter(s => s.status === 'amber').length
  const greenCount  = allServices.filter(s => s.status === 'green').length
  const unknownCount = allServices.filter(s => s.status === 'unknown').length

  const overallOk = redCount === 0 && amberCount === 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-white">Systems</h1>
          <p className="text-[13px] text-white/30 mt-0.5">All connected services · Monitored by Arlo</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-white/40 hover:text-white/60 text-[11px] transition-colors">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary bar */}
      <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${overallOk ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : redCount > 0 ? 'border-red-500/20 bg-red-500/[0.04]' : 'border-amber-500/20 bg-amber-500/[0.04]'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full shadow-sm ${overallOk ? 'bg-emerald-400 shadow-emerald-400/60' : redCount > 0 ? 'bg-red-400 shadow-red-400/60 animate-pulse' : 'bg-amber-400 shadow-amber-400/60'}`} />
          <span className={`text-[12px] font-bold ${overallOk ? 'text-emerald-400' : redCount > 0 ? 'text-red-400' : 'text-amber-400'}`}>
            {overallOk ? 'All systems nominal' : redCount > 0 ? `${redCount} service${redCount > 1 ? 's' : ''} down` : `${amberCount} warning${amberCount > 1 ? 's' : ''}`}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          {greenCount > 0   && <span className="text-emerald-400">{greenCount} healthy</span>}
          {amberCount > 0   && <span className="text-amber-400">{amberCount} warning</span>}
          {redCount > 0     && <span className="text-red-400">{redCount} down</span>}
          {unknownCount > 0 && <span className="text-white/25">{unknownCount} unchecked</span>}
        </div>
      </div>

      {/* Meta */}
      {data && (
        <div className="flex items-center gap-4 text-[10px] text-white/25">
          <span>Last sync: {timeAgo(data.updated_at)} by {data.updated_by}</span>
          <span>·</span>
          <span>Next: {data.next_check}</span>
        </div>
      )}

      {error && <p className="text-[12px] text-red-400">Failed to load: {error}</p>}

      {/* Grid */}
      {data && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {data.categories.map(cat => <CategoryBlock key={cat.id} category={cat} />)}
        </div>
      )}

      {/* Arlo note */}
      <div className="rounded-xl border border-violet-500/10 bg-violet-500/[0.03] px-4 py-3">
        <p className="text-[11px] text-violet-300/50 leading-relaxed">
          <strong className="text-violet-300/70">Arlo</strong> runs hourly health checks + a full sweep every Sunday 3AM UTC.
          Statuses update automatically via <code className="text-[10px] bg-white/[0.05] px-1 py-0.5 rounded">public/data/systems-status.json</code>.
          Alerts route to ops-bot on any red or critical warning.
        </p>
      </div>
    </div>
  )
}
