import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * PostHog product usage, per product, per day.
 *
 * An n8n workflow has been syncing PostHog into `product_metrics` nightly
 * since July and nothing has ever read it. That is the cost side of the
 * conversion question going unanswered: the fleet funnel says how many people
 * landed and how many bought, and this says how many came back afterwards.
 * A product with landings and no returning users is a different problem from
 * one with no landings, and until now the console could not tell them apart.
 *
 * Rows are one 7-day window per product per capture, so the latest row per
 * product is "the last week", and the series is those windows over time.
 */

export interface ProductMetricRow {
  product: string
  metric_date: string
  window_days: number
  active_users: number | null
  pageviews: number | null
  events: number | null
}

export interface ProductUsage {
  /** Latest row per product, most active first. */
  latest: ProductMetricRow[]
  /** Chronological active_users per product, for a sparkline. */
  series: Record<string, number[]>
  loading: boolean
  error: string | null
}

export function useProductMetrics(days = 30): ProductUsage {
  const [state, setState] = useState<ProductUsage>({ latest: [], series: {}, loading: true, error: null })

  useEffect(() => {
    let alive = true
    ;(async () => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('product_metrics')
        .select('product, metric_date, window_days, active_users, pageviews, events')
        .gte('metric_date', since)
        .order('metric_date', { ascending: false })
        .limit(500)

      if (!alive) return
      if (error) {
        setState({ latest: [], series: {}, loading: false, error: error.code === 'PGRST205' ? null : error.message })
        return
      }

      const rows = (data as ProductMetricRow[]) || []
      const seen = new Set<string>()
      const latest: ProductMetricRow[] = []
      for (const r of rows) {
        if (seen.has(r.product)) continue
        seen.add(r.product)
        latest.push(r)
      }
      latest.sort((a, b) => (b.active_users || 0) - (a.active_users || 0))

      // Oldest to newest, so a sparkline reads left to right.
      const series: Record<string, number[]> = {}
      for (const r of [...rows].reverse()) {
        (series[r.product] ||= []).push(r.active_users || 0)
      }

      setState({ latest, series, loading: false, error: null })
    })()
    return () => { alive = false }
  }, [days])

  return state
}
