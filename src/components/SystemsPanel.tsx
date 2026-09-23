import React, { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, RefreshCw } from '@/lib/icons'
import { BoardSkeleton } from './shared/Skeleton'
import { Working } from './shared/Working'
import { SurfaceHeader } from './shared/SurfaceHeader'
import { AppFrame } from './shared/AppFrame'
import { Eyebrow } from './shared/Eyebrow'

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
  green:   { icon: CheckCircle2,  color: 'text-emerald-400', bg: 'bg-emerald-500/10',  border: 'border-emerald-500/20', label: 'Healthy' },
  amber:   { icon: AlertTriangle, color: 'text-amber-400',   bg: 'bg-amber-500/10',    border: 'border-amber-500/20',   label: 'Warning' },
  red:     { icon: XCircle,       color: 'text-red-400',     bg: 'bg-red-500/10',      border: 'border-red-500/20',     label: 'Down' },
  unknown: { icon: HelpCircle,    color: 'text-ink-faint',   bg: 'bg-white/[0.02]',    border: 'border-white/[0.06]',   label: 'Unchecked' },
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
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
      <Icon size={14} className={`flex-shrink-0 ${cfg.color}`} />
      <div className="flex-1 min-w-0">
        <span className="text-body font-medium text-ink">{service.name}</span>
        <p className="text-micro text-ink-muted">{service.note}</p>
      </div>
      <span className="text-micro text-ink-faint flex-shrink-0 font-mono">{timeAgo(service.last_checked)}</span>
    </div>
  )
}

