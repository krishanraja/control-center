import { useEffect, useState } from 'react'

const API = import.meta.env.VITE_API_URL || ''

export interface SpendServiceRow {
  key: string
  name: string
  category: string
  criticality: 'critical' | 'standard' | 'low'
  month_usd: number
  avg_usd: number
  cadence: 'monthly' | 'annual' | 'one_off' | 'unknown'
  plan_label: string | null
  last_paid_at: string | null
  next_renewal_on: string | null
  status: string | null
  balance: number | null
  balance_unit: string | null
  balance_low: boolean
  last_checked_at: string | null
  top_up_url: string | null
  dashboard_url: string | null
  limit_note: string | null
  usage: { calls_7d: number; est_cost_7d: number; top_sources: string[] } | null
}

export interface SpendSummary {
  ok: boolean
  month_usd: number
  avg_3mo_usd: number
  delta_pct: number | null
  ballooning: boolean
  months: Array<{ month: string; total_usd: number }>
  services: SpendServiceRow[]
  unmatched: Array<{ vendor: string; month_usd: number }>
  connections: {
    ok: number
    low: number
    broken: number
    critical_broken: number
    unchecked: number
    broken_names: string[]
    low_names: string[]
  }
  renewals_due: Array<{ key: string; name: string; amount: number; currency: string; on: string }>
  needs_review: number
  meter: { usd_mtd: number; calls_mtd: number } | null
  empty: boolean
  as_of: string
}

// One fetch for every consumer (Home door dot, Intel drawer line, the Intel
// panel and its detail sheet), the useRealtimeDecisionsWaiting singleton shape
// with a poll instead of channels: /api/spend is a computed summary, not a
// realtime table.
let cache: SpendSummary | null = null
let loaded = false
let inflight: Promise<void> | null = null
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

const POLL_MS = 300_000

async function fetchSummary(): Promise<void> {
  try {
    const r = await fetch(`${API}/api/spend`, { cache: 'no-cache' })
    const j = await r.json()
    // A failed poll keeps the last good value; a broken endpoint is not a $0
    // month. Shape-check before caching: a generic {ok:true} from a proxy or
    // an older deploy must not masquerade as a summary.
    if (r.ok && j && j.ok && j.connections && Array.isArray(j.months) && Array.isArray(j.services)) {
      cache = j as SpendSummary
    }
  } catch {
    /* keep last good value */
  } finally {
    loaded = true
    inflight = null
    listeners.forEach(fn => fn())
  }
}

function load(): Promise<void> {
  if (!inflight) inflight = fetchSummary()
  return inflight
}

export function useSpend() {
  const [, bump] = useState(0)

  useEffect(() => {
    const onChange = () => bump(n => n + 1)
    listeners.add(onChange)
    void load()
    if (!timer) timer = setInterval(() => { void load() }, POLL_MS)
    return () => {
      listeners.delete(onChange)
      if (listeners.size === 0 && timer) { clearInterval(timer); timer = null }
    }
  }, [])

  return {
    spend: cache,
    loading: !loaded,
    refresh: () => load(),
  }
}

/**
 * The Intel door's status dot, the one sanctioned exception to "doors carry
 * no numbers": rose when a critical connection is broken, amber when money
 * needs a look (any broken connection, low credits, an annual renewal within
 * 14 days, or spend ballooning). Null keeps the door silent.
 */
export function spendAlert(s: SpendSummary | null): 'amber' | 'rose' | null {
  if (!s || s.empty) return null
  if (s.connections.critical_broken > 0) return 'rose'
  const renewalSoon = s.renewals_due.some(r => {
    const days = (new Date(r.on).getTime() - Date.now()) / 86_400_000
    return days <= 14
  })
  if (s.connections.broken > 0 || s.connections.low > 0 || renewalSoon || s.ballooning) return 'amber'
  return null
}
