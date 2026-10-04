/**
 * Growth: the headline numbers, computed from the read model on every render
 * and never stored, so a figure on screen cannot drift from its evidence.
 * An unmeasured number stays null here and the UI says "not counted yet".
 */
import { ventureLabel } from '../../lib/ventureOptions'
import type { ProductSignal, SignalsTotals } from '../../lib/growthModel'
import type { SeoRankRow } from '../../lib/growthWire'
import type { WebInsightsResponse, WebPropertyView } from '../../lib/webProperties'
import type { IntegrationRow } from '../../hooks/useAcquisition'

export type Trend = 'up' | 'down' | 'flat'

/** AI answers across every product: the 30-day count and one column per weekly run. */
export function aiSummary(products: ProductSignal[], totals: SignalsTotals) {
  const byWeek = new Map<string, { mentioned: number; asked: number }>()
  for (const p of products) {
    for (const w of p.aiAnswers.trend.weekly) {
      const cur = byWeek.get(w.week) ?? { mentioned: 0, asked: 0 }
      cur.mentioned += w.mentioned
      cur.asked += w.asked
      byWeek.set(w.week, cur)
    }
  }
  const weekly = [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([week, v]) => ({ week, ...v }))
  const first = weekly[0]?.mentioned ?? 0
  const last = weekly[weekly.length - 1]?.mentioned ?? 0
  const prev = weekly.length >= 2 ? weekly[weekly.length - 2].mentioned : last
  const byProduct = products
    .filter(p => p.aiAnswers.asked > 0)
    .sort((a, b) => (b.aiAnswers.rate ?? 0) - (a.aiAnswers.rate ?? 0) || b.aiAnswers.asked - a.aiAnswers.asked || a.label.localeCompare(b.label))
  const trend: Trend = weekly.length < 2 ? 'flat' : last > first ? 'up' : last < first ? 'down' : 'flat'
  /** The newest weekly run against the one before it: what "this week" means for the summary line. */
  const lastWeek: Trend = last > prev ? 'up' : last < prev ? 'down' : 'flat'
  return { mentioned: totals.aiAnswers.mentioned, asked: totals.aiAnswers.asked, rate: totals.aiAnswers.rate, weekly, byProduct, first, last, trend, lastWeek }
}

/** The measured sites only: a site that cannot be read has no visit count, never 0. */
export function visitsSummary(web: Pick<WebInsightsResponse, 'properties'> | null, totals: SignalsTotals) {
  const sites: WebPropertyView[] = web?.properties ?? []
  const measured = sites.filter(s => s.totals)
  // Four weekly sums from the 28-day series, oldest first. An unmeasured day adds nothing.
  const weekly = [0, 1, 2, 3].map(w => measured.reduce((n, s) => n + (s.series ?? []).slice(w * 7, w * 7 + 7).reduce((m, d) => m + (d.sessions ?? 0), 0), 0))
  const v = totals.visits
  const trend: Trend = !v ? 'flat' : v.cur > v.prev ? 'up' : v.cur < v.prev ? 'down' : 'flat'
  return { sites, measured, cur: v?.cur ?? null, prev: v?.prev ?? null, weekly, trend }
}

export function googleSummary(rows: SeoRankRow[]) {
  const ranking = rows.filter(r => r.position != null)
  const top10 = ranking.filter(r => (r.position ?? 999) <= 10)
  const bySearches = [...rows].sort((a, b) => (b.monthly_searches ?? -1) - (a.monthly_searches ?? -1) || a.keyword.localeCompare(b.keyword))
  const missing = bySearches.filter(r => r.position == null || r.position > 10)
  return { total: rows.length, ranking: ranking.length, top10: top10.length, bySearches, missing }
}

export function fmtSearches(v: number | null): string {
  if (v == null) return 'searches not measured'
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k searches a month`
  return `${v} searches a month`
}

/**
 * The one plain sentence at the top: is anyone finding him, and which way it
 * went this week. Built from the AI answer rate, the newest weekly run against
 * the one before, and this week's site visits against last week's.
 */
export function summaryLine(ai: ReturnType<typeof aiSummary>, visits: ReturnType<typeof visitsSummary>): string {
  if (ai.asked === 0 && visits.cur == null) return 'Nothing is being measured yet, so it is too early to say who is finding you.'
  const rate = ai.rate ?? 0
  const level = rate < 0.05 && (visits.cur ?? 0) < 20 ? 'low' : rate < 0.2 ? 'some' : 'good'
  const sign = (t: Trend) => (t === 'up' ? 1 : t === 'down' ? -1 : 0)
  const score = sign(ai.lastWeek) + (visits.cur == null ? 0 : sign(visits.trend))
  const start = level === 'low' ? 'Hardly anyone is finding you yet' : level === 'some' ? 'A few people are finding you' : 'People are finding you'
  if (score > 0) return `${start}, ${level === 'good' ? 'and' : 'but'} it ticked up this week.`
  if (score < 0) return `${start}, ${level === 'good' ? 'but' : 'and'} it dipped this week.`
  return `${start}, and nothing moved this week.`
}

/** Spend limits, reduced to one sentence. Only a tool that is paid for counts. */
export function spendLine(integrations: IntegrationRow[]): string {
  const paid = integrations.filter(t => t && Number(t.monthly_usd) > 0 && (t.status === 'pending' || t.status === 'wired'))
  if (paid.length === 0) return 'Spend is $0 for every product this month.'
  const parts = paid.map(t => {
    const names = (t.lanes ?? []).map(l => ventureLabel(l) ?? l)
    const usd = Math.round(Number(t.monthly_usd) * 100) / 100
    return `${t.tool} at $${usd} a month${names.length ? ` for ${names.join(' and ')}` : ''}, ${t.status === 'pending' ? 'paid for and not connected' : 'paid for and connected'}`
  })
  const tail = paid.length === 1 ? 'Keep or drop it in Intel.' : 'Keep or drop them in Intel.'
  return `Spend is $0 for every product this month, apart from ${parts.join('; and ')}. ${tail}`
}
