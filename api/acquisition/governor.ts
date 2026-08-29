import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'

/**
 * /api/acquisition/governor — the Profit Governor.
 *
 * GET            → per-lane economics + budget burn + breaker state +
 *                  unattributed cost (powers ProfitGovernorCard).
 * GET (cron) /
 * POST           → evaluation pass. Vercel cron (every 6h, see vercel.json)
 *                  arrives as GET with the x-vercel-cron header; a manual
 *                  POST forces the same evaluation.
 *
 * Evaluation, per lane in acquisition_lanes:
 *   ≥80% of monthly budget → high-priority task for Krish (deduped per month).
 *   ≥100%                  → TRIP: deactivate the lane's n8n workflows
 *                            (acquisition_lane_workflows map only — never the
 *                            exec-governor's critical whitelist, which must
 *                            never be added to that map), record the pause in
 *                            acquisition_paused_lanes (by:'governor'), urgent
 *                            task + audit_log.
 * Already-paused lanes are skipped. Resume is Krish-only via
 * /api/acquisition/lanes/:slug.
 */

async function readConfig(key: string): Promise<any> {
  const { data } = await supabase.from('system_config').select('value').eq('key', key).maybeSingle()
  try { return JSON.parse(data?.value || 'null') } catch { return null }
}

async function writeConfig(key: string, value: unknown): Promise<string | null> {
  const { error } = await supabase
    .from('system_config')
    .upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() })
  return error?.message || null
}

async function setWorkflowsActive(workflowIds: string[], active: boolean): Promise<{ ok: string[]; failed: string[] }> {
  const base = process.env.N8N_API_BASE_URL
  const key = process.env.N8N_API_KEY
  const ok: string[] = []
  const failed: string[] = []
  if (!base || !key) return { ok, failed: workflowIds }
  for (const id of workflowIds) {
    try {
      const r = await fetch(`${base}/workflows/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`, {
        method: 'POST',
        headers: { 'X-N8N-API-KEY': key },
      })
      if (r.ok) ok.push(id)
      else failed.push(id)
    } catch {
      failed.push(id)
    }
  }
  return { ok, failed }
}

async function upsertGovernorTask(id: string, title: string, description: string, priority: 'high' | 'urgent') {
  const { data: existing } = await supabase.from('tasks').select('id').eq('id', id).maybeSingle()
  if (existing) return false
  const { error } = await supabase.from('tasks').insert({
    id,
    title,
    description,
    agent: 'maya',
    status: 'waiting',
    priority,
    workstream: 'growth_governor',
    created: new Date().toISOString(),
  })
  if (error) console.warn('[governor] task insert failed:', error.message)
  return !error
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (guardCronRoute(req, res)) return

  try {
    const [econQ, unattrQ, budgets, paused] = await Promise.all([
      supabase.from('lane_economics').select('*'),
      supabase.from('acquisition_unattributed_costs').select('*').maybeSingle(),
      readConfig('acquisition_budgets'),
      readConfig('acquisition_paused_lanes'),
    ])
    if (econQ.error) throw econQ.error
    const lanes = econQ.data || []

    const laneState = lanes.map((l: any) => {
      const b = (budgets && (budgets[l.lane] || budgets.default)) || { daily_usd: 5, monthly_usd: 50 }
      const spent = Number(l.total_cost_mtd || 0)
      const monthly = Number(b.monthly_usd || 0)
      return {
        ...l,
        budget: b,
        spent_mtd: spent,
        burn_pct: monthly > 0 ? Math.round((spent / monthly) * 1000) / 10 : null,
        paused: paused?.[l.lane] || null,
      }
    })

    // A plain GET is read-only economics and stays open, because the
    // ProfitGovernorCard fetches it from the browser with no secret.
    // The EVALUATION pass is different: it can deactivate n8n workflows when a
    // budget trips, so it must prove the cron credential. x-vercel-cron is NOT
    // stripped by Vercel on inbound requests (verified 2026-08-05: a forged
    // header ran a job on another route), so it authenticates nothing on its own.
    const cronSecret = process.env.CRON_SECRET || ''
    const authHeader = req.headers.authorization || ''
    const authorised = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`
    const wantsEvaluation = req.method === 'POST' || Boolean(req.headers['x-vercel-cron'])
    if (wantsEvaluation && !authorised) {
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }
    const isCron = wantsEvaluation && authorised
    const events: any[] = []

    if (isCron) {
      const month = new Date().toISOString().slice(0, 7)
      const wfMap = (await readConfig('acquisition_lane_workflows')) || {}
      let nextPaused = { ...(paused || {}) }
      let pausedChanged = false

      for (const lane of laneState) {
        if (lane.paused) continue
        const monthly = Number(lane.budget.monthly_usd || 0)
        if (monthly <= 0) continue
        const ratio = lane.spent_mtd / monthly

        if (ratio >= 1) {
          const workflowIds: string[] = Array.isArray(wfMap[lane.lane]) ? wfMap[lane.lane] : []
          const result = await setWorkflowsActive(workflowIds, false)
          nextPaused = {
            ...nextPaused,
            [lane.lane]: {
              paused_at: new Date().toISOString(),
              by: 'governor',
              reason: `budget trip: $${lane.spent_mtd} MTD >= $${monthly} cap`,
              workflows: result.ok,
            },
          }
          pausedChanged = true
          await upsertGovernorTask(
            `governor-trip-${lane.lane}-${month}`,
            `Budget breaker tripped: ${lane.lane}`,
            `MTD spend $${lane.spent_mtd} hit the $${monthly}/mo cap. Lane workflows paused (${result.ok.length} ok, ${result.failed.length} failed). Resume from the Growth tab once you've raised the budget or acknowledged the overage.`,
            'urgent',
          )
          const { error: logErr } = await supabase.from('audit_log').insert({
            event_type: 'governor_budget_trip',
            actor: 'governor',
            target: lane.lane,
            display_message: `Profit Governor paused ${lane.lane}: $${lane.spent_mtd} MTD >= $${monthly} cap`,
            details: JSON.stringify({ spent_mtd: lane.spent_mtd, monthly_cap: monthly, workflows: result }),
          })
          if (logErr) console.warn('[governor] audit_log failed:', logErr.message)
          events.push({ lane: lane.lane, event: 'trip', spent: lane.spent_mtd, cap: monthly })
        } else if (ratio >= 0.8) {
          const created = await upsertGovernorTask(
            `governor-80pct-${lane.lane}-${month}`,
            `Budget warning: ${lane.lane} at ${Math.round(ratio * 100)}%`,
            `MTD spend $${lane.spent_mtd} of the $${monthly}/mo cap. At 100% the breaker pauses the lane's workflows automatically.`,
            'high',
          )
          if (created) events.push({ lane: lane.lane, event: 'warn_80pct', spent: lane.spent_mtd, cap: monthly })
        }
      }

      if (pausedChanged) {
        const cfgErr = await writeConfig('acquisition_paused_lanes', nextPaused)
        if (cfgErr) throw new Error(cfgErr)
      }
    }

    return res.status(200).json({
      ok: true,
      generated_at: new Date().toISOString(),
      lanes: laneState,
      unattributed: unattrQ.data || null,
      paid_global_cap_usd: budgets?.paid_global_cap_usd ?? 500,
      evaluated: isCron,
      events,
    })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'governor failed' })
  }
}
