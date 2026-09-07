import { useCallback, useEffect, useState } from 'react'

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
  /** When the Stripe pull last wrote the revenue tables. Null before the first sync. */
  synced_at?: string | null
}

/** Fired after a manual Stripe sync so ledger readers reload without waiting a poll. */
export const CUSTOMERS_REFRESH_EVENT = 'cc:customers-refresh'

/** Hours since the last Stripe sync, or null when unknown. */
export function syncAgeHours(r: RevenueSummary | null, now = Date.now()): number | null {
  if (!r?.synced_at) return null
  const t = new Date(r.synced_at).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, (now - t) / 3_600_000)
}

/** The cron runs daily; past a day and a half the tab should say it is behind. */
export const SYNC_STALE_HOURS = 36

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
  const [syncing, setSyncing] = useState(false)
  const [tick, setTick] = useState(0)

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
    const onRefresh = () => { void load() }
    window.addEventListener(CUSTOMERS_REFRESH_EVENT, onRefresh)
    return () => { cancelled = true; clearInterval(t); window.removeEventListener(CUSTOMERS_REFRESH_EVENT, onRefresh) }
  }, [pollMs, tick])

  const refresh = useCallback(() => setTick(n => n + 1), [])

  /**
   * Pull Stripe now instead of waiting for the 08:00 UTC cron. POST is
   * accepted with the dashboard cookie (api/_auth.ts guardCronRoute). Resolves
   * to an error string, or null on success; every reader of the revenue and
   * customers tables is told to reload either way.
   */
  const syncNow = useCallback(async (): Promise<string | null> => {
    setSyncing(true)
    try {
      const r = await fetch(`${API}/api/revenue/sync`, { method: 'POST', credentials: 'include' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j?.ok === false) return typeof j?.error === 'string' ? j.error : `HTTP ${r.status}`
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'sync failed'
    } finally {
      setSyncing(false)
      window.dispatchEvent(new Event(CUSTOMERS_REFRESH_EVENT))
    }
  }, [])

  return { revenue: data, loading, refresh, syncNow, syncing }
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
