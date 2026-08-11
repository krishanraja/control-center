// The facts a goal gets judged against.
//
// Sourced from revenue_events / revenue_subscriptions, which are pulled
// straight from Stripe, never from customers.mrr_usd and never from a display
// layer. Both of those were wrong in different directions: the column treats a
// Checkout grand total as monthly revenue, and the UI used to pin the headline
// at $16,500. A gate judging achievability against either would be validating
// goals against a number nobody can move.
//
// Two figures, deliberately separate. Most of the money collected to date came
// from one one-off payment, so a revenue goal has to say which one it means.

export interface GoalMetrics {
  committed_mrr_usd: number
  collected_30d_net_usd: number
  collected_all_time_net_usd: number
  one_time_share_pct: number | null
  active_subscriptions: number
  active_goals_by_horizon: Record<string, number>
  as_of: string
}

export async function loadGoalMetrics(): Promise<GoalMetrics> {
  const { supabase } = await import('./_supabase.js')
  const { loadRevenue } = await import('./_revenue.js')

  const [rev, goalRes] = await Promise.all([
    loadRevenue(),
    supabase.from('goals').select('horizon').eq('status', 'active'),
  ])

  const byHorizon: Record<string, number> = {}
  for (const g of (goalRes.data || []) as Array<{ horizon: string }>) {
    byHorizon[g.horizon] = (byHorizon[g.horizon] || 0) + 1
  }

  return {
    committed_mrr_usd: rev.committed_mrr_usd_cents / 100,
    collected_30d_net_usd: rev.collected_30d_net_cents / 100,
    collected_all_time_net_usd: rev.collected_all_time_net_cents / 100,
    one_time_share_pct: rev.one_time_share_pct,
    active_subscriptions: rev.active_subscriptions,
    active_goals_by_horizon: byHorizon,
    as_of: new Date().toISOString().slice(0, 10),
  }
}

/** The grounding block handed to the model. Plain facts, no interpretation. */
export function metricsPrompt(m: GoalMetrics): string {
  return [
    `LIVE FACTS (as of ${m.as_of}, pulled from Stripe):`,
    `- Committed MRR: $${m.committed_mrr_usd.toFixed(2)}/mo across ${m.active_subscriptions} live subscription(s)`,
    `- Cash collected, last 30 days, net of fees: $${m.collected_30d_net_usd.toFixed(2)}`,
    `- Cash collected, all time, net of fees: $${m.collected_all_time_net_usd.toFixed(2)}`,
    m.one_time_share_pct == null
      ? '- No revenue recorded yet.'
      : `- ${m.one_time_share_pct}% of all revenue was one-off, not recurring.`,
    `- Active goals already set: ${
      Object.keys(m.active_goals_by_horizon).length === 0
        ? 'none'
        : Object.entries(m.active_goals_by_horizon).map(([h, c]) => `${h}=${c}`).join(', ')
    }`,
    '',
    'Use these when judging Achievable. A revenue goal must say WHICH figure it',
    'means: committed MRR and cash collected are different things here, and most',
    'of the money to date was one-off. If a target implies a multiple of the',
    'current figure, say the multiple and what would have to change. Do not',
    'soften it and do not invent numbers that are not above.',
  ].join('\n')
}
