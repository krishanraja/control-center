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

export type MeterProvider = 'apify' | 'n8n' | 'anthropic'

/** One thing that spent money. Actors, workflows and agents share this shape
 *  so the console ranks them against each other in one list. */
export interface SpendUnit {
  provider: MeterProvider
  kind: string
  key: string
  label: string
  category: string | null
  usd: number
  usd_7d: number
  runs: number
  failed: number
  units: number
  unit_name: string | null
  buckets: Array<{ bucket: string; usd: number; runs: number }>
}

export type CycleState = 'within' | 'over_prepaid' | 'near_trigger' | 'charging_early' | 'unknown'

/** A plan's prepaid allowance and where this billing cycle sits inside it. */
export interface SpendCycle {
  key: string
  name: string
  included_usd: number | null
  overage_trigger_usd: number | null
  cycle_usd: number | null
  cycle_start: string | null
  cycle_end: string | null
  state: CycleState
  over_usd: number
  headroom_usd: number | null
  top_up_url: string | null
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
  spenders: {
    since: string
    metered_usd: number
    units: SpendUnit[]
    /** Providers the meter covers but has no rows for. A collector that has
     *  not run must never render as a provider that spent nothing. */
    silent: MeterProvider[]
  } | null
  cycles: SpendCycle[]
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

/** Who spent it, one honest line: metered sources where the ledger saw the
 *  calls, otherwise the truth that the key is consumed outside the Control
 *  Center's meter. The plan-ceiling note rides along when the registry has
 *  one. Shared by the broken-question expansion and the spend detail sheet. */
export function usageLine(svc: SpendServiceRow): string | null {
  const parts: string[] = []
  if (svc.usage && svc.usage.calls_7d > 0) {
    parts.push(`Used by ${svc.usage.top_sources.join(', ')}: ${svc.usage.calls_7d.toLocaleString('en-US')} calls${svc.usage.est_cost_7d > 0 ? `, $${svc.usage.est_cost_7d.toFixed(2)}` : ''} this week.`)
  } else {
    parts.push('No calls metered by the Control Center. This key is used outside it (Compound, n8n, or external scripts).')
  }
  if (svc.limit_note) parts.push(svc.limit_note)
  return parts.join(' ')
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
  // Overage past a plan's included amount is money already being spent extra,
  // which is exactly the state the door used to stay silent through.
  const overage = (s.cycles || []).some(c => c.over_usd > 0)
  if (s.connections.broken > 0 || s.connections.low > 0 || renewalSoon || s.ballooning || overage) return 'amber'
  return null
}

/** The plan cycle that most needs saying out loud, or null when all are fine. */
export function worstCycle(s: SpendSummary | null): SpendCycle | null {
  const c = (s?.cycles || []).find(x => x.state !== 'within' && x.state !== 'unknown')
  return c || null
}

/** Cents where cents matter, none where they are noise: an overage of $14.40
 *  needs them, a plan price of $29 does not. */
const money = (n: number): string => {
  if (Math.abs(n) >= 100) return `$${Math.round(n).toLocaleString('en-US')}`
  return `$${Number.isInteger(n) ? n : n.toFixed(2)}`
}

/**
 * The prepaid state in one plain sentence.
 *
 * This is the line the tracker could not say: it reported headroom to Apify's
 * hard cap and called it "ok" in the same week Apify emailed to say the $29
 * included in the plan was spent. Each state names the money and what happens
 * next, because "over by $14" and "Apify will charge you early" are different
 * problems.
 */
export function cycleLine(c: SpendCycle): string {
  const included = c.included_usd == null ? null : money(c.included_usd)
  switch (c.state) {
    case 'charging_early':
      return `${money(c.over_usd)} past the ${included} included — over the ${c.overage_trigger_usd != null ? money(c.overage_trigger_usd) : ''} mark, so ${c.name} charges this early rather than waiting for the invoice.`
    case 'near_trigger':
      return `${money(c.over_usd)} past the ${included} included${c.overage_trigger_usd != null ? `, closing on the ${money(c.overage_trigger_usd)} mark where ${c.name} charges early` : ''}.`
    case 'over_prepaid':
      return `${money(c.over_usd)} past the ${included} included in the plan. It lands on the next invoice.`
    case 'within':
      return c.headroom_usd == null
        ? `Inside the ${included} included in the plan.`
        : `${money(c.headroom_usd)} left of the ${included} included in the plan.`
    default:
      return `${c.name} has not reported this cycle yet.`
  }
}
