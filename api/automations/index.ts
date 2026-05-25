/**
 * GET /api/automations
 *
 * Returns the list of automations/workflows that have executed successfully
 * in the last 48h, derived from `workflow_runs`. This replaces the previous
 * pattern where AutomationsPanel rendered a hardcoded CRON_JOBS array
 * asserting "N crons live" regardless of whether those crons had actually
 * run — a split-brain between UI claim and reality (audit date: 2026-04-23).
 *
 * Response shape:
 *   {
 *     ok: true,
 *     window_hours: 48,
 *     counted_at: ISO string,
 *     workflows: Array<{
 *       workflow_id: string | null,
 *       workflow_name: string | null,
 *       agent_id: string | null,
 *       successful_runs: number,
 *       last_run_at: ISO string | null,
 *     }>,
 *     total_successful_runs: number,
 *   }
 *
 * The endpoint is defensive: if `workflow_runs` is empty or errors, we
 * return ok:true with an empty workflows array. The client renders a
 * "data unavailable" state when `ok:false`, and a "no successful runs
 * in the last 48h" state when `workflows.length === 0`.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

type RunRow = {
  workflow_id?: string | null
  workflow_name?: string | null
  agent_id?: string | null
  agent?: string | null
  status?: string | null
  run_at?: string | null
  created_at?: string | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const windowHours = 48
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('workflow_runs')
    .select('workflow_id, workflow_name, agent_id, agent, status, run_at, created_at')
    .eq('status', 'success')
    .or(`created_at.gte.${since},run_at.gte.${since}`)

  if (error) {
    // Be explicit — the client shows "data unavailable" when ok:false.
    return res.status(200).json({
      ok: false,
      error: error.message,
      window_hours: windowHours,
      workflows: [],
    })
  }

  const rows = (data || []) as RunRow[]

  // Group by workflow_id (falling back to workflow_name or agent_id so
  // older rows that lack workflow_id still aggregate sensibly).
  const byKey = new Map<
    string,
    {
      workflow_id: string | null
      workflow_name: string | null
      agent_id: string | null
      successful_runs: number
      last_run_at: string | null
    }
  >()

  for (const r of rows) {
    const key = r.workflow_id || r.workflow_name || r.agent_id || r.agent || 'unknown'
    const ts = r.run_at || r.created_at || null
    const existing = byKey.get(key)
    if (existing) {
      existing.successful_runs += 1
      if (ts && (!existing.last_run_at || ts > existing.last_run_at)) {
        existing.last_run_at = ts
      }
    } else {
      byKey.set(key, {
        workflow_id: r.workflow_id ?? null,
        workflow_name: r.workflow_name ?? null,
        agent_id: r.agent_id ?? r.agent ?? null,
        successful_runs: 1,
        last_run_at: ts,
      })
    }
  }

  const workflows = Array.from(byKey.values()).sort(
    (a, b) => (b.last_run_at || '').localeCompare(a.last_run_at || '')
  )

  return res.json({
    ok: true,
    window_hours: windowHours,
    counted_at: new Date().toISOString(),
    workflows,
    total_successful_runs: rows.length,
  })
}
