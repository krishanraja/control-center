import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { getOperatorTz, weekOfIn } from '../_timezone.js'

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

  // Advisory weekly linkage (Phase 2): attach serves_milestone to any task card
  // that advances a milestone Krish committed for the current week. Failures
  // here never break the daily picker; the chip just does not show.
  const servesByTask = await buildServesByTask([...marcus_top_three, ...marcus_alternates])
  const attach = (c: TopThreeCard) => ({
    ...c,
    serves_milestone: (c.action_kind === 'task' && c.action_target_id)
      ? (servesByTask[c.action_target_id] || null)
      : null,
  })

  return res.json({
    ok: true,
    marcus_top_three: marcus_top_three.map(attach),
    marcus_alternates: marcus_alternates.map(attach),
    marcus_reasoning,
    generated_at: row?.top_three_at ?? null,
  })
}

interface ServesMilestone { id: string; title: string; goal_id: string; goal_title: string | null }


async function buildServesByTask(cards: TopThreeCard[]): Promise<Record<string, ServesMilestone>> {
  const out: Record<string, ServesMilestone> = {}
  try {
    const taskIds = Array.from(new Set(
      cards.filter(c => c.action_kind === 'task' && c.action_target_id).map(c => c.action_target_id as string),
    ))
    if (taskIds.length === 0) return out
    // The operator's civil week, the same one weekly_focus_milestones is keyed
    // by on the client. This used to be hardcoded to Europe/London.
    const week = weekOfIn(new Date(), await getOperatorTz())
    const { data: committed } = await supabase
      .from('weekly_focus_milestones')
      .select('milestone_id, goal_id')
      .eq('week_of', week)
    const committedMs = (committed || []) as Array<{ milestone_id: string; goal_id: string }>
    if (committedMs.length === 0) return out
    const msIds = committedMs.map(c => c.milestone_id)
    const { data: tasks } = await supabase.from('tasks').select('id, milestone_id').in('id', taskIds)
    const relevant = (tasks || []).filter(t => t.milestone_id && msIds.includes(t.milestone_id as string))
    if (relevant.length === 0) return out
    const { data: ms } = await supabase.from('milestones').select('id, title, goal_id').in('id', msIds)
    const { data: goals } = await supabase.from('goals').select('id, title').in('id', committedMs.map(c => c.goal_id))
    const msById = new Map((ms || []).map(m => [m.id as string, m as { id: string; title: string; goal_id: string }]))
    const goalTitle = new Map((goals || []).map(g => [g.id as string, g.title as string]))
    for (const t of relevant) {
      const m = msById.get(t.milestone_id as string)
      if (!m) continue
      out[t.id as string] = { id: m.id, title: m.title, goal_id: m.goal_id, goal_title: goalTitle.get(m.goal_id) ?? null }
    }
  } catch {
    return out
  }
  return out
}
