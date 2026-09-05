import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { syncNorthStar } from '../_northStar.js'
import { gateGoal, type Horizon } from '../_goalGate.js'
import { logGoalChange } from '../_goals.js'
import { isJob } from '../_mission.js'

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
  /** Which of the five jobs of the OS this serves (api/_mission.ts). */
  job?: string | null
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

  // GET was removed 2026-08-20 with the venture_objective rung. It served the
  // rung's slice of `goals` to the retired Portfolio surfaces; its only caller
  // (useObjectives) died with them. GET /api/goals/ladder is the one read.
  if (req.method === 'GET') {
    return res.status(410).json({
      ok: false,
      error: 'GET /api/objectives is retired. Use GET /api/goals/ladder for the whole canon.',
    })
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
    if (body.job != null && !isJob(body.job)) {
      return res.status(400).json({ ok: false, error: `unknown job '${body.job}'` })
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
      job: body.job || null,
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
