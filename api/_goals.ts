/**
 * The goal spine. One place loads the canon and renders it into the block
 * every reasoning path shares, in the same shape as api/_direction.ts:
 * getLaneDirection/directionPrompt for a lane's locked voice, loadActiveGoals/
 * goalsPrompt for what the system is currently for.
 *
 * Two rungs since the 2026-08-20 recompose (os → weekly), PLUS today's 3 from
 * daily_focus — the full canon, so ask-marcus, the weekly brief and the pilot
 * builder reason from exactly what Home shows: OS goals → this week's
 * objectives → today's 3.
 *
 * Staleness travels with the goals on purpose. A goal nobody has touched past
 * its rung's threshold is still the goal, but a reasoning path should know it
 * is running on an old instruction rather than treating it as fresh.
 */

import { missionBlock, jobLabel, type Job } from './_mission.js'

export type Horizon = 'os' | 'weekly'

export interface SpineGoal {
  id: string
  title: string
  horizon: Horizon
  parent_id: string | null
  venture: string | null
  /** Which of the five jobs of the OS this serves (api/_mission.ts). */
  job: Job | null
  is_stale: boolean
  days_since_touch: number | null
}

export interface TodayPick {
  slot: 1 | 2 | 3
  text: string
  done: boolean
  goal_id: string | null
}

/** What today is for, from the morning check-in and last night's shutdown. */
export interface TodayFrame {
  /** The morning intent key (src/lib/pilotIntent.ts), e.g. 'outreach'. */
  intent: string | null
  venture: string | null
  mode: 'green' | 'red' | null
  /** True when the morning was skipped: no reading was given. */
  skipped: boolean
  /** Last night's ONE, when it was chosen for today. */
  tomorrow_one: string | null
  /** What he said shipped, at last night's shutdown. */
  shipped_yesterday: string | null
}

/** One weekly objective from a past week, with how that week ended for it. */
export interface WeekOutcome {
  week_start: string
  title: string
  status: string
}

export interface GoalSpine {
  by_horizon: Record<Horizon, SpineGoal[]>
  /** Today's 3 from daily_focus (operator-civil date); empty when not locked. */
  today: TodayPick[]
  /** The frame the day was opened with. Null fields when nothing was filed. */
  frame: TodayFrame
  /** The last four closed weeks of weekly objectives, newest first. */
  history: WeekOutcome[]
  /** The operator-civil Monday of the current week. */
  current_week: string
  all: SpineGoal[]
  stale_count: number
  /** True when there is nothing to steer by, so callers can say so plainly. */
  empty: boolean
}

const ORDER: Horizon[] = ['os', 'weekly']

const LABEL: Record<Horizon, string> = {
  os: 'OS GOALS (what the whole system is for)',
  weekly: 'THIS WEEK (each serves an OS goal above)',
}

