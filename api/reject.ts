import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { original_agent, original_item_id, rejection_reason } = req.body || {}
  if (!original_agent || !original_item_id || !rejection_reason) {
    return res.status(400).json({ error: 'original_agent, original_item_id, rejection_reason required' })
  }

  const { data, error } = await supabase
    .from('feedback_queue')
    .insert({
      original_agent,
      original_item_id: String(original_item_id),
      rejection_reason,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true, entry: data })
}
