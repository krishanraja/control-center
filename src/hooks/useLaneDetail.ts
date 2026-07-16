import { useCallback, useEffect, useState } from 'react'

/**
 * Per-lane control-plane detail: autonomy stats, economics, budget, breaker
 * state — GET /api/acquisition/lanes/:slug (service-role; money + rates never
 * read via the anon client). Module cache per slug so the Autonomy and
 * Governor cards share one fetch.
 */

export interface LaneCriteria {
  key: string
  label: string
  met: boolean
  actual: unknown
  required: string
  overridable: boolean
}

export interface LaneDetail {
  lane: string
  stats: {
    autonomy_level: 'L1' | 'L2' | 'L3'
    approved_30d: number
    rejected_30d: number
    approved_14d: number
    rejected_14d: number
    rejection_rate_30d: number | null
    rejection_rate_14d: number | null
    queued_awaiting: number
    autonomy_history: Array<Record<string, unknown>>
  }
  economics: {
    agent_cost_mtd: number
    api_cost_mtd: number
    fixed_cost_monthly: number
    ad_spend_monthly: number
    total_cost_mtd: number
    attributed_mrr: number
    paid_count: number
    new_paid_mtd: number
    contribution_margin_usd: number
    cac_usd: number | null
    ltv_estimate_usd: number | null
  } | null
  budget: { daily_usd: number; monthly_usd: number; paid_monthly_usd?: number }
  paused: { paused_at: string; by: string; reason: string } | null
  paid_global_cap_usd: number
}

const cache = new Map<string, LaneDetail>()
const listeners = new Set<() => void>()

function notify() { for (const l of listeners) l() }

async function load(slug: string): Promise<void> {
  try {
    const r = await fetch(`/api/acquisition/lanes/${encodeURIComponent(slug)}`, { cache: 'no-store' })
    const json = await r.json().catch(() => null)
    if (!r.ok || !json || json.ok === false) return
    cache.set(slug, json as LaneDetail)
    notify()
  } catch { /* transient — next poll retries */ }
}

export function useLaneDetail(slug: string | null) {
  const [, setVersion] = useState(0)

  useEffect(() => {
    if (!slug) return
    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)
    load(slug)
    const iv = setInterval(() => load(slug), 60_000)
    return () => { listeners.delete(listener); clearInterval(iv) }
  }, [slug])

  const refresh = useCallback(() => (slug ? load(slug) : Promise.resolve()), [slug])

  return { detail: slug ? cache.get(slug) ?? null : null, refresh }
}

/** POST an action to the lane control plane. Returns the parsed body (even on 4xx, so callers can render 422 criteria). */
export async function laneAction(
  slug: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const r = await fetch(`/api/acquisition/lanes/${encodeURIComponent(slug)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await r.json().catch(() => ({}))
  if (r.ok) await load(slug)
  return { status: r.status, body }
}
