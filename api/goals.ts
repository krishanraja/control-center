import type { VercelRequest, VercelResponse } from '@vercel/node'
import { weekOfLabel } from './_week.js'
import { supabase } from './_supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    const [goalsRes, configRes, tasksRes] = await Promise.all([
      // This endpoint backs the WEEKLY surface only. `horizon` is the
      // discriminator (canon §0a.2): without it, select('*') returned every
      // goal at every altitude and WeeklyGoals rendered venture objectives
      // as weekly goals, which is why it never felt like one source of truth.
      supabase.from('goals').select('*').eq('horizon', 'weekly').order('created_at'),
      supabase.from('system_config').select('*').in('key', ['north_star', 'team_focus']),
      supabase.from('tasks').select('id, title, status, agent, weekly_goal_id').not('weekly_goal_id', 'is', null)
    ])

    const config: Record<string, string> = {}
    for (const c of configRes.data || []) config[c.key] = c.value

    const goals = goalsRes.data || []
    const allTasks = tasksRes.data || []
    
    // Attach tasks and auto-calculate progress
    for (const g of goals) {
      const gTasks = allTasks.filter(t => t.weekly_goal_id === g.id)
      g.tasks = gTasks
      if (gTasks.length > 0) {
        const completed = gTasks.filter(t => t.status === 'Complete' || t.status === 'Closed' || t.status === 'Done').length
        g.calculated_progress = Math.round((completed / gTasks.length) * 100)
      } else {
        g.calculated_progress = g.progress || 0 // fallback
      }
    }

    return res.json({
      goals,
      north_star: config.north_star || '',
      team_focus: config.team_focus || '',
      week_of: weekOfLabel(),
      updated_at: new Date().toISOString()
    })
  }

  
  if (req.method === 'POST') {
    const body = req.body || {}
    // goals.id is TEXT per the schema audit — we keep generating a
    // namespaced id when the caller doesn't supply one, but we accept
    // an explicit `id` so callers (e.g. seed scripts) can set their own.
    const generatedId = 'goal-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
    const newGoal: Record<string, any> = {
      id: typeof body.id === 'string' && body.id.length > 0 ? body.id : generatedId,
      title: body.title || 'New Goal',
      current: body.current || '',
      progress: 0,
      notes: '',
      status: 'active',
      week_of: weekOfLabel(),
    }
    // Optional fields — only set when the caller provided them so we
    // don't overwrite column defaults with nulls.
    if (body.owner !== undefined) newGoal.owner = body.owner
    if (body.target !== undefined) newGoal.target = body.target
    if (body.weekly_goal_id !== undefined) newGoal.weekly_goal_id = body.weekly_goal_id

    // Anything created here IS a weekly goal. Stamping the horizon at the
    // point of creation is what stops orphans forming: a row with no
    // horizon belongs to no surface and shows up on all of them.
    newGoal.horizon = 'weekly'
    if (body.parent_id !== undefined) newGoal.parent_id = body.parent_id

    const { error } = await supabase.from('goals').insert(newGoal)
    if (error) return res.status(500).json({ ok: false, error: error.message })

    return res.json({ ok: true, id: newGoal.id })
  }

  if (req.method === 'DELETE') {
    // Accept goalId from query string OR body so curl/REST clients and
    // the fetch() caller can both hit this without friction.
    const q = req.query || {}
    const b = req.body || {}
    const goalId =
      (typeof q.goalId === 'string' && q.goalId) ||
      (typeof q.id === 'string' && q.id) ||
      (typeof b.goalId === 'string' && b.goalId) ||
      (typeof b.id === 'string' && b.id) ||
      ''
    if (!goalId) {
      return res.status(400).json({ ok: false, error: 'goalId is required (query or body)' })
    }
    const { error } = await supabase.from('goals').delete().eq('id', goalId)
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, deleted: goalId })
  }

  if (req.method === 'PATCH') {
    const body = req.body || {}

    if (body.team_focus !== undefined) {
      await supabase.from('system_config').upsert({ key: 'team_focus', value: body.team_focus, updated_at: new Date().toISOString() })
    }
    if (body.north_star !== undefined) {
      await supabase.from('system_config').upsert({ key: 'north_star', value: body.north_star, updated_at: new Date().toISOString() })
    }

    if (body.goalId) {
      // Pre-fetch so we can detect an *amendment* to one of Marcus's nominated
      // goals: we need the prior title to compare against and the goal's source
      // (provenance survives acceptance — see api/objectives/[id]/nominate-accept.ts).
      const { data: existing } = await supabase
        .from('goals')
        .select('title, current, source, venture, objective_kind')
        .eq('id', body.goalId)
        .single()

      const updates: any = { updated_at: new Date().toISOString() }
      if (body.title !== undefined) updates.title = body.title
      if (body.current !== undefined) updates.current = body.current
      if (body.progress !== undefined) updates.progress = Math.max(0, Math.min(100, Number(body.progress)))
      if (body.notes !== undefined) updates.notes = body.notes
      // Retiring a goal is a status change, never a DELETE. Canon Rule A wants
      // decay reversible, and the row carries history the learning signals and
      // the chronicle hang off. Whitelisted so a client cannot invent a status
      // that no surface filters on, which would make the goal invisible
      // everywhere and unrecoverable from the UI.
      if (body.status !== undefined) {
        // Mirrors goals_status_objective_check exactly. 'archived' is NOT in it:
        // sending it returned a raw Postgres constraint error to the UI. Keep
        // these in step with the constraint, or the whitelist just moves the
        // failure one layer down.
        const ALLOWED_STATUS = new Set(['proposed', 'active', 'paused', 'done', 'dropped'])
        if (!ALLOWED_STATUS.has(String(body.status))) {
          return res.status(400).json({ ok: false, error: `unknown status '${body.status}'` })
        }
        updates.status = body.status
      }
      const { error } = await supabase.from('goals').update(updates).eq('id', body.goalId)
      if (error) {
        return res.status(500).json({ ok: false, error: error.message })
      }

      // Amendment-as-feedback: reshaping the *title* of a Marcus-nominated goal
      // is an objective-altitude override that should feed his learning loop.
      // Mirrors the override shape in api/objectives/[id]/nominate-reject.ts so
      // Vera's weekly aggregation clusters it (reason_code != 'other' => >= 2
      // threshold). Progress/notes/current edits and edits to krish_declared
      // goals write nothing: those self-authored goals reach Marcus via synthesis
      // grounding, not the correction loop. Best-effort (matches calibrate.ts):
      // the goal edit already succeeded, so a feedback-write hiccup is swallowed.
      const newTitle = typeof body.title === 'string' ? body.title.trim() : ''
      if (existing && existing.source === 'marcus_nominated' && newTitle.length > 0 && newTitle !== (existing.title || '')) {
        await supabase.from('feedback_queue').insert({
          source_table: 'goals',
          source_id: body.goalId,
          agent_id: 'marcus',
          original_agent: 'marcus',
          original_item_id: body.goalId,
          vote: -1,
          reason_code: 'marcus_objective_amended',
          reason_text: newTitle,
          meta: {
            original_title: existing.title || null,
            new_title: newTitle,
            current: existing.current || null,
            venture: existing.venture || null,
            objective_kind: existing.objective_kind || null,
            source: existing.source,
            captured_at: new Date().toISOString(),
          },
          status: 'pending',
        })
      }
    }

    const { data: goals } = await supabase.from('goals').select('*').order('created_at')
    const { data: configs } = await supabase.from('system_config').select('*').in('key', ['north_star', 'team_focus'])
    const cfg: Record<string, string> = {}
    for (const c of configs || []) cfg[c.key] = c.value

    return res.json({
      ok: true,
      goals: { goals: goals || [], north_star: cfg.north_star || '', team_focus: cfg.team_focus || '', week_of: weekOfLabel() }
    })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
// deploy trigger Wed Apr 22 09:34:24 PM UTC 2026
