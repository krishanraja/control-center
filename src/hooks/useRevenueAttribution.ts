import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCustomers, type CustomerRow, type CustomerProduct } from './useCustomers'

/**
 * Pillar 1 — Money Machine.
 *
 * Pulls the current `customers` cache (already polled by useCustomers) and
 * joins each row to the matching `leads` / `tasks` rows by FK. Returns
 * MRR + projection + ROI buckets ready for the ticker + sources panel.
 *
 * No new realtime channel — leads/tasks are fetched once on mount and
 * refreshed when the customer cache fires its 60s tick.
 */

export interface AttributedCustomer extends CustomerRow {
  lead_full_name?: string | null
  lead_company?: string | null
  lead_assignee_agent?: string | null
  lead_source_type?: string | null
  task_title?: string | null
  task_agent?: string | null
}

export interface AttributionBucket {
  key: string                    // 'apollo' | 'cleo_linkedin' | 'unattributed' | ...
  label: string
  agent?: string | null          // best-fit agent for this bucket
  paid_count: number
  mrr_usd: number
  ltv_estimate_usd: number       // simple 24-month projection
  share_pct: number              // share of total paid MRR
}

const MS_PER_DAY = 86_400_000

function mrrGoalFromConfig(rows: any[]): number {
  const row = rows.find(r => r.key === 'mrr_goal_usd')
  if (!row) return 100_000
  const n = Number(row.value)
  return Number.isFinite(n) ? n : 100_000
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function withinDays(iso?: string | null, days = 7): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < days * MS_PER_DAY
}

function deltaMrr(customers: CustomerRow[], windowDays: number): number {
  let added = 0
  let lost = 0
  for (const c of customers) {
    if (c.kind === 'paid' && c.became_paid_at && withinDays(c.became_paid_at, windowDays)) {
      added += Number(c.mrr_usd) || 0
    }
    if (c.kind === 'churned' && c.churned_at && withinDays(c.churned_at, windowDays)) {
      lost += Number(c.mrr_usd) || 0
    }
  }
  return added - lost
}

/**
 * Simple 90-day MRR projection: extrapolate the last 28-day net delta
 * linearly. Not predictive — informational. Helps Krish see the gap.
 */
function project90d(currentMrr: number, customers: CustomerRow[]): number {
  const net28 = deltaMrr(customers, 28)
  if (net28 === 0) return currentMrr
  const dailyVelocity = net28 / 28
  return Math.max(0, currentMrr + dailyVelocity * 90)
}

export function useRevenueAttribution() {
  const { customers, totals, loading: customersLoading } = useCustomers()
  const [leadsById, setLeadsById]   = useState<Map<string, any>>(new Map())
  const [tasksById, setTasksById]   = useState<Map<string, any>>(new Map())
  const [mrrGoal,   setMrrGoal]     = useState<number>(100_000)
  const [loading,   setLoading]     = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [leadsRes, tasksRes, cfgRes] = await Promise.all([
        supabase.from('leads').select('id, full_name, company, assignee_agent, source_type, email').limit(2000),
        supabase.from('tasks').select('id, title, agent').limit(2000),
        supabase.from('system_config').select('key, value'),
      ])
      if (cancelled) return
      const lMap = new Map<string, any>()
      for (const l of leadsRes.data || []) lMap.set(l.id, l)
      const tMap = new Map<string, any>()
      for (const t of tasksRes.data || []) tMap.set(t.id, t)
      setLeadsById(lMap)
      setTasksById(tMap)
      setMrrGoal(mrrGoalFromConfig(cfgRes.data || []))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [customers.length])

  const attributed = useMemo<AttributedCustomer[]>(() => {
    return customers.map(c => {
      const lead = c.attribution_lead_id ? leadsById.get(c.attribution_lead_id) : null
      const task = c.attribution_task_id ? tasksById.get(c.attribution_task_id) : null
      return {
        ...c,
        lead_full_name:       lead?.full_name ?? null,
        lead_company:         lead?.company ?? null,
        lead_assignee_agent:  lead?.assignee_agent ?? null,
        lead_source_type:     lead?.source_type ?? null,
        task_title:           task?.title ?? null,
        task_agent:           task?.agent ?? null,
      }
    })
  }, [customers, leadsById, tasksById])

  const liveMrr     = totals.mrrUsd
  const mrrDelta7d  = useMemo(() => deltaMrr(customers, 7),  [customers])
  const mrrDelta28d = useMemo(() => deltaMrr(customers, 28), [customers])
  const projection  = useMemo(() => project90d(liveMrr, customers), [liveMrr, customers])
  const gapToGoal   = Math.max(0, mrrGoal - liveMrr)
  const goalPct     = mrrGoal > 0 ? Math.min(100, (liveMrr / mrrGoal) * 100) : 0

  const buckets = useMemo<AttributionBucket[]>(() => {
    const map = new Map<string, AttributionBucket>()
    let totalPaidMrr = 0

    for (const c of attributed) {
      if (c.kind !== 'paid' || c.churned_at) continue
      const mrr = Number(c.mrr_usd) || 0
      totalPaidMrr += mrr

      // Bucket priority: explicit channel → assignee_agent → lead source_type → 'unattributed'
      const key =
        c.attribution_channel ||
        c.lead_assignee_agent ||
        c.lead_source_type ||
        'unattributed'
      const label =
        c.attribution_channel ? c.attribution_channel :
        c.lead_assignee_agent ? `Agent · ${c.lead_assignee_agent}` :
        c.lead_source_type    ? `Source · ${c.lead_source_type}` :
        'Unattributed'

      const existing = map.get(key) || {
        key, label,
        agent: c.lead_assignee_agent || c.task_agent || null,
        paid_count: 0, mrr_usd: 0, ltv_estimate_usd: 0, share_pct: 0,
      }
      existing.paid_count += 1
      existing.mrr_usd += mrr
      // 24-month LTV estimate (assumes 4% monthly churn) ≈ 16x MRR.
      existing.ltv_estimate_usd += mrr * 16
      map.set(key, existing)
    }

    const arr = Array.from(map.values())
    for (const b of arr) b.share_pct = totalPaidMrr > 0 ? (b.mrr_usd / totalPaidMrr) * 100 : 0
    return arr.sort((a, b) => b.mrr_usd - a.mrr_usd)
  }, [attributed])

  return {
    customers: attributed,
    liveMrr, mrrDelta7d, mrrDelta28d, projection,
    mrrGoal, gapToGoal, goalPct,
    buckets,
    loading: customersLoading || loading,
  }
}