/** Active goals only. Proposed, paused, done and dropped do not steer work. */
export async function loadActiveGoals(): Promise<GoalSpine> {
  // Lazy, like api/_goalMetrics.ts: _supabase throws at module load without
  // service-role env, and goalsPrompt() is a pure renderer that must stay
  // importable without secrets.
  const { supabase } = await import('./_supabase.js')
  const { getOperatorTz, ymdIn, shiftYmd, weekOfIn } = await import('./_timezone.js')
  const tz = await getOperatorTz()
  const now = new Date()
  const todayYmd = ymdIn(now, tz)
  const yesterdayYmd = shiftYmd(todayYmd, -1)
  const currentWeek = weekOfIn(now, tz)
  const historyFrom = shiftYmd(currentWeek, -28)

  const [goalsRes, healthRes, focusRes, morningRes, eveningRes, historyRes] = await Promise.all([
    supabase
      .from('goals')
      .select('id, title, horizon, parent_id, venture, job')
      .eq('status', 'active')
      .order('priority', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase.from('goals_health').select('id, is_stale, days_since_touch'),
    supabase.from('daily_focus').select('*').eq('focus_date', todayYmd).maybeSingle(),
    supabase.from('pilot_checkins').select('intent, venture, mode, skipped')
      .eq('kind', 'morning').eq('checkin_date', todayYmd).maybeSingle(),
    // Last night's shutdown is FOR today. A row dated today is red mode's
    // morning ask, which also names today. Anything older is a past day.
    supabase.from('pilot_checkins').select('tomorrow_one, shipped_today, checkin_date')
      .eq('kind', 'evening').not('tomorrow_one', 'is', null)
      .in('checkin_date', [yesterdayYmd, todayYmd])
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    // Closed weeks only: this week's set is already in the canon above.
    supabase.from('goals').select('title, status, week_start')
      .eq('horizon', 'weekly')
      .gte('week_start', historyFrom)
      .lt('week_start', currentWeek)
      .in('status', ['done', 'missed', 'dropped'])
      .order('week_start', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(12),
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
      job: (g.job as Job | null) ?? null,
      is_stale: h?.is_stale ?? false,
      days_since_touch: h?.days_since_touch ?? null,
    }
  })

  const by_horizon = { os: [], weekly: [] } as Record<Horizon, SpineGoal[]>
  for (const g of all) if (by_horizon[g.horizon]) by_horizon[g.horizon].push(g)

  const today: TodayPick[] = []
  const focus = focusRes.data as Record<string, unknown> | null
  if (focus) {
    for (const slot of [1, 2, 3] as const) {
      const text = focus[`target_${slot}_text`]
      if (typeof text === 'string' && text.trim()) {
        today.push({
          slot,
          text: text.trim(),
          done: Boolean(focus[`target_${slot}_completed_at`]),
          goal_id: (focus[`target_${slot}_goal_id`] as string | null) ?? null,
        })
      }
    }
  }

  const morning = (morningRes.data || null) as { intent?: string | null; venture?: string | null; mode?: string | null; skipped?: boolean | null } | null
  const evening = (eveningRes.data || null) as { tomorrow_one?: string | null; shipped_today?: string | null; checkin_date?: string | null } | null
  const frame: TodayFrame = {
    intent: morning?.intent ?? null,
    venture: morning?.venture ?? null,
    mode: morning?.mode === 'red' ? 'red' : morning?.mode === 'green' ? 'green' : null,
    skipped: Boolean(morning?.skipped),
    tomorrow_one: evening?.tomorrow_one ?? null,
    // shipped_today is only "yesterday's" when the row is last night's.
    shipped_yesterday: evening?.checkin_date === yesterdayYmd ? (evening?.shipped_today ?? null) : null,
  }

  const history: WeekOutcome[] = ((historyRes.data || []) as Array<Record<string, unknown>>).map(r => ({
    week_start: String(r.week_start || ''),
    title: String(r.title || ''),
    status: String(r.status || ''),
  }))

  return {
    by_horizon,
    today,
    frame,
    history,
    current_week: currentWeek,
    all,
    stale_count: all.filter(g => g.is_stale).length,
    // "Empty" means no goals to steer by; an unlocked day does not make the
    // canon empty.
    empty: all.length === 0,
  }
}

/**
 * Render the canon into a system-prompt block. Terse by design: this rides
 * along on every reasoning call, and api/_harness.ts meters those.
 *
 * `context` names what the caller is about to do, so the instruction lands on
 * the surface rather than floating.
 */
export function goalsPrompt(spine: GoalSpine, context: string): string {
  if (spine.empty) {
    return [
      missionBlock(),
      '',
      `CURRENT GOALS: none are set.`,
      `Do not invent goals or infer them from recent activity. If ${context} depends`,
      `on knowing what the system is for, say that no goal is set and stop there.`,
    ].join('\n')
  }

  const lines: string[] = [
    missionBlock(),
    '',
    'CURRENT GOALS (the canon Krish set. Everything below serves what is above it):',
  ]

  for (const hz of ORDER) {
    const rows = spine.by_horizon[hz]
    if (!rows.length) continue
    lines.push(`${LABEL[hz]}:`)
    for (const g of rows) {
      const bits: string[] = []
      if (g.job) bits.push(`job: ${jobLabel(g.job).toLowerCase()}`)
      if (g.venture) bits.push(g.venture)
      if (g.is_stale) bits.push(`STALE, untouched ${g.days_since_touch ?? '?'}d`)
      lines.push(`- ${g.title}${bits.length ? ` (${bits.join(', ')})` : ''}`)
    }
  }

  if (spine.today.length > 0) {
    lines.push(`TODAY'S 3 (set for today; ✓ = done):`)
    for (const t of spine.today) {
      lines.push(`- ${t.done ? '✓ ' : ''}${t.text}`)
    }
  }

  const frameLines = frameLinesFor(spine.frame)
  if (frameLines.length > 0) {
    lines.push(`TODAY'S FRAME (from this morning's check-in and last night's shutdown):`)
    lines.push(...frameLines)
  }

  if (spine.history.length > 0) {
    lines.push('LAST 4 WEEKS (each weekly objective and how its week ended):')
    for (const h of spine.history) {
      lines.push(`- week of ${h.week_start}: ${h.title} (${h.status})`)
    }
  }

  lines.push(
    '',
    `When ${context}, prefer what serves a goal above and say which one, and name`,
    'which of the five jobs it serves. Refuse work that serves none of the five',
    'jobs and say so plainly, rather than quietly inventing a reason it fits.',
  )
  if (spine.stale_count > 0) {
    lines.push(
      `${spine.stale_count} goal(s) are stale. Treat them as still current but flag the age if you rely on one.`,
    )
  }
  return lines.join('\n')
}

function frameLinesFor(frame: TodayFrame | undefined): string[] {
  if (!frame) return []
  const out: string[] = []
  if (frame.skipped) out.push('- morning check-in skipped: no reading today')
  else {
    const bits: string[] = []
    if (frame.intent) bits.push(`today is for: ${frame.intent}`)
    if (frame.venture) bits.push(`venture: ${frame.venture}`)
    if (frame.mode) bits.push(frame.mode === 'red' ? 'red day: one action only' : 'green day: full dashboard')
    if (bits.length) out.push(`- ${bits.join(', ')}`)
  }
  if (frame.tomorrow_one) out.push(`- the one thing that must leave the machine today: ${frame.tomorrow_one}`)
  if (frame.shipped_yesterday) out.push(`- shipped yesterday: ${frame.shipped_yesterday}`)
  return out
}

/** Convenience: load + render in one call, matching directionSpine(). */
export async function goalsSpine(context: string): Promise<{ prompt: string; spine: GoalSpine }> {
  const spine = await loadActiveGoals()
  return { prompt: goalsPrompt(spine, context), spine }
}

/**
 * Record a goal change on the activity feed.
 *
 * audit_log.id has no default, so it is minted here.
 * Never throws: a goal write must not fail because its audit line did.
 */
export async function logGoalChange(
  action: 'set' | 'changed' | 'retired',
  goal: { id: string; title: string; horizon: string },
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { supabase } = await import('./_supabase.js')
    const verb = action === 'set' ? 'set' : action === 'retired' ? 'retired' : 'changed'
    await supabase.from('audit_log').insert({
      id: `goal-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      event_type: 'goal_change',
      actor: 'krish',
      target: goal.id,
      changes: { horizon: goal.horizon, title: goal.title, action, ...extra },
      display_message: `Goal ${verb} (${goal.horizon}): ${goal.title}`,
    })
  } catch {
    // Intentionally silent. See above.
  }
}
