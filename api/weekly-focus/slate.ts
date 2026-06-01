import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// GET /api/weekly-focus/slate
//   The candidate slate for "this week's moves". Replaces the starved old pool
//   (which only showed milestones already status='accepted' — there were 2).
//   Now: every ACCOMPLISHMENT-altitude milestone that is eligible to commit
//   (status in proposed/accepted/active) across ALL active objectives, ordered
//   breadth-first by objective priority so the slate spans the portfolio instead
//   of dumping one objective's whole sequence. Task-altitude milestones
//   (is_accomplishment=false, e.g. "Consolidate & score leads") are excluded so
//   chores never masquerade as a week's move.
//
//   Each item ladders UP (goal_title) and carries the OS-vs-you split
//   (owner_split per milestone, plus the objective's contributing agents as a
//   fallback) so Krish sees what the OS will drive vs what needs him before he
//   commits. Returned items feed FocusRitual's WeeklyStep and the commit route's
//   ladder-down.

const CAP = 12

interface GoalRow { id: string; title: string; venture: string | null; priority: number | null }
interface MilestoneRow {
  id: string; goal_id: string; title: string; status: string; source: string
  sequence: number; est_deep_work_hours: number | null
  owner_split: unknown; auto_executable_pct: number | null; is_accomplishment: boolean
}

const rank = (m: MilestoneRow): number => (m.status === 'accepted' || m.status === 'active' ? 0 : 1)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const { data: goalsData, error: gErr } = await supabase
    .from('goals')
    .select('id, title, venture, priority')
    .eq('status', 'active')
    .order('priority', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  if (gErr) return res.status(500).json({ ok: false, error: gErr.message })
  const goals = (goalsData || []) as GoalRow[]
  if (goals.length === 0) return res.json({ ok: true, slate: [] })

  const goalById = new Map(goals.map(g => [g.id, g]))
  const ids = goals.map(g => g.id)

  const { data: msData, error: mErr } = await supabase
    .from('milestones')
    .select('id, goal_id, title, status, source, sequence, est_deep_work_hours, owner_split, auto_executable_pct, is_accomplishment')
    .in('goal_id', ids)
    .eq('is_accomplishment', true)
    .in('status', ['proposed', 'accepted', 'active'])
  if (mErr) return res.status(500).json({ ok: false, error: mErr.message })
  const milestones = (msData || []) as MilestoneRow[]

  const { data: contribData } = await supabase
    .from('goal_agent_contributions')
    .select('goal_id, agent_id, contribution_note')
    .in('goal_id', ids)
  const contribByGoal = new Map<string, Array<{ agent_id: string; contribution_note: string | null }>>()
  for (const c of (contribData || []) as Array<{ goal_id: string; agent_id: string; contribution_note: string | null }>) {
    const arr = contribByGoal.get(c.goal_id) || []
    arr.push({ agent_id: c.agent_id, contribution_note: c.contribution_note })
    contribByGoal.set(c.goal_id, arr)
  }

  // Group eligible milestones per goal, blessed-first then by sequence.
  const byGoal = new Map<string, MilestoneRow[]>()
  for (const m of milestones) {
    const arr = byGoal.get(m.goal_id) || []
    arr.push(m)
    byGoal.set(m.goal_id, arr)
  }
  for (const arr of byGoal.values()) {
    arr.sort((a, b) => rank(a) - rank(b) || a.sequence - b.sequence)
  }

  // Breadth-first across objectives (objectives already in priority order).
  const slate: Array<Record<string, unknown>> = []
  let pass = 0
  let added = true
  while (added && slate.length < CAP) {
    added = false
    for (const g of goals) {
      const arr = byGoal.get(g.id)
      if (!arr || pass >= arr.length) continue
      const m = arr[pass]
      const goal = goalById.get(m.goal_id)!
      slate.push({
        milestone_id: m.id,
        title: m.title,
        goal_id: m.goal_id,
        goal_title: goal.title,
        goal_priority: goal.priority,
        venture: goal.venture,
        status: m.status,
        source: m.source,
        blessed: m.status === 'accepted' || m.status === 'active',
        est_deep_work_hours: m.est_deep_work_hours,
        owner_split: m.owner_split ?? null,
        auto_executable_pct: m.auto_executable_pct ?? null,
        contributions: contribByGoal.get(m.goal_id) || [],
      })
      added = true
      if (slate.length >= CAP) break
    }
    pass += 1
  }

  return res.json({ ok: true, slate, objective_count: goals.length })
}
