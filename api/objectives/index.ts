import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { syncNorthStar } from '../_northStar.js'
import { gateGoal, type Horizon } from '../_goalGate.js'
import { logGoalChange } from '../_goals.js'

// Objective Layer, Phase 4.
// GET  /api/objectives           list active objectives (plus optional nominations)
// POST /api/objectives           create a Krish-declared objective
//
// List excludes the goals_archive_2026_04 table by definition (it is a
// separate table). Returns one row per objective with the columns the
// Home tab needs to render the strip + soft-cap warning.

interface CreateBody {
  id?: string
  title?: string
  venture?: string | null
  objective_kind?: string | null
  definition_of_done?: string | null
  why_now?: string | null
  target_horizon?: string | null
  primary_kpi?: string | null
  secondary_kpi?: string | null
  is_auto?: boolean
  priority?: number | null
  status?: 'proposed' | 'active' | 'paused' | 'done' | 'dropped'
  concept_id?: string | null
  /** Which rung of the ladder. Required: 'os' or 'weekly'. */
  horizon?: 'os' | 'weekly'
  /** Save despite a failing gate verdict. Recorded, never silent. */
  override?: boolean
  /** Required for every horizon except 'os': what this goal serves. */
  parent_id?: string | null
}

const ALLOWED_HORIZON = new Set(['os', 'weekly'])
const ALLOWED_STATUS = new Set(['proposed', 'active', 'paused', 'done', 'dropped'])

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    const statusParam = typeof req.query.status === 'string' ? req.query.status : 'active'
    const includeNominations = req.query.include_nominations === '1' || req.query.include_nominations === 'true'

    let q = supabase
      .from('goals')
      .select('id, title, venture, objective_kind, status, priority, definition_of_done, why_now, target_horizon, primary_kpi, secondary_kpi, is_auto, source, activated_at, completed_at, created_at, updated_at, horizon, parent_id')
      // ONE table, one meaning per surface. `horizon` is the discriminator
      // (canon §0a.2). Without it this returned every goal at every altitude,
      // so Objectives and WeeklyGoals each rendered the other's rows.
      // Legacy rows have horizon NULL and are treated as venture objectives,
      // which is what they historically were.
      .or('horizon.eq.venture_objective,horizon.is.null')
      .order('priority', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    if (statusParam === 'all') {
      // no filter
    } else if (includeNominations) {
      q = q.in('status', ['active', 'proposed'])
    } else {
      q = q.eq('status', statusParam)
    }

    const { data: rows, error } = await q
    if (error) return res.status(500).json({ ok: false, error: error.message })

    // Counted with the SAME horizon filter as the list above, not via the
    // count_active_objectives RPC. That RPC predates the horizon column and
    // counted every active goal, so entering a single OS goal made the Home
    // spine announce "1 active objective" while the objectives list was empty.
    // The count and the list must come from one predicate or they will drift
    // again the next time a horizon is added.
    const { count: activeCount } = await supabase
      .from('goals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .or('horizon.eq.venture_objective,horizon.is.null')
    const active_count = typeof activeCount === 'number' ? activeCount : null

    // Attach the count of Marcus-proposed (unratified) milestones per objective so
    // the Home altitude spine can flag Portfolio as needing attention without a
    // per-objective tree fetch. One grouped read over the returned goal ids.
    const ids = (rows || []).map(r => r.id)
    const proposedByGoal: Record<string, number> = {}
    if (ids.length > 0) {
      const { data: ms } = await supabase
        .from('milestones')
        .select('goal_id')
        .eq('status', 'proposed')
        .in('goal_id', ids)
      for (const m of ms || []) {
        const gid = (m as { goal_id: string }).goal_id
        proposedByGoal[gid] = (proposedByGoal[gid] || 0) + 1
      }
    }
    const objectives = (rows || []).map(r => ({
      ...r,
      proposed_milestone_count: proposedByGoal[r.id] || 0,
    }))

    return res.json({ ok: true, objectives, active_count, soft_cap: 10 })
  }

  if (req.method === 'POST') {
    const body = (req.body || {}) as CreateBody
    if (!body.id || typeof body.id !== 'string' || !body.id.trim()) {
      return res.status(400).json({ ok: false, error: 'id required (e.g. obj:venture:slug)' })
    }
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return res.status(400).json({ ok: false, error: 'title required' })
    }
    if (body.status && !ALLOWED_STATUS.has(body.status)) {
      return res.status(400).json({ ok: false, error: 'invalid status' })
    }
    const row: Record<string, unknown> = {
      id: body.id.trim(),
      title: body.title.trim(),
      venture: body.venture || null,
      objective_kind: body.objective_kind || null,
      definition_of_done: body.definition_of_done || null,
      why_now: body.why_now || null,
      target_horizon: body.target_horizon || null,
      primary_kpi: body.primary_kpi || null,
      secondary_kpi: body.secondary_kpi || null,
      is_auto: body.is_auto === true,
      priority: typeof body.priority === 'number' ? body.priority : null,
      concept_id: body.concept_id || null,
      status: body.status || 'active',
      created_by: 'krish',
      source: 'krish_declared',
      // The ladder (canon §0a.2), two rungs since the 2026-08-20 recompose.
      // Horizon is explicit: an endpoint that silently guesses the altitude is
      // how rows end up belonging to no surface.
      horizon: body.horizon,
      parent_id: body.parent_id || null,
    }
    if (!ALLOWED_HORIZON.has(body.horizon as string)) {
      return res.status(400).json({ ok: false, error: "horizon required: 'os' or 'weekly'" })
    }
    // A non-OS goal with no parent is an orphan and the whole point of the
    // ladder is that it cannot happen silently. goals_health flags these; here
    // we refuse to create one in the first place.
    if (row.horizon !== 'os' && !row.parent_id) {
      return res.status(400).json({
        ok: false,
        error: 'a ' + row.horizon + ' goal needs a parent_id: what does it serve?',
      })
    }
    if (row.status === 'active') row.activated_at = new Date().toISOString()

    // The gate runs HERE, not only in the editor. /api/goals/gate is a preview
    // for live feedback while typing; this is the enforcement point, so a
    // client that skipped the preview cannot smuggle an ungated goal in.
    //
    // It blocks rather than advises, because a goal that fails silently stays
    // failed: that is how north_star sat unmeasurable from April to August.
    // `override: true` still saves, and is recorded rather than waved through,
    // so repeated overrides of one dimension become evidence that the rubric
    // is wrong instead of a habit nobody can see.
    let parentTitle: string | null = null
    if (row.parent_id) {
      const { data: p } = await supabase.from('goals').select('title, horizon').eq('id', row.parent_id as string).maybeSingle()
      const parent = p as { title?: string; horizon?: string } | null
      if (!parent) {
        return res.status(400).json({ ok: false, error: 'parent_id does not name an existing goal' })
      }
      // A weekly goal serves an OS goal directly; there is no intermediate rung.
      if (row.horizon === 'weekly' && parent.horizon !== 'os') {
        return res.status(400).json({ ok: false, error: 'a weekly goal must serve an OS goal' })
      }
      parentTitle = parent.title ?? null
    }
    const verdict = await gateGoal(String(row.title), row.horizon as Horizon, {
      parentId: (row.parent_id as string | null) ?? null,
      parentTitle,
      venture: (row.venture as string | null) ?? null,
    })
    const overridden = body.override === true && verdict.verdict !== 'pass'
    if (verdict.verdict !== 'pass' && !overridden) {
      return res.status(422).json({ ok: false, error: 'goal_gate', gate: verdict })
    }
    row.gate_verdict = verdict
    row.gate_overridden = overridden

    const { data, error } = await supabase
      .from('goals')
      .insert(row)
      .select()
      .single()
    if (error) return res.status(500).json({ ok: false, error: error.message })

    // An override is the tuning signal for the rubric, so it is evidence, not
    // a shrug. Best-effort: the goal is already written, and losing the signal
    // must not lose the goal.
    if (overridden) {
      await supabase.from('learning_events').insert({
        event_type: 'rejection',
        source: 'manual',
        classification: 'krish_pattern',
        pattern_text: String(row.title),
        evidence: {
          horizon: row.horizon,
          verdict: verdict.verdict,
          issues: verdict.issues,
          suggested_tier: verdict.suggested_tier,
          model_used: verdict.model_used,
          goal_id: row.id,
        },
        recommended_target: 'api/_goalGate.ts',
        recommended_change: 'update',
        notes: 'Krish saved a goal the gate did not pass. Repeated overrides on one dimension mean the rubric is wrong, not the goal.',
      })
    }

    await logGoalChange('set', {
      id: String(row.id), title: String(row.title), horizon: String(row.horizon),
    }, { gate_overridden: overridden })

    // Keep system_config.north_star resolvable for readers outside this repo.
    if (row.horizon === 'os') await syncNorthStar()

    return res.json({ ok: true, objective: data })
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
