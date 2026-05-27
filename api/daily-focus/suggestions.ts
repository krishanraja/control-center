import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// GET /api/daily-focus/suggestions
//   Returns { marcus_top_three, additional_candidates }.
//   marcus_top_three is the 3 cards Marcus produced on home_intelligence.
//   additional_candidates is the next 4 rows from decisions_waiting,
//   ordered by age_hours desc.

interface TopThreeCard {
  kind: string
  title: string
  why_now?: string
  action_label?: string
  action_kind?: string
  action_target_id?: string | null
  expires_at?: string | null
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback
  if (typeof raw === 'object') return raw as T
  try { return JSON.parse(raw as string) as T } catch { return fallback }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const [intelRes, decRes] = await Promise.all([
    supabase.from('home_intelligence').select('top_three').eq('id', 'current').maybeSingle(),
    supabase.from('decisions_waiting').select('*').order('age_hours', { ascending: false }).limit(20),
  ])

  if (intelRes.error && intelRes.error.code !== 'PGRST116') {
    return res.status(500).json({ ok: false, error: intelRes.error.message })
  }
  if (decRes.error) {
    return res.status(500).json({ ok: false, error: decRes.error.message })
  }

  const topRaw = (intelRes.data as { top_three?: unknown } | null)?.top_three
  const topArr = parseJson<TopThreeCard[]>(topRaw, [])
  const marcus_top_three = Array.isArray(topArr)
    ? topArr.filter(c => c && typeof c.kind === 'string' && typeof c.title === 'string').slice(0, 3)
    : []

  // Skip anything already in marcus_top_three by title to keep the picker
  // free of duplicates.
  const usedTitles = new Set(marcus_top_three.map(c => (c.title || '').toLowerCase()))
  const additional_candidates = (decRes.data || [])
    .filter(r => !usedTitles.has((r.title || '').toLowerCase()))
    .slice(0, 4)

  return res.json({ ok: true, marcus_top_three, additional_candidates })
}
