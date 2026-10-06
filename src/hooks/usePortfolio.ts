import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { withoutTestRecords } from '../lib/recordHygiene'
import { useCustomers } from './useCustomers'
import { useRevenue } from './useRevenue'
import { useProductMetrics } from './useProductMetrics'
import { buildBoard, type BoardInput } from '../lib/portfolioBoard'
import { PORTFOLIO, SUBSTACK } from '../lib/portfolio'
import { LISTENER_SYNC_WORKFLOW_ID, listenerSyncState, type ListenerRun } from '../lib/pilotListeners'
import type { ProductSignal } from '../lib/growthModel'
import type { CouncilReviewRow } from '../lib/growth'

/** Every audience tag a board cell or the Substack line reads, counted once each. */
const AUDIENCE_TAGS = [
  ...new Set([...PORTFOLIO.map(p => p.audienceSource).filter((s): s is string => !!s), SUBSTACK.freeAudienceSource]),
]

export interface SubstackFree {
  /** Free readers the last CSV import brought in, still on the Leads side. */
  inLeads: number | null
  /** The exact list size from the newest CSV import, and its date. Null when never imported. */
  lastImport: { total: number; on: string } | null
}

/**
 * Free sign-ups per audience tag, counted on `leads` (the pipeline's rule:
 * free is a lead, paid is a customer, never both), plus the newest Substack
 * export size. A count that cannot be read stays missing, never 0.
 */
function useAudience() {
  const [audience, setAudience] = useState<Record<string, number>>({})
  const [substack, setSubstack] = useState<SubstackFree>({ inLeads: null, lastImport: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    const load = async () => {
      const counts = await Promise.all(AUDIENCE_TAGS.map(async tag => {
        // Rows, not a head count: the count has to pass the same test-record
        // filter every other live list uses. On 2026-10-05 all 103 rows
        // tagged ctrl were QA and test accounts, and a head count said 103.
        const { data, error } = await supabase
          .from('leads')
          .select('id, email, full_name, company')
          .contains('audience_sources', [tag])
          .or('status.is.null,status.neq.churned')
          .limit(5000)
        return [tag, error || !data ? null : withoutTestRecords(data as Array<Record<string, unknown>>).length] as const
      }))
      const { data: gm } = await supabase
        .from('growth_metrics')
        .select('value, metric_date')
        .eq('metric_key', SUBSTACK.totalMetricKey)
        .order('metric_date', { ascending: false })
        .limit(1)
      if (!alive) return
      const next: Record<string, number> = {}
      for (const [tag, n] of counts) if (n != null) next[tag] = n
      setAudience(next)
      const row = (gm as Array<{ value: number; metric_date: string }> | null)?.[0]
      setSubstack({
        inLeads: next[SUBSTACK.freeAudienceSource] ?? null,
        lastImport: row ? { total: Number(row.value) || 0, on: row.metric_date } : null,
      })
    }
    void load()
    const t = setInterval(load, 300_000)
    return () => { alive = false; clearInterval(t) }
  }, [tick])
  return { audience, substack, reload: () => setTick(n => n + 1) }
}

/**
 * The Full Time listener copy's own heartbeats (api/audience/fulltime-listeners.ts),
 * read so a count is shown only once the copy has worked. A failed read is
 * null, which says "could not read", never 0.
 */
export function useListenerSync() {
  const [runs, setRuns] = useState<ListenerRun[] | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data, error } = await supabase
        .from('workflow_runs')
        .select('status, run_at, outcome, error_message')
        .eq('workflow_id', LISTENER_SYNC_WORKFLOW_ID)
        .order('run_at', { ascending: false })
        .limit(20)
      if (!alive) return
      setRuns(error ? null : ((data as ListenerRun[] | null) ?? []))
    }
    void load()
    const t = setInterval(load, 300_000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  return useMemo(() => ({ loading: runs === undefined, state: listenerSyncState(runs ?? null) }), [runs])
}

/**
 * The board both tabs render. Growth already holds the growth signals and the
 * reviews; Subscriptions passes the same rows from its own read. Customers,
 * revenue, usage and the audience counts are read here, once.
 */
export function usePortfolio(growth: { signals: ReadonlyArray<ProductSignal>; reviews: ReadonlyArray<CouncilReviewRow>; loading: boolean }) {
  const { customers, loading: custLoading } = useCustomers()
  const { revenue, loading: revLoading, syncNow, syncing } = useRevenue()
  const usage = useProductMetrics(45)
  const { audience, substack, reload: reloadAudience } = useAudience()
  const listenerSync = useListenerSync()

  const board = useMemo(() => {
    const input: BoardInput = {
      signals: growth.signals,
      reviews: growth.reviews,
      customers,
      audience,
      usage: usage.latest,
      listenerSync: listenerSync.loading ? null : { ok: listenerSync.state.ok, line: listenerSync.state.line },
    }
    return buildBoard(input, new Date())
  }, [growth.signals, growth.reviews, customers, audience, usage.latest, listenerSync])

  return {
    ...board,
    revenue,
    substack,
    customers,
    syncNow,
    syncing,
    reloadAudience,
    listenerSync,
    loading: growth.loading || custLoading || revLoading,
  }
}

export type PortfolioModel = ReturnType<typeof usePortfolio>
