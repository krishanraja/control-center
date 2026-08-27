import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * The fleet as n8n sees it, rather than as the fleet reports itself.
 *
 * `workflow_runs` is a self-report: each workflow POSTs a row at the END of a
 * run. A workflow that dies mid-run writes nothing, so the one failure mode
 * that matters most is invisible in it, and the Flows tab has been reading it
 * alone. api/health/fleet-reconcile.ts was built to close exactly that gap,
 * has been writing `workflow_health` from the n8n executions API every six
 * hours, and nothing has ever read the table.
 *
 * ONE RULE MATTERS HERE. The reconcile sweep writes a different `checked_at`
 * per page, so there is no single timestamp identifying a sweep and
 * `where checked_at = (select max(checked_at))` returns one arbitrary page —
 * eight rows out of a hundred and twenty. Written that way this hook would
 * show a fraction of the fleet and, because the healthy majority outnumbers
 * the broken few, would usually show a fraction that looks fine. The current
 * row per workflow is the most recent row PER workflow_id, which is what the
 * fold below does.
 */

export interface WorkflowHealthRow {
  workflow_id: string
  workflow_name: string | null
  active: boolean | null
  is_scheduled: boolean | null
  runs_28d: number | null
  errors_28d: number | null
  error_rate: number | null
  last_run_at: string | null
  last_success_at: string | null
  last_error_at: string | null
  last_error_node: string | null
  last_error_type: string | null
  last_error_message: string | null
  /** healthy | degraded | failing | dead | idle */
  status: string | null
  /** credential | quota | logic | unknown */
  failure_class: string | null
  checked_at: string
  unpublished_draft: boolean | null
}

export interface FleetHealth {
  rows: WorkflowHealthRow[]
  /** status in (failing, dead, degraded), worst first. */
  broken: WorkflowHealthRow[]
  healthy: number
  idle: number
  /** When the freshest row was written. Null when the table is empty. */
  checkedAt: string | null
  loading: boolean
  error: string | null
}

const RANK: Record<string, number> = { failing: 0, dead: 1, degraded: 2 }

/** Whole days between a last success and the check that observed it. */
export function daysSinceSuccess(r: WorkflowHealthRow): number | null {
  if (!r.last_success_at) return null
  const from = new Date(r.last_success_at).getTime()
  const to = new Date(r.checked_at || Date.now()).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return Math.max(0, Math.floor((to - from) / 86_400_000))
}

export function useWorkflowHealth(): FleetHealth {
  const [state, setState] = useState<FleetHealth>({
    rows: [], broken: [], healthy: 0, idle: 0, checkedAt: null, loading: true, error: null,
  })

  useEffect(() => {
    let alive = true
    ;(async () => {
      // Ordered newest first so the first row seen per workflow_id is its
      // current one. The limit covers several sweeps of a ~120 workflow fleet.
      const { data, error } = await supabase
        .from('workflow_health')
        .select('workflow_id,workflow_name,active,is_scheduled,runs_28d,errors_28d,error_rate,last_run_at,last_success_at,last_error_at,last_error_node,last_error_type,last_error_message,status,failure_class,checked_at,unpublished_draft')
        .order('checked_at', { ascending: false })
        .limit(1000)

      if (!alive) return
      if (error) {
        // PGRST205 is "table not in the schema cache" — a fresh environment
        // where the reconcile route has never run. Not an error worth a banner.
        setState(s => ({ ...s, loading: false, error: error.code === 'PGRST205' ? null : error.message }))
        return
      }

      const seen = new Set<string>()
      const rows: WorkflowHealthRow[] = []
      for (const r of (data as WorkflowHealthRow[]) || []) {
        if (seen.has(r.workflow_id)) continue
        seen.add(r.workflow_id)
        rows.push(r)
      }

      const broken = rows
        .filter(r => r.status && RANK[r.status] !== undefined)
        .sort((a, b) =>
          (RANK[a.status!] - RANK[b.status!]) ||
          ((b.errors_28d || 0) - (a.errors_28d || 0)))

      setState({
        rows,
        broken,
        healthy: rows.filter(r => r.status === 'healthy').length,
        idle: rows.filter(r => r.status === 'idle').length,
        checkedAt: rows[0]?.checked_at || null,
        loading: false,
        error: null,
      })
    })()
    return () => { alive = false }
  }, [])

  return state
}
