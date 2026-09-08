import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { resolveTz, shiftYmd } from '../_timezone.js'
import { weekStartIn } from '../_week.js'

// GET /api/goals/history?weeks=8
//
// The archive, read by week. Every weekly objective ever set stays in `goals`
// with its week_start and its outcome (done, missed, dropped, or still
// active this week), and every locked day stays in daily_focus. This is the
// one read that puts them side by side, so the learning loop (and any review
// surface) sees how he sets goals and how the weeks actually went, without a
// second store.
//
// Not rendered on Home: Home has no scroll budget. The ritual's summary step
// opens it in a SlideOver.

interface WeekRow {
  week_start: string
  objectives: Array<{ id: string; title: string; status: string; job: string | null; venture: string | null; carried_from: string | null }>
  set: number
  done: number
  missed: number
  days_locked: number
  targets_set: number
  targets_done: number
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' })

  const weeksRaw = Number(req.query.weeks)
  const weeks = Number.isFinite(weeksRaw) ? Math.min(26, Math.max(1, Math.round(weeksRaw))) : 8

  try {
    const tz = await resolveTz(req)
    const currentWeek = weekStartIn(new Date(), tz)
    const firstWeek = shiftYmd(currentWeek, -7 * (weeks - 1))

    const [goalsRes, focusRes] = await Promise.all([
      supabase
        .from('goals')
        .select('id, title, status, job, venture, week_start, carried_from, closed_at, created_at')
        .eq('horizon', 'weekly')
        .gte('week_start', firstWeek)
        .order('week_start', { ascending: false })
        .order('created_at', { ascending: true }),
      supabase
        .from('daily_focus')
        .select('focus_date, status, target_1_text, target_2_text, target_3_text, target_1_completed_at, target_2_completed_at, target_3_completed_at')
        .gte('focus_date', firstWeek)
        .order('focus_date', { ascending: false }),
    ])
    if (goalsRes.error) return res.status(500).json({ ok: false, error: goalsRes.error.message })
    if (focusRes.error) return res.status(500).json({ ok: false, error: focusRes.error.message })

    const byWeek = new Map<string, WeekRow>()
    for (let i = 0; i < weeks; i++) {
      const w = shiftYmd(currentWeek, -7 * i)
      byWeek.set(w, { week_start: w, objectives: [], set: 0, done: 0, missed: 0, days_locked: 0, targets_set: 0, targets_done: 0 })
    }

    for (const g of (goalsRes.data || []) as Array<Record<string, unknown>>) {
      const w = String(g.week_start || '')
      const row = byWeek.get(w)
      if (!row) continue
      row.objectives.push({
        id: String(g.id), title: String(g.title || ''), status: String(g.status || ''),
        job: (g.job as string | null) ?? null, venture: (g.venture as string | null) ?? null,
        carried_from: (g.carried_from as string | null) ?? null,
      })
      row.set += 1
      if (g.status === 'done') row.done += 1
      if (g.status === 'missed') row.missed += 1
    }

    for (const d of (focusRes.data || []) as Array<Record<string, unknown>>) {
      const w = weekStartIn(new Date(`${String(d.focus_date)}T12:00:00Z`), 'UTC')
      const row = byWeek.get(w)
      if (!row) continue
      row.days_locked += 1
      for (const n of [1, 2, 3]) {
        if (typeof d[`target_${n}_text`] === 'string' && String(d[`target_${n}_text`]).trim()) {
          row.targets_set += 1
          if (d[`target_${n}_completed_at`]) row.targets_done += 1
        }
      }
    }

    return res.json({ ok: true, current_week: currentWeek, weeks: [...byWeek.values()] })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'history failed' })
  }
}
