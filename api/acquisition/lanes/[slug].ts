import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'

/**
 * /api/acquisition/lanes/:slug — the autonomy + governor control plane for one lane.
 *
 * GET  → { stats (lane_autonomy_stats), economics (lane_economics), budget,
 *          paused, costs (lane_costs) }
 *
 * POST { action: 'promote'|'demote'|'pause'|'resume'|'set_budget', ... }
 *   promote — mechanical gates, 422 with the unmet-criteria checklist:
 *     L1→L2: ≥20 approved sends/30d AND rejection rate <5%
 *     L2→L3: ≥50 approved sends/30d AND rejection rate <2% AND ≥14d at L2
 *     force:true overrides the volume/rate gates (logged as override) but
 *     NEVER the profit gate: contribution_margin_usd must be > 0 to promote
 *     at all — "profitable from day 1" is enforced here, not in doctrine.
 *   demote — always allowed, one tap (L3→L2→L1).
 *   pause / resume — circuit breaker: flips acquisition_paused_lanes and
 *     (de)activates the lane's n8n workflows (acquisition_lane_workflows map,
 *     same n8n management API as api/automations/*). Resume with MTD spend
 *     still over cap requires acknowledge_overage:true.
 *   set_budget — writes acquisition_budgets[lane]. Paid/ad budget > 0 is
 *     rejected while the lane has zero attributed revenue (Gate 4), and the
 *     sum of all lanes' paid budgets is capped at paid_global_cap_usd.
 */

type Level = 'L1' | 'L2' | 'L3'

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

