import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    const [goalsRes, configRes, tasksRes] = await Promise.all([
      supabase.from('goals').select('*').order('created_at'),
      supabase.from('system_config').select('*').in('key', ['north_star', 'team_focus', 'week_of']),
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
      week_of: config.week_of || '',
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
      week_of: 'Week of ' + new Date().toISOString().split('T')[0],
    }
    // Optional fields — only set when the caller provided them so we
    // don't overwrite column defaults with nulls.
    if (body.owner !== undefined) newGoal.owner = body.owner
    if (body.target !== undefined) newGoal.target = body.target
    if (body.weekly_goal_id !== undefined) newGoal.weekly_goal_id = body.weekly_goal_id

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
      const updates: any = { updated_at: new Date().toISOString() }
      if (body.title !== undefined) updates.title = body.title
      if (body.current !== undefined) updates.current = body.current
      if (body.progress !== undefined) updates.progress = Math.max(0, Math.min(100, Number(body.progress)))
      if (body.notes !== undefined) updates.notes = body.notes
      const { error } = await supabase.from('goals').update(updates).eq('id', body.goalId)
      if (error) {
        return res.status(500).json({ ok: false, error: error.message })
      }
    }

    const { data: goals } = await supabase.from('goals').select('*').order('created_at')
    const { data: configs } = await supabase.from('system_config').select('*').in('key', ['north_star', 'team_focus', 'week_of'])
    const cfg: Record<string, string> = {}
    for (const c of configs || []) cfg[c.key] = c.value

    return res.json({
      ok: true,
      goals: { goals: goals || [], north_star: cfg.north_star || '', team_focus: cfg.team_focus || '', week_of: cfg.week_of || '' }
    })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
// deploy trigger Wed Apr 22 09:34:24 PM UTC 2026
