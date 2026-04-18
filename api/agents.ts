import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')

  const { data: agents, error } = await supabase
    .from('agents')
    .select('*')
    .eq('active', true)
    .order('name')

  if (error) return res.status(500).json({ error: error.message })

  // Enrich with task counts per agent
  const { data: taskCounts } = await supabase
    .from('tasks')
    .select('agent, status')

  const agentStats: Record<string, { total: number; active: number; done: number; blocked: number }> = {}
  for (const t of taskCounts || []) {
    if (!t.agent) continue
    if (!agentStats[t.agent]) agentStats[t.agent] = { total: 0, active: 0, done: 0, blocked: 0 }
    agentStats[t.agent].total++
    if (t.status === 'done') agentStats[t.agent].done++
    else if (t.status === 'blocked') agentStats[t.agent].blocked++
    else if (['active', 'in_progress'].includes(t.status)) agentStats[t.agent].active++
  }

  const enriched = (agents || []).map(a => ({
    ...a,
    tasks: agentStats[a.id] || { total: 0, active: 0, done: 0, blocked: 0 }
  }))

  res.json({ agents: enriched, updated_at: new Date().toISOString() })
}
