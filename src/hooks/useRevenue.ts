import { useEffect, useState } from 'react'

const API = import.meta.env.VITE_API_URL || ''

export interface RevenueSummary {
  collected_30d_net_cents: number
  collected_90d_net_cents: number
  collected_all_time_net_cents: number
  collected_all_time_gross_cents: number
  one_time_share_pct: number | null
  committed_mrr_usd_cents: number
  committed_mrr_other: Array<{ currency: string; cents: number }>
  active_subscriptions: number
  empty: boolean
  as_of: string
}

/**
 * The two revenue figures, straight from Stripe via /api/revenue.
 *
 * `collected` and `committed` answer different questions and are never added
 * together. Most of the money collected to date came from a single one-off
 * payment that no MRR figure can represent, which is why the headline stopped
 * being MRR alone.
 */
export function useRevenue(pollMs = 300_000) {
  const [data, setData] = useState<RevenueSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const r = await fetch(`${API}/api/revenue`, { cache: 'no-cache' })
        const j = await r.json()
        // Shape-check before caching: a generic {ok:true} from a proxy or an
        // older deploy must not masquerade as a summary (useSpend does the
        // same). A malformed body would otherwise crash every consumer that
        // walks committed_mrr_other.
        if (!cancelled && r.ok && j && j.ok
          && typeof j.committed_mrr_usd_cents === 'number'
          && Array.isArray(j.committed_mrr_other)) {
          setData(j as RevenueSummary)
        }
      } catch {
        // Leave the last good value in place; a failed poll is not a $0 month.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const t = setInterval(load, pollMs)
    return () => { cancelled = true; clearInterval(t) }
  }, [pollMs])

  return { revenue: data, loading }
}

/** "$14.75/mo + A$9.58/mo" — non-USD plans stay in their own currency. */
export function formatCommittedMrr(r: RevenueSummary | null): string {
  if (!r) return '—'
  const parts: string[] = [`$${(r.committed_mrr_usd_cents / 100).toFixed(2)}`]
  for (const o of r.committed_mrr_other) {
    parts.push(`${o.currency.toUpperCase()} ${(o.cents / 100).toFixed(2)}`)
  }
  return parts.join(' + ')
}
