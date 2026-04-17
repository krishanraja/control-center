import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { agent } = req.body || {}
  if (!agent || typeof agent !== 'string') {
    return res.status(400).json({ error: 'agent (string) required' })
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      agent,
      title: 'Manual trigger',
      status: 'active',
      source: 'manual',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true, task: data })
}
