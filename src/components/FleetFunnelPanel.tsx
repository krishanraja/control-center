import React, { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Boxes, RefreshCw, ChevronRight } from 'lucide-react'

/**
 * Fleet Funnel — Intel-tab panel. Surfaces, per builder app, the acquisition
 * funnel (landed → signed_up → activated → purchased), attributed revenue, and
 * emit-health, plus the top campaigns by attributed purchases.
 *
 * Revenue is sensitive, so this reads ONLY through the service-role
 * `/api/fleet-funnel` route — never the anon Supabase client. See
 * docs/MINDMAKE_OS_ARCHITECTURE.md section 11.4.
 */

interface AppRow {
  app: string
  landed: number
  signed_up: number
  activated: number
  purchased: number
  gross_cents: number
  refunded_cents: number
  churns: number
  last_event_at: string | null
  events_24h: number
  events_7d: number
}

interface CampaignRow {
  app: string
  utm_source: string | null
  utm_campaign: string | null
  agent: string | null
  landed: number
  purchased: number
}

interface FunnelData {
  byApp: AppRow[]
  campaigns: CampaignRow[]
  generated_at?: string
}

type LoadState = 'loading' | 'ok' | 'error'

// Canonical fleet order + display names.
const APP_LABELS: Record<string, string> = {
  circle: 'Circle',
  pulse: 'Pulse',
  ctrl: 'CTRL',
  gutted: 'Gutted',
  merciless: 'Merciless',
  onalert: 'OnAlert',
}
const APP_ORDER = ['circle', 'pulse', 'ctrl', 'gutted', 'merciless', 'onalert']

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

type Health = 'live' | 'stale' | 'never'

function appHealth(row: AppRow): Health {
  if (row.events_7d > 0) return 'live'
  if (!row.last_event_at) return 'never'
  const age = Date.now() - new Date(row.last_event_at).getTime()
  return Number.isFinite(age) && age > SEVEN_DAYS_MS ? 'stale' : 'live'
}

const HEALTH_DOT: Record<Health, string> = {
  live: 'bg-emerald-400',
  stale: 'bg-amber-400',
  never: 'bg-white/20',
}
const HEALTH_LABEL: Record<Health, string> = {
  live: 'Emitting',
  stale: 'Stale (>7d)',
  never: 'No events yet',
}

function dollars(cents: number): string {
  return `$${Math.round((cents || 0) / 100).toLocaleString()}`
}

