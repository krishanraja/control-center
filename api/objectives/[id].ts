import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { syncNorthStar } from '../_northStar.js'

// GET   /api/objectives/:id
//   Returns the objective tree via get_objective_tree:
//   { ok, tree: { objective, milestones[ {..., owner_split, is_accomplishment,
//                 auto_executable_pct, task_count, tasks_done } ], contributions[] } }
//
// PATCH /api/objectives/:id
//   The objective altitude is now editable (Phase 6). Two shapes:
//     { action: 'reorder', priority }                        -- reprioritize only
//     { title?, priority?, definition_of_done?, why_now?,    -- edit the objective
//       target_horizon?, primary_kpi?, secondary_kpi?,
//       status?, is_auto?, objective_kind?,
//       feedback?: { reason_code?, reason_text?, meta? } }
//   When the title changes (a reshape), an objective-altitude feedback_queue row
//   is written so Vera/Marcus learn from it -- using the caller-supplied
//   feedback directive if present (e.g. marcus_objective_releveled from the voice
//   flow), else the canonical marcus_objective_amended. Mirrors api/goals.ts.

const ALLOWED_STATUS = new Set(['proposed', 'active', 'paused', 'done', 'dropped'])

interface PatchBody {
  action?: 'reorder' | 'edit'
  title?: string
  priority?: number | null
  definition_of_done?: string | null
  why_now?: string | null
  target_horizon?: string | null
  primary_kpi?: string | null
  secondary_kpi?: string | null
  status?: string
  is_auto?: boolean
  objective_kind?: string | null
  feedback?: { reason_code?: string; reason_text?: string | null; meta?: Record<string, unknown> } | null
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  if (req.method === 'GET') {
    const { data, error } = await supabase.rpc('get_objective_tree', { p_goal_id: id })
    if (error) return res.status(500).json({ ok: false, error: error.message })
    if (!data) return res.status(404).json({ ok: false, error: 'objective not found' })
    return res.json({ ok: true, tree: data })
  }

  if (req.method === 'PATCH') {
    const body = (req.body || {}) as PatchBody

    const { data: existing, error: exErr } = await supabase
      .from('goals')
      .select('id, title, priority, venture, objective_kind, source, status, horizon')
      .eq('id', id)
      .single()
    if (exErr) return res.status(500).json({ ok: false, error: exErr.message })
    if (!existing) return res.status(404).json({ ok: false, error: 'objective not found' })

    const patch: Record<string, unknown> = {}

    if (typeof body.priority === 'number' || body.priority === null) patch.priority = body.priority

    if (body.action !== 'reorder') {
      if (body.title !== undefined) {
        const t = str(body.title, 200)
        if (!t) return res.status(400).json({ ok: false, error: 'title cannot be empty' })
        patch.title = t
      }
      if (body.definition_of_done !== undefined) patch.definition_of_done = str(body.definition_of_done, 1000)
      if (body.why_now !== undefined) patch.why_now = str(body.why_now, 1000)
      if (body.target_horizon !== undefined) patch.target_horizon = str(body.target_horizon, 200)
      if (body.primary_kpi !== undefined) patch.primary_kpi = str(body.primary_kpi, 500)
      if (body.secondary_kpi !== undefined) patch.secondary_kpi = str(body.secondary_kpi, 500)
      if (body.objective_kind !== undefined) patch.objective_kind = str(body.objective_kind, 100)
      if (typeof body.is_auto === 'boolean') patch.is_auto = body.is_auto
      if (body.status !== undefined) {
        if (!ALLOWED_STATUS.has(body.status)) return res.status(400).json({ ok: false, error: 'invalid status' })
        patch.status = body.status
        if (body.status === 'active' && existing.status !== 'active') patch.activated_at = new Date().toISOString()
        if (body.status === 'done') patch.completed_at = new Date().toISOString()
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: 'no fields to patch' })
    }

    const { data, error } = await supabase
      .from('goals')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(500).json({ ok: false, error: error.message })

    // Retitling or retiring an OS goal changes what the north_star mirror says.
    if (existing.horizon === 'os') await syncNorthStar()

    // Objective-altitude learning signal on a title reshape. Caller can override
    // the reason_code (the voice flow sends marcus_objective_releveled when it
    // promoted/demoted an objective); otherwise it's a plain amendment.
    const titleChanged = typeof patch.title === 'string' && patch.title !== existing.title
    if (titleChanged || (body.feedback && body.feedback.reason_code)) {
      await supabase.from('feedback_queue').insert({
        source_table: 'goals',
        source_id: id,
        agent_id: 'marcus',
        original_agent: 'marcus',
        original_item_id: id,
        vote: -1,
        reason_code: body.feedback?.reason_code || 'marcus_objective_amended',
        reason_text: body.feedback?.reason_text ?? (typeof patch.title === 'string' ? patch.title : null),
        meta: {
          original_title: existing.title,
          new_title: typeof patch.title === 'string' ? patch.title : existing.title,
          venture: existing.venture,
          objective_kind: existing.objective_kind,
          source: existing.source,
          captured_at: new Date().toISOString(),
          ...(body.feedback?.meta || {}),
        },
        status: 'pending',
      })
    }

    return res.json({ ok: true, objective: data })
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
