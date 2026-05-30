import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// GET /api/objectives/:id
// Returns the objective tree via the get_objective_tree RPC:
// { ok: true, tree: { objective, milestones[ {..., task_count, tasks_done } ] } }

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const { data, error } = await supabase.rpc('get_objective_tree', { p_goal_id: id })
  if (error) return res.status(500).json({ ok: false, error: error.message })
  if (!data) return res.status(404).json({ ok: false, error: 'objective not found' })

  return res.json({ ok: true, tree: data })
}