export function FleetFunnelPanel() {
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<FunnelData | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const r = await fetch('/api/fleet-funnel', { cache: 'no-store' })
      // Read the body once and parse defensively — the endpoint can return an
      // HTML error page (proxy/404/500) that is NOT JSON. Calling r.json()
      // blindly would surface a raw "Unexpected token '<'…" to the user.
      const raw = await r.text()
      let json: any = null
      try { json = raw ? JSON.parse(raw) : null } catch { json = null }
      if (!r.ok || json == null || json.ok === false) {
        throw new Error(
          json?.error ||
          (r.ok ? 'The service returned an unexpected response.' : `Service unavailable (HTTP ${r.status}).`),
        )
      }
      setData({
        byApp: Array.isArray(json.byApp) ? json.byApp : [],
        campaigns: Array.isArray(json.campaigns) ? json.campaigns : [],
        generated_at: json.generated_at,
      })
      setState('ok')
      setError(null)
    } catch (e: any) {
      // Never surface a raw parse/exception string. Map to a human reason.
      const m = String(e?.message || '')
      const friendly =
        /HTTP \d|unexpected response|unavailable/i.test(m) ? m
        : /failed to fetch|networkerror|load failed/i.test(m) ? 'Couldn’t reach the service — check your connection.'
        : 'Temporarily unavailable — try again shortly.'
      setError(friendly)
      setState('error')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Order apps canonically; fall back to whatever the API returned.
  const rows: AppRow[] = data
    ? APP_ORDER
        .map(app => data.byApp.find(r => r.app === app))
        .filter((r): r is AppRow => Boolean(r))
        .concat(data.byApp.filter(r => !APP_ORDER.includes(r.app)))
    : []

  const allZero =
    rows.length > 0 &&
    rows.every(r =>
      !r.landed && !r.signed_up && !r.activated && !r.purchased && !r.gross_cents,
    )

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <Boxes size={13} className="text-cyan-400" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Fleet Funnel
        </h2>
        <div className="ml-auto flex items-center gap-3">
          {data?.generated_at && state === 'ok' && (
            <span className="text-[10px] text-white/25">
              {formatDistanceToNow(new Date(data.generated_at), { addSuffix: true })}
            </span>
          )}
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing || state === 'loading'}
            title="Refresh"
            className="text-white/35 hover:text-white/70 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {state === 'loading' ? (
        <div className="divide-y divide-white/[0.04]">
          {APP_ORDER.map(app => (
            <div key={app} className="px-4 py-3 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-white/10" />
              <span className="h-3 w-16 rounded bg-white/[0.06]" />
              <span className="ml-auto h-3 w-28 rounded bg-white/[0.04]" />
            </div>
          ))}
        </div>
      ) : state === 'error' ? (
        <div className="p-6 text-center">
          <p className="text-[13px] text-rose-300 font-medium">Couldn't load fleet funnel.</p>
          {error && <p className="text-[11.5px] text-white/45 mt-1 leading-snug">{error}</p>}
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-violet-300 hover:text-violet-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Try again
          </button>
        </div>
      ) : (
        <>
          {allZero && (
            <div className="px-4 py-2.5 text-[11px] text-white/30 border-b border-white/[0.04]">
              No attributed traffic yet — emit-health below shows which apps are wired.
            </div>
          )}

          <div className="divide-y divide-white/[0.04]">
            {rows.map(row => {
              const health = appHealth(row)
              return (
                <div key={row.app} className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${HEALTH_DOT[health]}`}
                      title={HEALTH_LABEL[health]}
                    />
                    <span className="text-[13px] font-semibold text-white">
                      {APP_LABELS[row.app] || row.app}
                    </span>
                    <span className="ml-auto flex items-baseline gap-2">
                      <span className="text-[13px] font-semibold text-emerald-300 tabular-nums">
                        {dollars(row.gross_cents)}
                      </span>
                      {row.churns > 0 && (
                        <span className="text-[10px] text-rose-300/70 tabular-nums">
                          {row.churns} churn{row.churns === 1 ? '' : 's'}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-[11px] text-white/55 tabular-nums">
                    <FunnelStep label="landed" value={row.landed} />
                    <ChevronRight size={11} className="text-white/20" />
                    <FunnelStep label="signed" value={row.signed_up} />
                    <ChevronRight size={11} className="text-white/20" />
                    <FunnelStep label="active" value={row.activated} />
                    <ChevronRight size={11} className="text-white/20" />
                    <FunnelStep label="bought" value={row.purchased} highlight />
                    <span className="ml-auto text-[10px] text-white/25">
                      {row.events_24h}/24h · {row.events_7d}/7d
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {data && data.campaigns.length > 0 && (
            <div className="border-t border-white/[0.06]">
              <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Top campaigns
              </p>
              <div className="divide-y divide-white/[0.03]">
                {data.campaigns.map((c, i) => (
                  <div key={i} className="px-4 py-2 flex items-center gap-2 text-[11px]">
                    <span className="text-white/30 uppercase tracking-wide">
                      {APP_LABELS[c.app] || c.app}
                    </span>
                    <span className="text-white/70 truncate">
                      {c.utm_campaign || c.utm_source || '—'}
                    </span>
                    {c.agent && <span className="text-white/30">· {c.agent}</span>}
                    <span className="ml-auto tabular-nums text-white/50">
                      <span className="text-emerald-300">{c.purchased}</span>
                      <span className="text-white/25"> / {c.landed}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function FunnelStep({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`font-semibold ${highlight ? 'text-cyan-300' : 'text-white/80'}`}>{value}</span>
      <span className="text-white/30">{label}</span>
    </span>
  )
}
