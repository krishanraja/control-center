import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { callClaude, robustJson } from '../_content.js'
import { loadActiveGoals, goalsPrompt } from '../_goals.js'
import { isJob, JOBS } from '../_mission.js'


// GET /api/daily-focus/suggestions
//   Returns { os_picks, marcus_top_three, marcus_alternates, marcus_reasoning }.
//   The Marcus cards come from home_intelligence — the alternates are also
//   his synthesis, not a raw decisions_waiting slice.
//
//   os_picks (2026-09-06, one swing): the OS's own derivation from the
//   objectives Krish set this week. He sets the objectives; the OS proposes
//   the concrete move for today under each, tagged with which of the five
//   jobs it serves, asks and sends before any building. Proposals only: he
//   picks and locks in the ritual, nothing here is written to daily_focus.
//   Empty when there are no active weekly objectives, or when the model call
//   fails, so the ritual still opens on Marcus alone.

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
  const os_picks = await derivePicksFromObjectives()

  return res.json({
    ok: true,
    os_picks,
    marcus_top_three,
    marcus_alternates,
    marcus_reasoning,
    generated_at: row?.top_three_at ?? null,
  })
}

interface OsPick extends TopThreeCard {
  goal_id: string | null
  job: string | null
}

/**
 * One concrete move for today per active weekly objective, from the canon
 * block every reasoning path shares. Bounded to three, because today is
 * always exactly three. Never throws: an empty list is the honest fallback.
 */
async function derivePicksFromObjectives(): Promise<OsPick[]> {
  try {
    const spine = await loadActiveGoals()
    const weekly = spine.by_horizon.weekly.filter(g => g.title.trim())
    if (weekly.length === 0) return []

    const system = [
      goalsPrompt(spine, 'proposing the three moves for today'),
      '',
      'You are proposing what Krish does TODAY to move this week\'s objectives.',
      'Rules: one move per weekly objective, at most three moves in total. Each move is one concrete action he can finish today',
      'and see the result of: an approach sent, a call booked, a piece drafted, a number logged. Asks and sends come before any building.',
      'Each move names the objective it serves (by its exact title) and which of the five jobs it serves.',
      'Plain English a twelve year old could follow. No em dashes. Never invent a person, a number or a fact.',
      'Return ONLY JSON: {"moves":[{"title":"...","why_now":"...","objective":"<exact weekly objective title>","job":"<one of ' + JOBS.map(j => j.id).join('|') + '>"}]}',
    ].join('\n')

    const raw = await callClaude({ agent: 'daily-focus-os-picks', system, user: 'Propose today\'s moves.', maxTokens: 700, temperature: 0.3, timeoutMs: 20_000 })
    const parsed = robustJson(raw) as { moves?: unknown } | null
    const moves = Array.isArray(parsed?.moves) ? parsed!.moves as Array<Record<string, unknown>> : []
    const byTitle = new Map(weekly.map(g => [g.title.trim().toLowerCase(), g]))

    const out: OsPick[] = []
    for (const m of moves) {
      const title = typeof m.title === 'string' ? m.title.trim() : ''
      if (!title) continue
      const objective = typeof m.objective === 'string' ? m.objective.trim().toLowerCase() : ''
      const goal = byTitle.get(objective) || null
      const job = isJob(m.job) ? m.job : (goal?.job ?? null)
      out.push({
        kind: job || 'os',
        title,
        why_now: typeof m.why_now === 'string' ? m.why_now.trim() : undefined,
        action_kind: 'os_pick',
        action_target_id: null,
        leverage_score: undefined,
        reasoning: goal ? `Serves this week\'s objective: ${goal.title}` : undefined,
        goal_id: goal?.id ?? null,
        job,
      })
      if (out.length >= 3) break
    }
    return out
  } catch {
    return []
  }
}
