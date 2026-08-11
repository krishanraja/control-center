// The facts a goal gets judged against.
//
// Deliberately read from the real tables, never from a display layer. Home's
// headline MRR is currently pinned by MRR_DISPLAY_OVERRIDE in
// src/lib/mrrDisplay.ts (16500) while `customers` sums to a very different
// number. A gate that judged achievability against a pinned figure would be
// validating goals against a value nobody can move, so this reports what is
// actually in the database and lets the caller say so.

export interface GoalMetrics {
  live_mrr_usd: number
  paying_customers: number
  mrr_delta_7d_usd: number
  active_goals_by_horizon: Record<string, number>
  as_of: string
}

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}

export async function loadGoalMetrics(): Promise<GoalMetrics> {
  // Imported lazily, the way api/_worry-prompt.ts resolves its key: _supabase
  // throws at module load without service-role env, and the deterministic half
  // of the gate is pure logic that must stay importable in CI, which has no
  // secrets. scripts/check-goal-gate.mts depends on that.
  const { supabase } = await import('./_supabase.js')
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()

  const [custRes, goalRes] = await Promise.all([
    supabase.from('customers').select('mrr_usd, churned_at, became_paid_at').limit(5000),
    supabase.from('goals').select('horizon').eq('status', 'active'),
  ])

  const customers = custRes.data || []
  let live = 0
  let paying = 0
  let gained = 0
  let lost = 0
  for (const c of customers as Array<Record<string, unknown>>) {
    const mrr = n(c.mrr_usd)
    const churned = c.churned_at ? String(c.churned_at) : null
    if (!churned) {
      live += mrr
      if (mrr > 0) paying += 1
      if (c.became_paid_at && String(c.became_paid_at) >= weekAgo) gained += mrr
    } else if (churned >= weekAgo) {
      lost += mrr
    }
  }

  const byHorizon: Record<string, number> = {}
  for (const g of (goalRes.data || []) as Array<{ horizon: string }>) {
    byHorizon[g.horizon] = (byHorizon[g.horizon] || 0) + 1
  }

  return {
    live_mrr_usd: Math.round(live * 100) / 100,
    paying_customers: paying,
    mrr_delta_7d_usd: Math.round((gained - lost) * 100) / 100,
    active_goals_by_horizon: byHorizon,
    as_of: new Date().toISOString().slice(0, 10),
  }
}

/** The grounding block handed to the model. Plain facts, no interpretation. */
export function metricsPrompt(m: GoalMetrics): string {
  return [
    `LIVE FACTS (as of ${m.as_of}, read from the database):`,
    `- MRR: $${m.live_mrr_usd}/mo across ${m.paying_customers} paying customers`,
    `- MRR change over the last 7 days: ${m.mrr_delta_7d_usd >= 0 ? '+' : ''}$${m.mrr_delta_7d_usd}`,
    `- Active goals already set: ${
      Object.keys(m.active_goals_by_horizon).length === 0
        ? 'none'
        : Object.entries(m.active_goals_by_horizon).map(([h, c]) => `${h}=${c}`).join(', ')
    }`,
    '',
    'Use these when judging Achievable. If a target implies a multiple of the',
    'current figure, say the multiple and what would have to change. Do not',
    'soften it and do not invent numbers that are not above.',
  ].join('\n')
}
