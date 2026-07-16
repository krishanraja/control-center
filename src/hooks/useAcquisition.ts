import { useCallback, useEffect, useState } from 'react'

/**
 * Growth-tab data hook. Fetches the per-lane acquisition rollup through the
 * service-role `/api/acquisition/overview` route (the sends ledger carries
 * PII + rendered bodies, so it is never read via the anon client) and shares
 * one module-level cache between the desktop and mobile surfaces.
 */

export interface FunnelWeekRow {
  lane: string
  week: string
  captures: number
  paid_added: number
  mrr_added: number
  capture_to_paid_pct: number | null
}

export interface TouchCell {
  lane: string
  frame_version: string
  touch_number: number
  status: string
  count: number
}

export interface ChurnLeadRow {
  id: string
  full_name: string | null
  email: string | null
  primary_venture: string | null
  churned_at: string | null
  last_emailed_at: string | null
}

export interface AutonomyEvent {
  at?: string
  actor?: string
  from?: string
  to?: string
  reason?: string
  [k: string]: unknown
}

export interface AcquisitionLane {
  slug: string
  name: string
  active: boolean
  autonomy_level: 'L1' | 'L2' | 'L3'
  autonomy_history: AutonomyEvent[]
  funnel_weeks: FunnelWeekRow[]
  touches: TouchCell[]
  queued_count: number
  sent_count: number
  paid_count: number
  free_count: number
  mrr_usd: number
  wired: boolean
  churn_queue: ChurnLeadRow[]
}

export interface QueuedSendPreview {
  id: string
  lane: string
  touch_number: number
  frame_version: string
  rendered_subject: string | null
  queued_at: string | null
  status: string
}

export interface AcquisitionOverview {
  lanes: AcquisitionLane[]
  queued_preview: QueuedSendPreview[]
  unassigned_churn: ChurnLeadRow[]
  generated_at?: string
}

interface CacheState {
  data: AcquisitionOverview | null
  loading: boolean
  error: string | null
}

let cache: CacheState = { data: null, loading: true, error: null }
const listeners = new Set<() => void>()
let pollStarted = false
let inflight: Promise<void> | null = null

function notify() {
  for (const l of listeners) l()
}

async function load(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await fetch('/api/acquisition/overview', { cache: 'no-store' })
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
        data: {
          lanes: Array.isArray(json.lanes) ? json.lanes : [],
          queued_preview: Array.isArray(json.queued_preview) ? json.queued_preview : [],
          unassigned_churn: Array.isArray(json.unassigned_churn) ? json.unassigned_churn : [],
          generated_at: json.generated_at,
        },
        loading: false,
        error: null,
      }
    } catch (e: any) {
      const m = String(e?.message || '')
      const friendly =
        /HTTP \d|unexpected response|unavailable/i.test(m) ? m
        : /failed to fetch|networkerror|load failed/i.test(m) ? 'Couldn’t reach the service — check your connection.'
        : 'Temporarily unavailable — try again shortly.'
      cache = { data: cache.data, loading: false, error: friendly }
    } finally {
      inflight = null
      notify()
    }
  })()
  return inflight
}

export function refreshAcquisition(): Promise<void> {
  return load()
}

export function useAcquisition() {
  const [, setVersion] = useState(0)

  useEffect(() => {
    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)
    if (!pollStarted) {
      pollStarted = true
      load()
      setInterval(load, 60_000)
    } else if (!cache.loading && cache.data == null) {
      load()
    }
    return () => { listeners.delete(listener) }
  }, [])

  const refresh = useCallback(() => load(), [])

  return { ...cache, refresh }
}
