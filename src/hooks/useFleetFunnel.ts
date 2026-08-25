import { useEffect, useState } from 'react'

/**
 * Single canonical reader of GET /api/fleet-funnel — the service-role rollup
 * of acquisition, revenue and emit-health per builder app. Revenue is
 * sensitive, so this never touches the anon Supabase client; see
 * docs/MINDMAKER_OS_ARCHITECTURE.md section 11.4.
 *
 * One fetch for every consumer (the KPI band's funnel tile, its sheet, and
 * the Fleet funnel section), the useSpend singleton shape without a poll:
 * attribution moves on human timescales, so a mount-time read plus explicit
 * refresh is enough.
 */
export interface FleetAppRow {
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
  // 7-day funnel window (warehouse migration 0003). Coerced defensively so an
  // older deploy of the API degrades to zeros, not NaN.
  landed_7d: number
  purchased_7d: number
}

export interface FleetCampaignRow {
  app: string
  utm_source: string | null
  utm_campaign: string | null
  agent: string | null
  landed: number
  purchased: number
}

export interface FleetFunnel {
  byApp: FleetAppRow[]
  campaigns: FleetCampaignRow[]
  generated_at?: string
}

let cache: FleetFunnel | null = null
let errorCache: string | null = null
let loaded = false
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify() { for (const l of listeners) l() }

const num = (v: unknown): number => Number(v) || 0

async function fetchFunnel(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
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
      cache = {
        byApp: (Array.isArray(json.byApp) ? json.byApp : []).map((a: any): FleetAppRow => ({
          app: String(a.app || ''),
          landed: num(a.landed),
          signed_up: num(a.signed_up),
          activated: num(a.activated),
          purchased: num(a.purchased),
          gross_cents: num(a.gross_cents),
          refunded_cents: num(a.refunded_cents),
          churns: num(a.churns),
          last_event_at: a.last_event_at ?? null,
          events_24h: num(a.events_24h),
          events_7d: num(a.events_7d),
          landed_7d: num(a.landed_7d),
          purchased_7d: num(a.purchased_7d),
        })),
        campaigns: Array.isArray(json.campaigns) ? json.campaigns : [],
        generated_at: json.generated_at,
      }
      errorCache = null
    } catch (e: any) {
      // Never surface a raw parse/exception string. Map to a human reason,
      // and keep the last good value — a failed poll is not an empty fleet.
      const m = String(e?.message || '')
      errorCache =
        /HTTP \d|unexpected response|unavailable/i.test(m) ? m
        : /failed to fetch|networkerror|load failed/i.test(m) ? 'Couldn’t reach the service — check your connection.'
        : 'Temporarily unavailable — try again shortly.'
    } finally {
      loaded = true
      inflight = null
      notify()
    }
  })()
  return inflight
}

export function useFleetFunnel() {
  const [, setVersion] = useState(0)

  useEffect(() => {
    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)
    if (!loaded && !inflight) fetchFunnel()
    return () => { listeners.delete(listener) }
  }, [])

  return {
    funnel: cache,
    error: errorCache,
    loading: !loaded,
    refresh: () => fetchFunnel(),
  }
}