function CategoryBlock({ category }: { category: Category }) {
  const counts = { green: 0, amber: 0, red: 0, unknown: 0 }
  category.services.forEach(s => counts[s.status]++)
  const cfg = STATUS_CONFIG[counts.red > 0 ? 'red' : counts.amber > 0 ? 'amber' : counts.unknown === category.services.length ? 'unknown' : 'green']

  // A category holding ONE service used to render as a bordered card, a header
  // naming the category, a "1 unchecked" count and then a row whose name was
  // the category name again — four pieces of chrome around one fact, eight
  // times over. Measured 2026-09-23: the board said "INGEST / 1 unk / ingest"
  // to tell the reader one thing. A single service is now just its row.
  if (category.services.length === 1) {
    return (
      <div className={`rounded-2xl border ${cfg.border} overflow-hidden`}>
        <ServiceRow service={category.services[0]} />
      </div>
    )
  }

  return (
    <div className={`rounded-2xl border ${cfg.border} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
        <Eyebrow>{category.label}</Eyebrow>
        <div className="flex items-center gap-3">
          {counts.red > 0     && <span className="text-micro text-red-400 font-semibold">{counts.red} down</span>}
          {counts.amber > 0   && <span className="text-micro text-amber-400 font-semibold">{counts.amber} warning</span>}
          {counts.green > 0   && <span className="text-micro text-emerald-400 font-semibold">{counts.green} healthy</span>}
          {counts.unknown > 0 && <span className="text-micro text-ink-muted font-semibold">{counts.unknown} unchecked</span>}
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
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    import('../lib/supabase').then(({ supabase }) => {
      supabase.from('system_health').select('*').then(({ data: rows, error: err }) => {
        if (err) { setError(err.message); setLoading(false); return }
        // Group by component category or build a flat list
        const categories: Category[] = []
        const catMap = new Map<string, Service[]>()
        for (const r of rows || []) {
          const details = typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {})
          const catName = details.category || r.component?.split('-')[0] || 'General'
          if (!catMap.has(catName)) catMap.set(catName, [])
          catMap.get(catName)!.push({
            id: r.id,
            name: details.name || r.component,
            url: details.url,
            status: r.status === 'healthy' ? 'green' : r.status === 'degraded' ? 'amber' : r.status === 'failing' ? 'red' : 'unknown',
            note: r.message || details.note || details.status || '',
            credits: details.credits ?? null,
            last_checked: r.last_check,
          })
        }
        catMap.forEach((services, label) => {
          categories.push({ id: label.toLowerCase().replace(/\s/g, '-'), label, services })
        })
        setData({ updated_at: new Date().toISOString(), updated_by: 'supabase', next_check: 'realtime', categories })
        setLoading(false)
        setLastRefreshed(new Date())
      })
    }).catch(e => { setError(e.message); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  // Triggers /api/refresh-health (which re-polls N8N and upserts to system_health),
  // then re-reads the table. Idempotent.
  const liveRefresh = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/refresh-health', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || `Refresh failed: ${res.status}`)
      }
    } catch (e: any) {
      setError(e.message || 'Refresh failed')
    } finally {
      setRefreshing(false)
      load()
    }
  }, [load])

  const allServices = data?.categories.flatMap(c => c.services) ?? []
  const downServices   = allServices.filter(s => s.status === 'red')
  const warnServices   = allServices.filter(s => s.status === 'amber')
  const greenCount     = allServices.filter(s => s.status === 'green').length
  const unknownCount   = allServices.filter(s => s.status === 'unknown').length

  const overallOk = downServices.length === 0 && warnServices.length === 0

  if (loading && !data) {
    return (
      <AppFrame header={<div className="pb-4"><SurfaceHeader title="Systems" description="Checking every connected service…" /></div>}>
        <BoardSkeleton lanes={2} cardsPerLane={4} hero={false} />
      </AppFrame>
    )
  }

  // The board scrolls inside the frame; the title and the health summary do
  // not. Without this the surface was laid out in full inside an
  // overflow-hidden shell and simply cut off: measured 2026-09-23 at
  // 1440x900, 225px of services ran past the bottom of the screen with no way
  // to reach them, and no probe but a clipping check could see it — nothing
  // scrolled, nothing overlapped, and the missing rows were not in the
  // screenshot either.
  return (
    <AppFrame
      header={<div className="space-y-4 pb-4">
      <SurfaceHeader
        title="Systems"
        description="All connected services, watched by Arlo."
        actions={<button
          onClick={liveRefresh}
          disabled={loading || refreshing}
          title="Re-poll N8N and update system_health"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.08] disabled:opacity-40 text-ink-muted hover:text-ink text-micro transition-colors"
        >
          {(loading || refreshing) ? <Working size={12} /> : <RefreshCw size={12} />}
          {refreshing ? 'Polling N8N…' : loading ? 'Reading services…' : lastRefreshed ? `Refreshed ${timeAgo(lastRefreshed.toISOString())}` : 'Refresh'}
        </button>}
      />

      {/* Summary bar */}
      <div className={`rounded-xl border px-4 py-3 ${overallOk ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : downServices.length > 0 ? 'border-red-500/20 bg-red-500/[0.04]' : 'border-amber-500/20 bg-amber-500/[0.04]'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${overallOk ? 'bg-emerald-400 shadow-emerald-400/60' : downServices.length > 0 ? 'bg-red-400 shadow-red-400/60 animate-pulse' : 'bg-amber-400 shadow-amber-400/60'} shadow-sm`} />
              <span className={`text-label font-bold ${overallOk ? 'text-emerald-400' : downServices.length > 0 ? 'text-red-400' : 'text-amber-400'}`}>
                {overallOk ? 'All systems nominal' : downServices.length > 0 ? `${downServices.length} service${downServices.length > 1 ? 's' : ''} down` : `${warnServices.length} warning${warnServices.length > 1 ? 's' : ''}`}
              </span>
            </div>
            {overallOk && (
              <p className="text-micro text-ink-muted pl-4">Nothing here needs you. Real failures page Telegram and land on Home.</p>
            )}
            {downServices.length > 0 && (
              <p className="text-micro text-red-300 pl-4">
                Down: {downServices.map(s => s.name).join(', ')}
              </p>
            )}
            {warnServices.length > 0 && (
              <p className="text-micro text-amber-300 pl-4">
                Warning: {warnServices.map(s => s.name).join(', ')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 text-micro flex-shrink-0 pt-0.5">
            {greenCount > 0    && <span className="text-emerald-400">{greenCount} healthy</span>}
            {warnServices.length > 0 && <span className="text-amber-400">{warnServices.length} warning</span>}
            {downServices.length > 0 && <span className="text-red-400">{downServices.length} down</span>}
            {unknownCount > 0  && <span className="text-ink-muted">{unknownCount} unchecked</span>}
          </div>
        </div>
      </div>

      {/* Meta */}
      {data && (
        <div className="flex items-center gap-2 text-micro text-ink-faint">
          <span>Read {timeAgo(data.updated_at)} from {data.updated_by}</span>
          {/* The one sanctioned character mark is the middle dot. A pipe is a
              text glyph used as chrome, which the icon rules do not allow. */}
          <span aria-hidden>·</span>
          <span>Next check {data.next_check}</span>
        </div>
      )}
      </div>}
    >
      <div className="space-y-5 pb-2">
      {error && <p className="text-label text-red-400">Failed to load: {error}</p>}

      {/* Grid */}
      {data && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {data.categories.map(cat => <CategoryBlock key={cat.id} category={cat} />)}
        </div>
      )}

      {/* Arlo note */}
      <div className="rounded-xl border border-accent/15 bg-accent/[0.04] px-4 py-3">
        <p className="text-micro text-violet-300/50 leading-relaxed">
          <strong className="text-violet-300/70">Arlo</strong> runs hourly health checks and a full sweep every Sunday 3AM UTC.
          Statuses update via the <code className="text-micro bg-white/[0.05] px-1 py-0.5 rounded">system_health</code> Supabase table.
          Red or critical warnings route to ops-bot immediately.
        </p>
      </div>
      </div>
    </AppFrame>
  )
}
