import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Daily growth-metric snapshots for the Home scoreboard (and the stall chips).
 * One anon fetch of the last 45 days of growth_metrics, 5-minute poll. Daily
 * data does not justify a realtime channel (ADR-002 channel budget).
 */

export const GROWTH_KEYS = [
  'substack_publication_total',
  'substack_tech0nomic_total',
  'maven_students',
  'app_paid_subs',
  'app_mrr_usd',
  'guests_confirmed_30d',
  'visibility_accepted_30d',
] as const
export type GrowthKey = typeof GROWTH_KEYS[number]

export interface GrowthPoint { date: string; value: number }

export interface GrowthSeries {
  key: GrowthKey
  points: GrowthPoint[]        // ascending by date
  latest: number | null
  latestDate: string | null
  staleDays: number | null     // whole days since latestDate; null = no data ever
}

export function isGrowthScoreboardEnabled(): boolean {
  return import.meta.env.VITE_GROWTH_SCOREBOARD_ENABLED === 'true'
}

const WINDOW_DAYS = 45

interface RawRow { metric_key: string; metric_date: string; value: number | string }

export function useGrowthMetrics() {
  const [rows, setRows] = useState<RawRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('growth_metrics')
        .select('metric_key, metric_date, value')
        .gte('metric_date', since)
        .order('metric_date', { ascending: true })
        .limit(1000)
      if (cancelled) return
      // Pre-migration (PGRST205) or any error: render empty, never break Home.
      setRows(error ? [] : ((data as RawRow[]) || []))
      setLoading(false)
    }
    load()
    const iv = setInterval(load, 5 * 60_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  const series = useMemo<Record<GrowthKey, GrowthSeries>>(() => {
    const today = new Date().toISOString().slice(0, 10)
    const out = {} as Record<GrowthKey, GrowthSeries>
    for (const key of GROWTH_KEYS) {
      const points = rows
        .filter(r => r.metric_key === key)
        .map(r => ({ date: r.metric_date, value: Number(r.value) }))
        .filter(p => Number.isFinite(p.value))
      const last = points.length ? points[points.length - 1] : null
      out[key] = {
        key,
        points,
        latest: last?.value ?? null,
        latestDate: last?.date ?? null,
        staleDays: last ? Math.max(0, Math.floor((Date.parse(today) - Date.parse(last.date)) / 86_400_000)) : null,
      }
    }
    return out
  }, [rows])

  return { series, loading }
}

/** Value at (or immediately before) `daysAgo` from the series' latest date. */
export function valueDaysAgo(s: GrowthSeries, daysAgo: number): number | null {
  if (!s.latestDate || !s.points.length) return null
  const cutoff = Date.parse(s.latestDate) - daysAgo * 86_400_000
  let best: number | null = null
  for (const p of s.points) {
    if (Date.parse(p.date) <= cutoff) best = p.value
    else break
  }
  return best
}

/**
 * Combine several key-series into one line: forward-filled daily sum. Days
 * before a key's first observation contribute nothing for that key.
 */
export function combineSeries(list: GrowthSeries[]): GrowthPoint[] {
  const dates = Array.from(new Set(list.flatMap(s => s.points.map(p => p.date)))).sort()
  if (!dates.length) return []
  return dates.map(date => {
    let sum = 0
    for (const s of list) {
      let lastKnown: number | null = null
      for (const p of s.points) {
        if (p.date <= date) lastKnown = p.value
        else break
      }
      if (lastKnown != null) sum += lastKnown
    }
    return { date, value: sum }
  })
}
