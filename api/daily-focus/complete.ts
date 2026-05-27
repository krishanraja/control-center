import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// POST /api/daily-focus/complete
//   Body: { date, target_num }
//   Calls the mark_target_complete RPC. Idempotent.

interface Body {
  date?: string
  target_num?: number
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as Body
  if (!body.date || !isYmd(body.date))                    return res.status(400).json({ ok: false, error: 'date must be YYYY-MM-DD' })
  if (![1, 2, 3].includes(Number(body.target_num)))       return res.status(400).json({ ok: false, error: 'target_num must be 1, 2, or 3' })

  const { data, error } = await supabase.rpc('mark_target_complete', {
    p_date: body.date,
    p_target_num: body.target_num,
  })
  if (error) return res.status(500).json({ ok: false, error: error.message })
  return res.json({ ok: true, result: data })
}
