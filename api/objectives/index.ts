import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

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
  /** Which rung of the ladder. Defaults to venture_objective. */
  horizon?: 'os' | 'mid_term' | 'weekly' | 'venture_objective'
  /** Required for every horizon except 'os': what this goal serves. */
  parent_id?: string | null
}

const ALLOWED_HORIZON = new Set(['os', 'mid_term', 'weekly', 'venture_objective'])
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

    const { data: countData } = await supabase.rpc('count_active_objectives')
    const active_count = typeof countData === 'number' ? countData : null

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
      // The ladder (canon §0a.2). Defaults to venture_objective because that is
      // what this endpoint historically created, but it can now create at ANY
      // altitude, which is what makes one-place-to-enter-a-goal true rather
      // than aspirational: before this, no UI could create an OS or mid-term
      // goal at all, so two of the four horizons were unreachable.
      horizon: ALLOWED_HORIZON.has(body.horizon as string)
        ? body.horizon
        : 'venture_objective',
      parent_id: body.parent_id || null,
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

    const { data, error } = await supabase
      .from('goals')
      .insert(row)
      .select()
      .single()
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, objective: data })
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
