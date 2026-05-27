import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// GET /api/tasks-inbox/digest
// Returns last-7-day counts by status, used by the Sunday Telegram digest.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const since = new Date(Date.now() - 7 * 86400_000).toISOString()
  const { data, error } = await supabase
    .from('tasks_inbox')
    .select('status')
    .gte('captured_at', since)
  if (error) return res.status(500).json({ ok: false, error: error.message })

  const counts: Record<string, number> = {
    raw: 0,
    classifying: 0,
    needs_clarification: 0,
    routing: 0,
    in_flight: 0,
    needs_krish: 0,
    done: 0,
    archived: 0,
    failed: 0,
  }
  let total = 0
  for (const row of data || []) {
    const s = (row as { status?: string }).status || 'raw'
    counts[s] = (counts[s] ?? 0) + 1
    total += 1
  }

  return res.json({ ok: true, since, total, counts })
}
