import React, { useState } from 'react'
import { Boxes, ChevronRight, RefreshCw } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { Skeleton } from '../shared/Skeleton'
import { Working } from '../shared/Working'
import { LastUpdated } from '../shared/LastUpdated'
import { RefreshRail } from '../shared/RefreshRail'
import { useFleetFunnel, type FleetAppRow } from '../../hooks/useFleetFunnel'
import { useVentureRegistry, type VentureRow } from '../../hooks/useVentureRegistry'

/**
 * Fleet funnel — per builder app, the acquisition funnel (landed → signed →
 * activated → bought), attributed revenue, and emit-health, plus the top
 * campaigns by attributed purchases.
 *
 * Reads through the useFleetFunnel singleton (service-role /api/fleet-funnel,
 * never the anon client — revenue is sensitive; MINDMAKER_OS_ARCHITECTURE
 * §11.4). The app list and display names come from venture_registry via the
 * API and the registry hook — the old hardcoded literal kept columns for
 * three products retired from the control plane in July.
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export type FleetHealth = 'live' | 'stale' | 'never'

export function appHealth(row: FleetAppRow): FleetHealth {
  if (row.events_7d > 0) return 'live'
  if (!row.last_event_at) return 'never'
  const age = Date.now() - new Date(row.last_event_at).getTime()
  return Number.isFinite(age) && age > SEVEN_DAYS_MS ? 'stale' : 'live'
}

export const HEALTH_DOT: Record<FleetHealth, string> = {
  live: 'bg-status-active',
  stale: 'bg-status-needsYou',
  never: 'bg-white/20',
}

export const HEALTH_LABEL: Record<FleetHealth, string> = {
  live: 'Emitting',
  stale: 'Stale (>7d)',
  never: 'No events yet',
}

/** Registry display name for an attribution app key, else a plain capitalize. */
export function appDisplayLabel(app: string, ventures: VentureRow[]): string {
  const match = ventures.find(v => (v.app_key || '').toLowerCase() === app.toLowerCase())
  return match?.display_name || app.charAt(0).toUpperCase() + app.slice(1)
}

function dollars(cents: number): string {
  return `$${Math.round((cents || 0) / 100).toLocaleString('en-US')}`
}

export function FleetFunnelPanel() {
  const { funnel, error, loading, refresh } = useFleetFunnel()
  const { ventures } = useVentureRegistry()
  const [refreshing, setRefreshing] = useState(false)

  const reload = async () => {
    if (refreshing) return
    setRefreshing(true)
    try { await refresh() } finally { setRefreshing(false) }
  }

  const rows = funnel?.byApp || []
  const allZero =
    rows.length > 0 &&
    rows.every(r => !r.landed && !r.signed_up && !r.activated && !r.purchased && !r.gross_cents)

  return (
    // shrink-0: MobileShell's content area compresses shrinkable children when
    // the tab overflows — without it this card collapses to a sliver.
    <section data-testid="fleet-funnel-panel" className="relative shrink-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
      <RefreshRail active={refreshing} />
      <div className="flex flex-col gap-3.5 p-4">
        <header className="flex items-center gap-2">
          <Boxes size={14} className="text-cyan-400/80" aria-hidden />
          <Eyebrow>Fleet funnel</Eyebrow>
          <span className="ml-auto flex items-center gap-3">
            <LastUpdated
              date={funnel?.generated_at ? new Date(funnel.generated_at) : null}
              refreshing={refreshing}
            />
            <button
              type="button"
              onClick={reload}
              disabled={refreshing || loading}
              aria-label="Refresh fleet funnel"
              className="text-white/35 transition-colors hover:text-white/70 disabled:opacity-40"
            >
              {refreshing ? <Working size={12} /> : <RefreshCw size={12} aria-hidden />}
            </button>
          </span>
        </header>

        {loading && !funnel ? (
          <div className="flex flex-col gap-3" aria-busy="true" role="status" aria-label="Loading">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton w={8} h={8} r={4} />
                <Skeleton h={12} w={64} r={4} />
                <Skeleton h={12} w={112} r={4} className="ml-auto" />
              </div>
            ))}
          </div>
        ) : !funnel && error ? (
          <div className="py-4 text-center">
            <p className="text-body font-medium text-rose-300">Couldn't load the fleet funnel.</p>
            <p className="mt-1 text-label leading-snug text-white/45">{error}</p>
            <button
              type="button"
              onClick={reload}
              disabled={refreshing}
              className="mt-3 inline-flex items-center gap-1.5 text-label font-medium text-violet-300 transition-colors hover:text-violet-200 disabled:opacity-50"
            >
              {refreshing ? <Working size={12} /> : <RefreshCw size={12} aria-hidden />} Try again
            </button>
          </div>
        ) : (
          <>
            {allZero && (
              <p className="text-label text-white/35">
                No attributed traffic yet — the dots show which apps are wired to emit.
              </p>
            )}

            <div className="flex flex-col gap-3">
              {rows.map(row => {
                const health = appHealth(row)
                return (
                  <div key={row.app}>
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${HEALTH_DOT[health]}`}
                        title={HEALTH_LABEL[health]}
                      />
                      <span className="text-ui font-semibold text-white">
                        {appDisplayLabel(row.app, ventures)}
                      </span>
                      <span className="ml-auto flex items-baseline gap-2">
                        <span className="font-mono text-ui font-semibold tabular-nums text-emerald-300">
                          {dollars(row.gross_cents)}
                        </span>
                        {row.churns > 0 && (
                          <span className="text-micro tabular-nums text-rose-300/70">
                            {row.churns} churn{row.churns === 1 ? '' : 's'}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1 pl-[16px] text-micro tabular-nums text-white/55">
                      <FunnelStep label="landed" value={row.landed} />
                      <ChevronRight size={11} className="text-white/20" aria-hidden />
                      <FunnelStep label="signed" value={row.signed_up} />
                      <ChevronRight size={11} className="text-white/20" aria-hidden />
                      <FunnelStep label="active" value={row.activated} />
                      <ChevronRight size={11} className="text-white/20" aria-hidden />
                      <FunnelStep label="bought" value={row.purchased} highlight />
                      <span className="ml-auto text-micro text-white/25">
                        {row.events_24h}/24h · {row.events_7d}/7d
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {funnel && funnel.campaigns.length > 0 && (
              <div className="border-t border-white/[0.06] pt-3">
                <div className="pb-1.5"><Eyebrow>Top campaigns</Eyebrow></div>
                <div className="flex flex-col gap-1.5">
                  {funnel.campaigns.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-micro">
                      <span className="uppercase tracking-wide text-white/30">
                        {appDisplayLabel(c.app, ventures)}
                      </span>
                      <span className="truncate text-white/70">
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
      </div>
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
