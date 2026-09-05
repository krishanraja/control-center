import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { weekOfLabel } from '../_week.js'

// GET /api/goals/ladder
//
// The ONE read for the whole goal ladder (canon §0a.2). Before this, Home made
// two separate reads that each returned a slice of `goals` and each presented it
// as a different concept, which is what made "one source of truth" untrue in
// practice even after the data was correct.
//
// Returns every rung plus its health, so the UI never has to compute staleness
// or orphanhood itself and cannot disagree with `goals_health` about either.

// Two rungs since the 2026-08-20 recompose: OS goals → this week's objectives.
// (Today's 3 live in daily_focus, not here.) mid_term and venture_objective
// retired with zero rows; a weekly goal serves an OS goal directly and may
// carry an optional venture tag.
const HORIZONS = ['os', 'weekly'] as const

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const [goalsRes, healthRes, cfgRes, ventureRes] = await Promise.all([
    supabase
      .from('goals')
      .select('id, title, horizon, parent_id, venture, job, status, priority, why_now, definition_of_done, target_horizon, updated_at, created_at')
      .not('status', 'in', '("dropped","archived")')
      .order('priority', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase.from('goals_health').select('id, is_stale, orphaned, days_since_touch, stale_after_days'),
    // north_star only: it is the derived mirror kept for readers outside this
    // repo. team_focus retired 2026-08-20 — the weekly rung IS the answer to
    // "what is this week about".
    supabase.from('system_config').select('key, value').in('key', ['north_star']),
    // The venture list belongs to the registry, not to a literal in the editor.
    supabase.from('venture_registry').select('slug').eq('active', true).order('sort_order'),
  ])

  const err = goalsRes.error || healthRes.error || cfgRes.error
  if (err) return res.status(500).json({ ok: false, error: err.message })

  const health = new Map((healthRes.data || []).map(h => [(h as any).id, h]))
  const rows = (goalsRes.data || []).map(g => {
    const h = health.get((g as any).id) as any
    return {
      ...g,
      is_stale: h?.is_stale ?? false,
      orphaned: h?.orphaned ?? false,
      days_since_touch: h?.days_since_touch ?? null,
      stale_after_days: h?.stale_after_days ?? null,
    }
  })

  const cfg: Record<string, string> = {}
  for (const c of cfgRes.data || []) cfg[(c as any).key] = (c as any).value

  const byHorizon: Record<string, unknown[]> = {}
  for (const hz of HORIZONS) byHorizon[hz] = rows.filter(r => r.horizon === hz)

  return res.json({
    ok: true,
    horizons: HORIZONS,
    by_horizon: byHorizon,
    goals: rows,
    // Counts the UI shows without recomputing; staleness is urgent by design.
    stale_count: rows.filter(r => r.is_stale).length,
    orphan_count: rows.filter(r => r.orphaned).length,
    ventures: (ventureRes.data || []).map(v => String((v as { slug: string }).slug)),
    north_star: cfg.north_star || '',
    // Derived, never read from config: a stored week label is wrong the
    // moment the week turns, and it was showing April in August.
    week_of: weekOfLabel(),
  })
}
