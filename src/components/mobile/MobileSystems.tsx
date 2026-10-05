import React, { useCallback, useEffect, useState } from 'react'
import { MobileShell as MobileShellPrim, TabHeader,
  HeaderSubtitleSkeleton, FeedCard, FeedRow, EmptyState, MobileLoadingScreen } from './primitives'
import { DetailSheet } from './DetailSheet'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { supabase } from '../../lib/supabase'
import { Working } from '../shared/Working'
import { DoThisNextHero } from '../shared/DoThisNextHero'
import { systemsMove } from '../../lib/surfaceMoves'
import { useEngineHealth } from '../../hooks/useEngineHealth'
import { StudioRunners } from '../content-v2/StudioRunners'

interface Service {
  id: string
  name: string
  url?: string
  status: 'green' | 'amber' | 'red' | 'unknown'
  note: string
  credits?: number | null
  last_checked: string | null
  category: string
}

const STATUS_DOT: Record<Service['status'], string> = {
  green:   'bg-emerald-400',
  amber:   'bg-amber-400',
  red:     'bg-red-400',
  unknown: 'bg-white/30',
}

export function MobileSystems() {
  const h = useHaptics()
  const { toast } = useToast()
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The Studio's Windows runners come from the content engine's own health
  // route (system_health has no runner rows): which runner is active, which
  // is the standby.
  const engineHealth = useEngineHealth()
  const studioRunners = engineHealth.health?.runners ?? null

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.from('system_health').select('*')
    if (err) { setError(err.message); setLoading(false); return }
    const flat: Service[] = []
    for (const r of (data as any[]) || []) {
      const details = typeof r.details === 'string' ? safeJson(r.details) : (r.details || {})
      flat.push({
        id: r.id,
        name: details.name || r.component,
        url: details.url,
        status: r.status === 'healthy' ? 'green'
              : r.status === 'degraded' ? 'amber'
              : r.status === 'failing'  ? 'red'
              : 'unknown',
        note: r.message || details.note || details.status || '',
        credits: details.credits ?? null,
        last_checked: r.last_check,
        category: details.category || r.component?.split('-')[0] || 'General',
      })
    }
    setServices(flat)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const liveRefresh = useCallback(async () => {
    h.heavy()
    setRefreshing(true)
    setError(null)
    try {
      const r = await fetch('/api/refresh-health', { method: 'POST' })
      if (!r.ok) {
        h.error()
        const body = await r.json().catch(() => ({}))
        toast(body.error || `Refresh failed: ${r.status}`, 'error')
      } else {
        h.success()
        toast('Refreshed.', 'success')
      }
    } catch (e: any) {
      h.error()
      toast(e.message || 'Refresh failed', 'error')
    } finally {
      setRefreshing(false)
      load()
    }
  }, [h, toast, load])

  const down  = services.filter(s => s.status === 'red')
  const warn  = services.filter(s => s.status === 'amber')
  const ok    = services.filter(s => s.status === 'green')
  const unk   = services.filter(s => s.status === 'unknown')

  // Group services by category
  const byCategory: Record<string, Service[]> = {}
  for (const s of services) {
    if (!byCategory[s.category]) byCategory[s.category] = []
    byCategory[s.category].push(s)
  }

  const open = openId ? services.find(s => s.id === openId) ?? null : null
  const heroIssue = down[0] || warn[0] || null
  const move = systemsMove({ down, warning: warn, healthy: ok.length, unchecked: unk.length })

  if (loading && services.length === 0) {
    return <MobileLoadingScreen title="Systems" subtitle="Checking services…" />
  }

  return (
    <MobileShellPrim
      header={
        <TabHeader
          title="Systems"
          subtitle={loading ? <HeaderSubtitleSkeleton w={192} /> : `${services.length} services · monitored by Arlo`}
          trailing={
            <button
              onClick={liveRefresh}
              disabled={loading || refreshing}
              className="px-5 py-3 rounded-full bg-white/10 text-ink text-ui font-semibold active:scale-95 disabled:opacity-40 transition-transform"
            >
              {refreshing ? <Working size={11} /> : 'Refresh'}
            </button>
          }
        />
      }
    >
      {/* The same one move as the desk (src/lib/surfaceMoves.ts). It replaced
          a hero card that called a board of unchecked services "All systems
          healthy, 0 reporting green", over three pills printing zeros. */}
      {services.length > 0 && (
        <DoThisNextHero
          testId="systems-move"
          stackAction
          narrow
          busy={refreshing}
          descriptor={{
            headline: move.headline,
            sub: move.sub,
            actionLabel: move.kind === 'down' || move.kind === 'warning' ? 'Open' : move.actionLabel,
            tone: move.tone,
            clear: move.clear,
          }}
          onAct={heroIssue ? () => { h.select(); setOpenId(heroIssue.id) } : move.clear ? undefined : () => { void liveRefresh() }}
          why={move.why}
        />
      )}

      {studioRunners ? <StudioRunners runners={studioRunners} onSwitched={engineHealth.refresh} /> : null}

      {error && (
        <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-5 text-lede text-red-200">
          {error}
        </div>
      )}

      {services.length === 0 && !loading && !error && (
        <EmptyState label="No service health data yet." />
      )}

      {Object.entries(byCategory)
        .sort(([, a], [, b]) => {
          // Most-broken first
          const aBad = a.filter(s => s.status === 'red').length * 100 + a.filter(s => s.status === 'amber').length
          const bBad = b.filter(s => s.status === 'red').length * 100 + b.filter(s => s.status === 'amber').length
          return bBad - aBad
        })
        .map(([cat, list]) => (
          <FeedCard
            key={cat}
            title={`${cat} · ${list.length}`}
          >
            {list.map(s => (
              <FeedRow
                key={s.id}
                dotColor={STATUS_DOT[s.status]}
                title={s.name}
                detail={s.note || undefined}
                trailing={
                  s.last_checked && (
                    <span className="text-ui text-ink-faint tabular-nums">{humanAgo(s.last_checked)}</span>
                  )
                }
                onClick={() => { h.select(); setOpenId(s.id) }}
              />
            ))}
          </FeedCard>
        ))}

      <DetailSheet
        open={open != null}
        onClose={() => setOpenId(null)}
        eyebrow={open?.category}
        title={open?.name || ''}
        body={
          open
            ? [
                open.note || null,
                open.credits != null ? `Credits: ${open.credits}` : null,
                open.last_checked ? `Last check: ${humanAgo(open.last_checked)} ago` : null,
              ].filter(Boolean).join('\n\n')
            : undefined
        }
        status={open?.status === 'green' ? 'healthy' : open?.status === 'red' ? 'failing' : open?.status === 'amber' ? 'degraded' : 'unknown'}
        docUrl={open?.url || undefined}
        actions={[]}
      />
    </MobileShellPrim>
  )
}

function safeJson<T = any>(s: string, fallback?: T): T {
  try { return JSON.parse(s) } catch { return (fallback as T) }
}

function humanAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return `${Math.floor(ms / 60_000)}m`
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
