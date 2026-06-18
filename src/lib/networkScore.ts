import type { ContactRow } from '../hooks/useRealtimeContacts'

// Network predictive scoring rubric (Krish: "sophisticated predictive scoring
// rubric, matched to venture goals → immediate action"). A 0-100 "reach out
// priority": who is most worth contacting right now, and why.
//
// It blends four legible signals so the score is explainable, not a black box:
//   • heat      — engagement / warmth (heat_score 0-100)
//   • fit       — venture fit (the active venture's fit_score, else best fit)
//   • tier      — relationship tier (customer/warm > permissioned > cold)
//   • reach     — can we actually contact them (email > linkedin > neither)
// and decays by recency so freshly-active people rank above stale ones.

const TIER_BOOST: Record<string, number> = {
  customer: 22, warm: 14, permissioned: 7, cold_engaged: 3, cold_scraped: 0,
}

export function bestFit(c: ContactRow, venture?: string | null): number {
  if (venture && c.fit_scores && typeof c.fit_scores[venture] === 'number') return Number(c.fit_scores[venture])
  const vals = c.fit_scores ? Object.values(c.fit_scores).map(Number).filter(Number.isFinite) : []
  return vals.length ? Math.max(...vals) : 0
}

function reachMultiplier(c: ContactRow): number {
  if (c.email) return 1
  if (c.linkedin_url) return 0.8
  return 0.5
}

function recencyFactor(c: ContactRow): number {
  const iso = c.last_touch_at
  if (!iso || Number.isNaN(Date.parse(iso))) return 1 // never touched → no penalty (fresh to act on)
  const days = (Date.now() - new Date(iso).getTime()) / 86400000
  if (days < 14) return 1
  if (days < 45) return 0.92
  if (days < 120) return 0.82
  return 0.7
}

/** 0-100 reach-out priority. Higher = contact sooner. */
export function predictiveScore(c: ContactRow, venture?: string | null): number {
  const heat = Math.max(0, Math.min(100, c.heat_score ?? 0))
  const fit = Math.max(0, Math.min(100, bestFit(c, venture)))
  const tier = TIER_BOOST[c.consent_tier || ''] ?? 0
  const raw = (0.5 * heat + 0.4 * fit + tier) * reachMultiplier(c) * recencyFactor(c)
  return Math.round(Math.max(0, Math.min(100, raw)))
}

/** One-line "why this score" for the hero / card. */
export function scoreRationale(c: ContactRow, venture?: string | null): string {
  const parts: string[] = []
  if ((c.heat_score ?? 0) > 0) parts.push(`heat ${c.heat_score}`)
  const fit = bestFit(c, venture)
  if (fit > 0) parts.push(`fit ${fit}`)
  if (c.consent_tier) parts.push(c.consent_tier.replace(/_/g, ' '))
  if (!c.email && !c.linkedin_url) parts.push('no contact channel')
  return parts.join(' · ')
}

export function isContactable(c: ContactRow): boolean {
  return !!(c.email || c.linkedin_url) && c.status !== 'do_not_contact' && c.status !== 'closed'
}
