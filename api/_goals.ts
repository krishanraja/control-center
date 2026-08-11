/**
 * The goal spine. One place loads the ladder and renders it into the block
 * every reasoning path shares, in the same shape as api/_direction.ts:
 * getLaneDirection/directionPrompt for a lane's locked voice, loadActiveGoals/
 * goalsPrompt for what the system is currently for.
 *
 * Before this, goals were write-only. api/briefs/assemble.ts, api/ask-marcus.ts,
 * api/triage/sweep.ts, api/_direction.ts, api/_content.ts and
 * api/pilot/build-one.ts all read ZERO goals: the ladder was a place to record
 * intent that nothing downstream consulted.
 *
 * Staleness travels with the goals on purpose. A goal nobody has touched past
 * its rung's threshold is still the goal, but a reasoning path should know it
 * is running on an old instruction rather than treating it as fresh.
 */

export type Horizon = 'os' | 'mid_term' | 'weekly' | 'venture_objective'

export interface SpineGoal {
  id: string
  title: string
  horizon: Horizon
  parent_id: string | null
  venture: string | null
  current: string | null
  target: string | null
  progress: number | null
  is_stale: boolean
  days_since_touch: number | null
}

export interface GoalSpine {
  by_horizon: Record<Horizon, SpineGoal[]>
  all: SpineGoal[]
  stale_count: number
  /** True when there is nothing to steer by, so callers can say so plainly. */
  empty: boolean
}

const ORDER: Horizon[] = ['os', 'mid_term', 'weekly', 'venture_objective']

const LABEL: Record<Horizon, string> = {
  os: 'OS GOALS (what the whole system is for)',
  mid_term: 'MID-TERM (the next few months)',
  weekly: 'THIS WEEK',
  venture_objective: 'PER VENTURE',
}

/** Active goals only. Proposed, paused, done and dropped do not steer work. */
export async function loadActiveGoals(): Promise<GoalSpine> {
  // Lazy, like api/_goalMetrics.ts: _supabase throws at module load without
  // service-role env, and goalsPrompt() is a pure renderer that must stay
  // importable without secrets.
  const { supabase } = await import('./_supabase.js')
  const [goalsRes, healthRes] = await Promise.all([
    supabase
      .from('goals')
      .select('id, title, horizon, parent_id, venture, current, target, progress')
      .eq('status', 'active')
      .order('priority', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase.from('goals_health').select('id, is_stale, days_since_touch'),
  ])

  const health = new Map(
    ((healthRes.data || []) as Array<{ id: string; is_stale: boolean; days_since_touch: number | null }>)
      .map(h => [h.id, h]),
  )

  const all: SpineGoal[] = ((goalsRes.data || []) as Array<Record<string, unknown>>).map(g => {
    const h = health.get(String(g.id))
    return {
      id: String(g.id),
      title: String(g.title || ''),
      horizon: g.horizon as Horizon,
      parent_id: (g.parent_id as string | null) ?? null,
      venture: (g.venture as string | null) ?? null,
      current: (g.current as string | null) ?? null,
      target: (g.target as string | null) ?? null,
      progress: (g.progress as number | null) ?? null,
      is_stale: h?.is_stale ?? false,
      days_since_touch: h?.days_since_touch ?? null,
    }
  })

  const by_horizon = { os: [], mid_term: [], weekly: [], venture_objective: [] } as Record<Horizon, SpineGoal[]>
  for (const g of all) if (by_horizon[g.horizon]) by_horizon[g.horizon].push(g)

  return { by_horizon, all, stale_count: all.filter(g => g.is_stale).length, empty: all.length === 0 }
}

/**
 * Render the ladder into a system-prompt block. Terse by design: this rides
 * along on every reasoning call, and api/_harness.ts meters those.
 *
 * `context` names what the caller is about to do, so the instruction lands on
 * the surface rather than floating.
 */
export function goalsPrompt(spine: GoalSpine, context: string): string {
  if (spine.empty) {
    return [
      `CURRENT GOALS: none are set.`,
      `Do not invent goals or infer them from recent activity. If ${context} depends`,
      `on knowing what the system is for, say that no goal is set and stop there.`,
    ].join('\n')
  }

  const lines: string[] = ['CURRENT GOALS (the ladder Krish set. Everything below serves what is above it):']

  for (const hz of ORDER) {
    const rows = spine.by_horizon[hz]
    if (!rows.length) continue
    lines.push(`${LABEL[hz]}:`)
    for (const g of rows) {
      const bits: string[] = []
      if (g.venture) bits.push(g.venture)
      if (g.target) bits.push(`target ${g.target}`)
      if (g.current) bits.push(`now ${g.current}`)
      if (g.is_stale) bits.push(`STALE, untouched ${g.days_since_touch ?? '?'}d`)
      lines.push(`- ${g.title}${bits.length ? ` (${bits.join(', ')})` : ''}`)
    }
  }

  lines.push(
    '',
    `When ${context}, prefer what serves a goal above and say which one. Name it`,
    'when work serves nothing on this ladder, rather than quietly inventing a',
    'reason it fits.',
  )
  if (spine.stale_count > 0) {
    lines.push(
      `${spine.stale_count} goal(s) are stale. Treat them as still current but flag the age if you rely on one.`,
    )
  }
  return lines.join('\n')
}

/** Convenience: load + render in one call, matching directionSpine(). */
export async function goalsSpine(context: string): Promise<{ prompt: string; spine: GoalSpine }> {
  const spine = await loadActiveGoals()
  return { prompt: goalsPrompt(spine, context), spine }
}