async function audit(event_type: string, target: string, display_message: string, details: unknown) {
  const { error } = await supabase.from('audit_log').insert({
    event_type, actor: 'krish', target, display_message, details: JSON.stringify(details),
  })
  if (error) console.warn('[acquisition/lanes] audit_log failed:', error.message)
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const slugParam = req.query?.slug
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam
  if (!slug) return res.status(400).json({ ok: false, error: 'lane slug required' })

  const [statsQ, econQ, budgets, paused, lanesCfg] = await Promise.all([
    supabase.from('lane_autonomy_stats').select('*').eq('lane', slug).maybeSingle(),
    supabase.from('lane_economics').select('*').eq('lane', slug).maybeSingle(),
    readConfig('acquisition_budgets'),
    readConfig('acquisition_paused_lanes'),
    readConfig('acquisition_lanes'),
  ])
  if (!Array.isArray(lanesCfg) || !lanesCfg.includes(slug)) {
    return res.status(404).json({ ok: false, error: `'${slug}' is not an acquisition lane` })
  }
  const stats = statsQ.data
  const econ = econQ.data
  if (!stats) return res.status(404).json({ ok: false, error: 'lane not found in stats view' })

  const laneBudget = (budgets && (budgets[slug] || budgets.default)) || { daily_usd: 5, monthly_usd: 50 }
  const pausedEntry = paused?.[slug] || null

  if (req.method === 'GET') {
    const { data: costs } = await supabase
      .from('lane_costs')
      .select('*')
      .eq('lane', slug)
      .order('created_at', { ascending: false })
      .limit(50)
    return res.status(200).json({
      ok: true,
      lane: slug,
      stats,
      economics: econ,
      budget: laneBudget,
      paused: pausedEntry,
      costs: costs || [],
      paid_global_cap_usd: budgets?.paid_global_cap_usd ?? 500,
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as {
    action?: string
    reason?: string
    force?: boolean
    acknowledge_overage?: boolean
    daily_usd?: number
    monthly_usd?: number
    paid_monthly_usd?: number
    voice_profile?: Record<string, unknown>
  }
  const nowIso = new Date().toISOString()
  const level: Level = (stats.autonomy_level as Level) || 'L1'
  const history: any[] = Array.isArray(stats.autonomy_history) ? stats.autonomy_history : []

  const applyLevel = async (to: Level, reason: string, override: boolean) => {
    const event = { at: nowIso, actor: 'krish', from: level, to, reason, ...(override ? { override: true } : {}) }
    const { error } = await supabase
      .from('venture_registry')
      .update({ autonomy_level: to, autonomy_history: [...history, event] })
      .eq('slug', slug)
    if (error) throw new Error(error.message)
    await audit(
      to > level ? 'krish_promote_lane_autonomy' : 'krish_demote_lane_autonomy',
      slug,
      `Krish ${to > level ? 'promoted' : 'demoted'} ${slug} autonomy ${level} → ${to}${override ? ' (override)' : ''}`,
      event,
    )
    return event
  }

  try {
    switch (body.action) {
      case 'demote': {
        if (level === 'L1') return res.status(400).json({ ok: false, error: 'already at L1 — nothing below' })
        const to: Level = level === 'L3' ? 'L2' : 'L1'
        const event = await applyLevel(to, body.reason || 'krish_manual_demotion', false)
        return res.status(200).json({ ok: true, autonomy_level: to, event })
      }

      case 'promote': {
        if (level === 'L3') return res.status(400).json({ ok: false, error: 'already at L3 — nothing above' })
        const to: Level = level === 'L1' ? 'L2' : 'L3'

        // Hard profit gate — force cannot bypass. A lane that loses money
        // does not get MORE autonomy to spend.
        const margin = Number(econ?.contribution_margin_usd ?? 0)
        if (!(margin > 0)) {
          return res.status(422).json({
            ok: false,
            error: 'profit gate: contribution margin must be positive to promote autonomy',
            criteria: [{
              key: 'profit',
              label: 'Contribution margin > $0 (MTD)',
              met: false,
              actual: margin,
              required: '> 0',
              overridable: false,
            }],
          })
        }

        // Mechanical volume/quality gates (overridable with force:true).
        const approved30 = Number(stats.approved_30d || 0)
        const rr30 = stats.rejection_rate_30d == null ? null : Number(stats.rejection_rate_30d)
        const criteria: Array<{ key: string; label: string; met: boolean; actual: unknown; required: string; overridable: boolean }> = []
        if (to === 'L2') {
          criteria.push(
            { key: 'volume', label: '≥ 20 approved sends in 30d', met: approved30 >= 20, actual: approved30, required: '>= 20', overridable: true },
            { key: 'rejection', label: 'Rejection rate < 5% (30d)', met: rr30 != null && rr30 < 0.05, actual: rr30, required: '< 0.05', overridable: true },
          )
        } else {
          const l2Since = [...history].reverse().find(h => h?.to === 'L2')?.at
          const daysAtL2 = l2Since ? (Date.now() - new Date(String(l2Since)).getTime()) / 86_400_000 : 0
          criteria.push(
            { key: 'volume', label: '≥ 50 approved sends in 30d', met: approved30 >= 50, actual: approved30, required: '>= 50', overridable: true },
            { key: 'rejection', label: 'Rejection rate < 2% (30d)', met: rr30 != null && rr30 < 0.02, actual: rr30, required: '< 0.02', overridable: true },
            { key: 'tenure', label: '≥ 14 days at L2', met: daysAtL2 >= 14, actual: Math.round(daysAtL2 * 10) / 10, required: '>= 14', overridable: true },
          )
        }
        const unmet = criteria.filter(c => !c.met)
        if (unmet.length && !body.force) {
          return res.status(422).json({
            ok: false,
            error: 'promotion criteria not met',
            criteria,
          })
        }
        const event = await applyLevel(to, body.reason || (unmet.length ? 'krish_force_promotion' : 'criteria_met_promotion'), unmet.length > 0)
        return res.status(200).json({ ok: true, autonomy_level: to, event, criteria })
      }

      case 'pause': {
        const wfMap = (await readConfig('acquisition_lane_workflows')) || {}
        const workflowIds: string[] = Array.isArray(wfMap[slug]) ? wfMap[slug] : []
        const result = await setWorkflowsActive(workflowIds, false)
        const nextPaused = { ...(paused || {}), [slug]: { paused_at: nowIso, by: 'krish', reason: body.reason || 'manual_pause', workflows: result.ok } }
        const cfgErr = await writeConfig('acquisition_paused_lanes', nextPaused)
        if (cfgErr) throw new Error(cfgErr)
        await audit('krish_pause_lane', slug, `Krish paused acquisition lane ${slug}`, { reason: body.reason, workflows: result })
        return res.status(200).json({ ok: true, paused: nextPaused[slug], workflows: result })
      }

      case 'resume': {
        if (!pausedEntry) return res.status(400).json({ ok: false, error: 'lane is not paused' })
        const spentMtd = Number(econ?.total_cost_mtd ?? 0)
        const overCap = spentMtd >= Number(laneBudget.monthly_usd || 0)
        if (overCap && !body.acknowledge_overage) {
          return res.status(422).json({
            ok: false,
            error: `MTD spend $${spentMtd} still at/over the $${laneBudget.monthly_usd} cap — pass acknowledge_overage:true (or raise the budget) to resume anyway`,
          })
        }
        // Resume only the workflows THIS breaker paused — never the exec
        // governor's, never anything outside our recorded set.
        const workflowIds: string[] = Array.isArray(pausedEntry.workflows) ? pausedEntry.workflows : []
        const result = await setWorkflowsActive(workflowIds, true)
        const nextPaused = { ...(paused || {}) }
        delete nextPaused[slug]
        const cfgErr = await writeConfig('acquisition_paused_lanes', nextPaused)
        if (cfgErr) throw new Error(cfgErr)
        await audit('krish_resume_lane', slug, `Krish resumed acquisition lane ${slug}`, { acknowledge_overage: !!body.acknowledge_overage, workflows: result })
        return res.status(200).json({ ok: true, workflows: result })
      }

      case 'set_budget': {
        const daily = body.daily_usd != null ? Number(body.daily_usd) : Number(laneBudget.daily_usd || 0)
        const monthly = body.monthly_usd != null ? Number(body.monthly_usd) : Number(laneBudget.monthly_usd || 0)
        const paid = body.paid_monthly_usd != null ? Number(body.paid_monthly_usd) : Number(laneBudget.paid_monthly_usd || 0)
        if ([daily, monthly, paid].some(n => !Number.isFinite(n) || n < 0)) {
          return res.status(400).json({ ok: false, error: 'budgets must be non-negative numbers' })
        }
        // Gate 4: paid spend only after owned/earned revenue exists on the lane.
        if (paid > 0 && !(Number(econ?.attributed_mrr ?? 0) > 0)) {
          return res.status(422).json({
            ok: false,
            error: 'Gate 4: paid budget requires attributed revenue on this lane first (owned/earned before paid)',
          })
        }
        const cap = Number(budgets?.paid_global_cap_usd ?? 500)
        const otherPaid = Object.entries(budgets || {})
          .filter(([k]) => k !== slug && k !== 'default' && k !== 'paid_global_cap_usd')
          .reduce((s, [, v]: [string, any]) => s + (Number(v?.paid_monthly_usd) || 0), 0)
        if (otherPaid + paid > cap) {
          return res.status(422).json({
            ok: false,
            error: `Gate 4: total paid budget would be $${otherPaid + paid}/mo — the global cap is $${cap}/mo`,
          })
        }
        const nextBudgets = { ...(budgets || {}), [slug]: { daily_usd: daily, monthly_usd: monthly, paid_monthly_usd: paid } }
        const cfgErr = await writeConfig('acquisition_budgets', nextBudgets)
        if (cfgErr) throw new Error(cfgErr)
        await audit('krish_set_lane_budget', slug, `Krish set ${slug} budget: $${daily}/day, $${monthly}/mo, paid $${paid}/mo`, nextBudgets[slug])
        return res.status(200).json({ ok: true, budget: nextBudgets[slug] })
      }

      case 'set_voice': {
        // Amend the lane's playbook (voice / ICP / strategy / never_say) in
        // place — merged over the existing profile so partial edits are safe.
        if (!body.voice_profile || typeof body.voice_profile !== 'object') {
          return res.status(400).json({ ok: false, error: 'voice_profile object required' })
        }
        const { data: v } = await supabase
          .from('venture_registry')
          .select('voice_profile')
          .eq('slug', slug)
          .maybeSingle()
        const merged = { ...(v?.voice_profile || {}), ...body.voice_profile }
        const { error } = await supabase
          .from('venture_registry')
          .update({ voice_profile: merged })
          .eq('slug', slug)
        if (error) throw new Error(error.message)
        await audit('krish_amend_lane_voice', slug, `Krish amended the ${slug} lane playbook`, merged)
        return res.status(200).json({ ok: true, voice_profile: merged })
      }

      default:
        return res.status(400).json({ ok: false, error: "action must be one of promote|demote|pause|resume|set_budget|set_voice" })
    }
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'lane action failed' })
  }
}
