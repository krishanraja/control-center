/**
 * The two revenue figures anyone may render, and the only place either is
 * computed. Before this there were five mutually incompatible MRR sums
 * (different `kind` filters, different limits, some with no test-row filter),
 * plus a hardcoded display pin on top, so Home, the sidebar, the goal gate and
 * the growth cron each published a different truth.
 *
 * They answer different questions and are NEVER added together:
 *
 *   collected  what cash actually arrived, after Stripe's cut and Substack's
 *              10%. Includes one-off payments, which is most of the money.
 *   committed  what is contracted to recur, from live subscriptions only.
 *
 * Both come from revenue_events / revenue_subscriptions, which are pulled
 * straight from Stripe. Neither reads customers.mrr_usd: that column is
 * written by an n8n expression that treats a Checkout grand total as monthly
 * revenue, so a single advisory invoice can read as thousands per month.
 */

export interface MoneyByCurrency { currency: string; cents: number }

export interface RevenueSummary {
  /** Net cash, USD cents, over the window. Fees already removed. */
  collected_30d_net_cents: number
  collected_90d_net_cents: number
  collected_all_time_net_cents: number
  collected_all_time_gross_cents: number
  /** Share of all-time gross that was one-off rather than recurring. */
  one_time_share_pct: number | null
  /** Committed MRR in USD. Non-USD plans are listed separately, never folded in. */
  committed_mrr_usd_cents: number
  committed_mrr_other: MoneyByCurrency[]
  active_subscriptions: number
  /** True when no revenue has been synced yet, so callers can say so. */
  empty: boolean
  as_of: string
}

const DAY = 86_400_000

export async function loadRevenue(): Promise<RevenueSummary> {
  const { supabase } = await import('./_supabase.js')

  const [evRes, subRes] = await Promise.all([
    supabase.from('revenue_events')
      .select('kind, occurred_at, gross_cents, net_cents, usd_cents')
      .limit(10_000),
    supabase.from('revenue_subscriptions')
      .select('status, currency, mrr_cents, mrr_usd_cents')
      .limit(5_000),
  ])

  const events = (evRes.data || []) as Array<Record<string, unknown>>
  const subs = (subRes.data || []) as Array<Record<string, unknown>>

  const now = Date.now()
  let net30 = 0, net90 = 0, netAll = 0, grossAll = 0, grossOneTime = 0
  for (const e of events) {
    const at = new Date(String(e.occurred_at)).getTime()
    const net = Number(e.net_cents) || 0
    const gross = Number(e.gross_cents) || 0
    netAll += net
    grossAll += gross
    if (e.kind === 'one_time') grossOneTime += gross
    if (now - at <= 30 * DAY) net30 += net
    if (now - at <= 90 * DAY) net90 += net
  }

  // past_due counts as committed: the subscription still exists and the
  // customer still owes. trialing does not: nothing is contracted yet.
  const LIVE = new Set(['active', 'past_due'])
  let mrrUsd = 0
  const other = new Map<string, number>()
  let activeCount = 0
  for (const s of subs) {
    if (!LIVE.has(String(s.status))) continue
    activeCount += 1
    const usd = s.mrr_usd_cents == null ? null : Number(s.mrr_usd_cents)
    if (usd != null) { mrrUsd += usd; continue }
    // No settled USD figure for this plan. Reporting it in its own currency is
    // honest; converting it here with a guessed rate would not be.
    const cur = String(s.currency || '').toLowerCase()
    other.set(cur, (other.get(cur) || 0) + (Number(s.mrr_cents) || 0))
  }

  return {
    collected_30d_net_cents: net30,
    collected_90d_net_cents: net90,
    collected_all_time_net_cents: netAll,
    collected_all_time_gross_cents: grossAll,
    one_time_share_pct: grossAll > 0 ? Math.round((grossOneTime / grossAll) * 1000) / 10 : null,
    committed_mrr_usd_cents: mrrUsd,
    committed_mrr_other: [...other.entries()].map(([currency, cents]) => ({ currency, cents })),
    active_subscriptions: activeCount,
    empty: events.length === 0 && subs.length === 0,
    as_of: new Date().toISOString(),
  }
}
