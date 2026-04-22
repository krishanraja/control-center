import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'POST') {
    const { agentId } = req.body || {}
    if (!agentId) return res.status(400).json({ error: 'agentId is required' })

    const { error } = await supabase.from('sync_queue').insert({ agent_id: agentId, status: 'pending' })
    if (error) return res.status(500).json({ error: error.message })

    return res.json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
