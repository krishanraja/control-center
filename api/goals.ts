import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    const [goalsRes, configRes] = await Promise.all([
      supabase.from('goals').select('*').order('created_at'),
      supabase.from('system_config').select('*').in('key', ['north_star', 'team_focus', 'week_of'])
    ])

    const config: Record<string, string> = {}
    for (const c of configRes.data || []) config[c.key] = c.value

    return res.json({
      goals: goalsRes.data || [],
      north_star: config.north_star || '',
      team_focus: config.team_focus || '',
      week_of: config.week_of || '',
      updated_at: new Date().toISOString()
    })
  }

  
  if (req.method === 'POST') {
    const body = req.body || {}
    const newGoal = {
      id: 'goal-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      title: body.title || 'New Goal',
      current: body.current || '',
      progress: 0,
      notes: '',
      status: 'active',
      week_of: 'Week of ' + new Date().toISOString().split('T')[0]
    }
    const { error } = await supabase.from('goals').insert(newGoal)
    if (error) return res.status(500).json({ ok: false, error: error.message })
    
    return res.json({ ok: true })
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
