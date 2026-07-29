import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { resolveTz, ymdIn, shiftYmd } from '../_timezone.js'

// GET /api/daily-focus/today
//   Returns { today_row, carry_over_row | null }.
//   carry_over_row is yesterday's row if its status is not 'complete'.



export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ ok: false, error: 'Method not allowed' })

  // The operator's civil day, not UTC. focus_date is written by the client on
  // the same clock, so both ends must resolve it the same way.
  const tz = await resolveTz(req)
  const todayIso = ymdIn(new Date(), tz)
  const yesterdayIso = shiftYmd(todayIso, -1)

  const [todayRes, yRes] = await Promise.all([
    supabase.from('daily_focus').select('*').eq('focus_date', todayIso).maybeSingle(),
    supabase.from('daily_focus').select('*').eq('focus_date', yesterdayIso).maybeSingle(),
  ])

  if (todayRes.error && todayRes.error.code !== 'PGRST116') {
    return res.status(500).json({ ok: false, error: todayRes.error.message })
  }

  const today_row = todayRes.data || null
  const yRow = yRes.data
  const carry_over_row = yRow && yRow.status !== 'complete' ? yRow : null

  return res.json({ ok: true, today_row, carry_over_row })
}
