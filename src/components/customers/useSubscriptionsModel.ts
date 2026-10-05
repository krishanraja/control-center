/**
 * Subscriptions' one data layer, shared by the desk and the phone so the two
 * can only differ in layout. It reads the growth rows Growth reads (useGrowth
 * and the site check, through the same productSignals), so the portfolio board
 * here is built from exactly the inputs the Growth board is.
 */
import { useMemo } from 'react'
import { useGrowth } from '../../hooks/useGrowth'
import { useWebInsights } from '../../hooks/useWebInsights'
import { usePortfolio } from '../../hooks/usePortfolio'
import { syncAgeHours, SYNC_STALE_HOURS } from '../../hooks/useRevenue'
import { productSignals } from '../../lib/growthModel'
import { subscriptionsSummary } from '../../lib/portfolioBoard'

export function useSubscriptionsModel() {
  const g = useGrowth()
  const web = useWebInsights()
  const signals = useMemo(
    () => productSignals({ probes: g.probes, web: web.data, cards: g.cards, touchpoints: g.touchpoints }, new Date()).products,
    [g.probes, g.cards, g.touchpoints, web.data],
  )
  const p = usePortfolio({ signals, reviews: g.reviews, loading: g.loading })

  const ageHours = syncAgeHours(p.revenue)
  const behind = ageHours == null || ageHours > SYNC_STALE_HOURS

  // Paying customers Maya flagged for a check-in and not emailed in a week,
  // biggest first. The same rule the old tab's expansion list used.
  const expansion = useMemo(() => {
    const now = Date.now()
    return p.customers
      .filter(c => c.kind === 'paid' && !c.churned_at && c.needs_outreach_at && new Date(c.needs_outreach_at).getTime() <= now)
      .filter(c => !c.last_emailed_at || (now - new Date(c.last_emailed_at).getTime()) / 86_400_000 >= 7)
      .sort((a, b) => (b.mrr_usd || 0) - (a.mrr_usd || 0))
  }, [p.customers])

  const summary = useMemo(() => subscriptionsSummary(p.rows, p.revenue), [p.rows, p.revenue])

  /** Free sign-ups across the ranked products whose sign-ups are wired. Never summed with the Substack's own readers. */
  const freeSignups = useMemo(() => {
    const wired = p.rows.filter(r => r.signups != null)
    return { count: wired.reduce((s, r) => s + (r.signups ?? 0), 0), wired: wired.length, of: p.rows.length }
  }, [p.rows])

  return { ...p, summary, expansion, ageHours, behind, freeSignups }
}

export type SubscriptionsModel = ReturnType<typeof useSubscriptionsModel>
