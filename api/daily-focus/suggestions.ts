import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'


// GET /api/daily-focus/suggestions
//   Returns { marcus_top_three, marcus_alternates, marcus_reasoning }.
//   All three pulled from home_intelligence — the alternates are now
//   also Marcus's synthesis, not a raw decisions_waiting slice.

interface TopThreeCard {
  kind: string
  title: string
  why_now?: string
  action_label?: string
  action_kind?: string
  action_target_id?: string | null
  expires_at?: string | null
  leverage_score?: number
  reasoning?: string
  beats?: string[]
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback
  if (typeof raw === 'object') return raw as T
  try { return JSON.parse(raw as string) as T } catch { return fallback }
}

function parseCards(raw: unknown, limit: number): TopThreeCard[] {
  const arr = parseJson<unknown[]>(raw, [])
  if (!Array.isArray(arr)) return []
  return arr
    .filter((c): c is TopThreeCard =>
      !!c
      && typeof (c as TopThreeCard).kind === 'string'
      && typeof (c as TopThreeCard).title === 'string',
    )
    .slice(0, limit)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const { data, error } = await supabase
    .from('home_intelligence')
    .select('top_three, top_three_alternates, top_three_reasoning, top_three_at')
    .eq('id', 'current')
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    return res.status(500).json({ ok: false, error: error.message })
  }

  const row = data as {
    top_three?: unknown
    top_three_alternates?: unknown
    top_three_reasoning?: unknown
    top_three_at?: string | null
  } | null

  const marcus_top_three = parseCards(row?.top_three, 3)
  const marcus_alternates = parseCards(row?.top_three_alternates, 4)
  const marcus_reasoning = typeof row?.top_three_reasoning === 'string'
    ? row.top_three_reasoning
    : null

  // The old serves_milestone leg died with the milestones/weekly_focus tables
  // (2026-08-20 recompose). The picker's weekly linkage is now client-side:
  // the ritual offers active weekly goals as chips and stamps target_N_goal_id.
  // (The removed helper also carried a latent bug: it was called without its
  // tz argument, so the week key was computed from undefined.)
  return res.json({
    ok: true,
    marcus_top_three,
    marcus_alternates,
    marcus_reasoning,
    generated_at: row?.top_three_at ?? null,
  })
}
