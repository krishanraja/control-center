import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { directionSpine } from '../../_direction.js'

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
    const [{ data: costs }, { data: directions }] = await Promise.all([
      supabase.from('lane_costs').select('*').eq('lane', slug)
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('lane_directions').select('*').eq('lane', slug)
        .order('version', { ascending: false }).limit(20),
    ])
    const dirRows = directions || []
    return res.status(200).json({
      ok: true,
      lane: slug,
      stats,
      economics: econ,
      budget: laneBudget,
      paused: pausedEntry,
      costs: costs || [],
      paid_global_cap_usd: budgets?.paid_global_cap_usd ?? 500,
      direction_locked: dirRows.find((d: any) => d.status === 'locked') || null,
      direction_draft: dirRows.find((d: any) => d.status === 'draft') || null,
      direction_history: dirRows,
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
    direction?: Record<string, unknown>  // draft fields for direction_draft
    version?: number                      // target version for direction_rollback
    context?: string                      // surface for direction_preview
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

      case 'direction_draft': {
        // Create or update the lane's DRAFT direction. Never touches the locked
        // version — Krish edits freely, then locks. Reuses the existing draft
        // if one exists, else opens a new draft at max(version)+1.
        const d = body.direction
        if (!d || typeof d !== 'object') {
          return res.status(400).json({ ok: false, error: 'direction object required' })
        }
        const { data: existing } = await supabase
          .from('lane_directions')
          .select('id, version, status')
          .eq('lane', slug)
          .order('version', { ascending: false })
        const rows = existing || []
        const draft = rows.find((r: any) => r.status === 'draft')
        const maxV = rows.reduce((m: number, r: any) => Math.max(m, r.version), 0)
        const fields = {
          positioning: (d as any).positioning ?? null,
          messaging_pillars: (d as any).messaging_pillars ?? [],
          offers: (d as any).offers ?? [],
          icp: (d as any).icp ?? null,
          voice: (d as any).voice ?? null,
          never_say: (d as any).never_say ?? [],
          creative_direction: (d as any).creative_direction ?? {},
          channel_priorities: (d as any).channel_priorities ?? [],
          notes: (d as any).notes ?? null,
          updated_at: nowIso,
        }
        if (draft) {
          const { error } = await supabase.from('lane_directions').update(fields).eq('id', draft.id)
          if (error) throw new Error(error.message)
          await audit('krish_edit_direction_draft', slug, `Krish edited the ${slug} direction draft v${draft.version}`, { version: draft.version })
          return res.status(200).json({ ok: true, version: draft.version, status: 'draft' })
        }
        const { data: created, error } = await supabase
          .from('lane_directions')
          .insert({ lane: slug, version: maxV + 1, status: 'draft', ...fields })
          .select('version')
          .single()
        if (error) throw new Error(error.message)
        await audit('krish_open_direction_draft', slug, `Krish opened ${slug} direction draft v${maxV + 1}`, { version: maxV + 1 })
        return res.status(200).json({ ok: true, version: created.version, status: 'draft' })
      }

      case 'direction_preview': {
        // Render the DRAFT (or current locked) direction into a sample
        // touchpoint so Krish sees the direction rendered before committing.
        const spine = await directionSpine(slug, body.context || 'a short nurture email')
        if (!spine) return res.status(404).json({ ok: false, error: 'no direction for this lane' })
        // Use the draft if present, else the resolved (locked/fallback) one.
        const { data: draftRow } = await supabase
          .from('lane_directions').select('*').eq('lane', slug).eq('status', 'draft').maybeSingle()
        const dir = (draftRow as any) || spine.direction
        return res.status(200).json({ ok: true, system_prompt: spine.prompt, direction_version: dir.version, using: draftRow ? 'draft' : dir.status })
      }

      case 'direction_lock': {
        // Promote the draft to the single locked version. Supersede the old
        // locked row, fire the propagation cascade, and audit. This is the act
        // that makes the direction canonical for every downstream generator.
        const { data: draftRow } = await supabase
          .from('lane_directions').select('*').eq('lane', slug).eq('status', 'draft').maybeSingle()
        if (!draftRow) return res.status(409).json({ ok: false, error: 'no draft to lock — edit a draft first' })
        // Conformance self-check: the locked direction must not itself contain
        // a personal-brand reference in its authored copy.
        const authoredBlob = [draftRow.positioning, draftRow.voice, draftRow.icp].filter(Boolean).join(' ')
        if (/\bkrish\b/i.test(authoredBlob)) {
          return res.status(422).json({ ok: false, error: 'direction references a personal brand (Krish) — the system must run product-brand only' })
        }
        const { error: supErr } = await supabase
          .from('lane_directions').update({ status: 'superseded', updated_at: nowIso })
          .eq('lane', slug).eq('status', 'locked')
        if (supErr) throw new Error(supErr.message)
        const { error: lockErr } = await supabase
          .from('lane_directions')
          .update({ status: 'locked', locked_at: nowIso, locked_by: 'krish', updated_at: nowIso })
          .eq('id', draftRow.id)
        if (lockErr) throw new Error(lockErr.message)
        await audit('krish_lock_direction', slug, `Krish locked ${slug} direction v${draftRow.version}`, { version: draftRow.version })

        // Cascade: flag queued sends generated from an older direction for
        // regeneration (they re-enter the approval queue), and count them.
        const { data: staleSends } = await supabase
          .from('acquisition_sends')
          .select('id')
          .eq('lane', slug)
          .eq('status', 'queued')
          .or(`direction_version.is.null,direction_version.lt.${draftRow.version}`)
        const staleIds = (staleSends || []).map((s: any) => s.id)
        if (staleIds.length) {
          await supabase.from('acquisition_sends')
            .update({ status: 'stale_direction' })
            .in('id', staleIds)
        }
        // Fire the propagation webhook (best-effort; the scheduler also reads
        // the locked direction on its next run).
        let cascaded = false
        try {
          const hook = process.env.N8N_DIRECTION_PROPAGATION_WEBHOOK_URL
            || 'https://krishraja10101.app.n8n.cloud/webhook/direction-propagation'
          const r = await fetch(hook, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lane: slug, version: draftRow.version, stale_sends: staleIds.length }),
          })
          cascaded = r.ok
        } catch { /* scheduler picks it up regardless */ }

        // Summary card for the decisions inbox.
        await supabase.from('tasks').insert({
          id: `direction-lock-${slug}-v${draftRow.version}`,
          title: `Direction v${draftRow.version} locked for ${slug}`,
          description: `${staleIds.length} queued send${staleIds.length === 1 ? '' : 's'} flagged for regeneration against the new direction.`,
          agent: 'maya', status: 'waiting', priority: 'normal', workstream: 'direction',
          created: nowIso,
        }).then(({ error }) => { if (error) console.warn('[direction_lock] task insert:', error.message) })

        return res.status(200).json({ ok: true, version: draftRow.version, stale_sends: staleIds.length, cascaded })
      }

      case 'direction_rollback': {
        // Re-lock a prior version (supersede current locked, relock the target).
        if (body.version == null) return res.status(400).json({ ok: false, error: 'version required' })
        const { data: target } = await supabase
          .from('lane_directions').select('id, version, status')
          .eq('lane', slug).eq('version', body.version).maybeSingle()
        if (!target) return res.status(404).json({ ok: false, error: `no v${body.version} for this lane` })
        await supabase.from('lane_directions')
          .update({ status: 'superseded', updated_at: nowIso }).eq('lane', slug).eq('status', 'locked')
        const { error } = await supabase.from('lane_directions')
          .update({ status: 'locked', locked_at: nowIso, locked_by: 'krish', updated_at: nowIso })
          .eq('id', target.id)
        if (error) throw new Error(error.message)
        await audit('krish_rollback_direction', slug, `Krish rolled ${slug} direction back to v${target.version}`, { version: target.version })
        return res.status(200).json({ ok: true, version: target.version })
      }

      default:
        return res.status(400).json({ ok: false, error: "action must be one of promote|demote|pause|resume|set_budget|set_voice|direction_draft|direction_preview|direction_lock|direction_rollback" })
    }
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'lane action failed' })
  }
}
