/**
 * The portfolio board: one row per ranked product, six cells per row, built
 * the same way for Growth and for Subscriptions so the two tabs can never show
 * different numbers for the same thing.
 *
 * Pure: computed on every render from rows the tabs already read, never
 * stored. Three cell states, and the difference between them is the point:
 *   live     a measured number
 *   zero     the source is wired and honestly says nothing yet ("0 of 165",
 *            "no places mapped"), which is a real result
 *   unwired  nothing reads this number yet, so the cell says what is missing
 *            instead of printing a zero that would look real
 *   external read somewhere else on purpose (`externalDashboard` in
 *            portfolio.ts): the cell links out to it and is not a gap
 */
import { asList } from './growth'
import type { CouncilReviewRow } from './growth'
import type { ProductSignal } from './growthModel'
import { PORTFOLIO, METRICS, type MetricKey, type PortfolioProduct } from './portfolio'
import { LISTENER_PRODUCT, countPilotListeners } from './pilotListeners'

export type CellState = 'live' | 'zero' | 'unwired' | 'external'

export interface BoardCell {
  key: MetricKey
  state: CellState
  /** The short figure, e.g. "0 of 165" or "$13.51". Never a zero for an unwired cell. */
  value: string
  /** One short line under it, e.g. "named it". */
  note: string | null
  /** Where it comes from, or for an unwired cell what is missing. */
  source: string
  fix: string | null
  /** An external cell's link out. */
  href?: string
}

export interface BoardRow {
  product: PortfolioProduct
  cells: Record<MetricKey, BoardCell>
  /** Live paying customers and their monthly revenue, when revenue is wired. */
  paid: number | null
  mrrUsd: number | null
  /** Free sign-ups counted, when sign-ups are wired. */
  signups: number | null
}

export interface BoardGap { product: PortfolioProduct; metric: MetricKey; label: string; gap: string; fix: string | null }

export interface CustomerLite {
  product: string
  kind: string
  mrr_usd?: number | null
  churned_at?: string | null
  /** Read only to count Full Time's pilot listeners (src/lib/pilotListeners.ts). */
  raw?: Record<string, unknown> | null
}

export interface UsageLite { product: string; metric_date: string; active_users: number | null }

export interface BoardInput {
  signals: ReadonlyArray<ProductSignal>
  reviews: ReadonlyArray<Pick<CouncilReviewRow, 'product_slug' | 'week_start' | 'double_down'>>
  customers: ReadonlyArray<CustomerLite>
  /** Free sign-ups per leads.audience_sources tag (e.g. { ctrl: 103 }). Missing key = not read. */
  audience: Readonly<Record<string, number>>
  usage: ReadonlyArray<UsageLite>
  /**
   * Whether the Full Time listener copy has ever succeeded, and if not, why,
   * in one plain line. Missing = not read, which counts as not connected.
   */
  listenerSync?: { ok: boolean; line: string | null } | null
}

const DAY_MS = 86_400_000

function dayMonth(ymd: string): string {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ymd
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function fmtUsd(v: number): string {
  if (v === 0) return '$0'
  if (v < 100) return `$${v.toFixed(2)}`
  return `$${Math.round(v).toLocaleString('en-US')}`
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function unwired(key: MetricKey, p: PortfolioProduct): BoardCell {
  const s = p.sources[key]
  return { key, state: 'unwired', value: 'Not wired', note: null, source: s.gap ?? 'Nothing reads this yet.', fix: s.fix ?? null }
}

/** Read in another tool by Krish's choice: a link out, never a zero and never a gap. */
function external(key: MetricKey, p: PortfolioProduct): BoardCell | null {
  const x = p.externalDashboard
  if (!x || !x.metrics.includes(key) || p.sources[key].source) return null
  return { key, state: 'external', value: `In ${x.label}`, note: `opens ${x.label}`, source: x.why, fix: null, href: x.href }
}

function cell(key: MetricKey, p: PortfolioProduct, state: Exclude<CellState, 'unwired' | 'external'>, value: string, note: string | null): BoardCell {
  return { key, state, value, note, source: p.sources[key].source ?? '', fix: null }
}

export function buildBoard(input: BoardInput, now: Date): { rows: BoardRow[]; gaps: BoardGap[] } {
  const rows = PORTFOLIO.map((p): BoardRow => {
    const sig = input.signals.find(s => s.slug === p.growthSlug || s.venture === p.venture) ?? null
    const mine = p.customerProduct ? input.customers.filter(c => c.product === p.customerProduct) : []
    const live = mine.filter(c => c.kind === 'paid' && !c.churned_at)
    const mrr = live.reduce((s, c) => s + (Number(c.mrr_usd) || 0), 0)

    // AEO / GEO
    let aeo: BoardCell
    if (!p.sources.aeo.source) aeo = unwired('aeo', p)
    else if (!sig || sig.aiAnswers.asked === 0) aeo = cell('aeo', p, 'zero', 'None asked', 'no check in 30 days')
    else aeo = cell('aeo', p, sig.aiAnswers.mentioned > 0 ? 'live' : 'zero', `${sig.aiAnswers.mentioned} of ${sig.aiAnswers.asked}`, 'answers name it')

    // Analytics: the GA4 site read first, then PostHog weekly users.
    let analytics: BoardCell
    if (!p.sources.analytics.source) analytics = external('analytics', p) ?? unwired('analytics', p)
    else if (p.webPrefix && sig?.visits) {
      analytics = cell('analytics', p, sig.visits.cur > 0 ? 'live' : 'zero', plural(sig.visits.cur, 'visit'), `this week, ${sig.visits.prev} the week before`)
    } else if (p.metricsProduct) {
      const u = input.usage
        .filter(r => r.product === p.metricsProduct)
        .sort((a, b) => (a.metric_date < b.metric_date ? 1 : -1))[0]
      if (!u || u.active_users == null) analytics = cell('analytics', p, 'zero', 'No read yet', 'nothing counted')
      else {
        const age = (now.getTime() - new Date(`${u.metric_date}T00:00:00Z`).getTime()) / DAY_MS
        analytics = cell('analytics', p, u.active_users > 0 ? 'live' : 'zero', plural(u.active_users, 'user'),
          age > 10 ? `last counted ${dayMonth(u.metric_date)}` : 'active this week')
      }
    } else analytics = cell('analytics', p, 'zero', 'No read yet', 'nothing counted')

    // Sign-ups: free and waitlist, never anyone paying.
    let signups: BoardCell
    let signupCount: number | null = null
    if (!p.sources.signups.source) signups = external('signups', p) ?? unwired('signups', p)
    else if (p.goal && p.customerProduct === LISTENER_PRODUCT) {
      // Full Time: pilot listeners against Krish's target. Counted from the
      // listener rows alone, so no other product's sign-ups can reach it.
      // Until the copy has succeeded once, the ledger holds no listener rows
      // and a 0 would look measured, so the cell says what is missing.
      if (input.listenerSync?.ok !== true) {
        signups = {
          key: 'signups', state: 'unwired', value: 'Not connected', note: null,
          source: input.listenerSync?.line ?? 'The copy of Full Time accounts has not run yet, so pilot listeners cannot be counted.',
          fix: 'Give Control Center the read key for Full Time’s database.',
        }
      } else {
        signupCount = countPilotListeners(mine)
        signups = cell('signups', p, signupCount > 0 ? 'live' : 'zero', `${signupCount} of ${p.goal.target}`, p.goal.noun)
      }
    } else {
      const fromAudience = p.audienceSource ? input.audience[p.audienceSource] : undefined
      const free = mine.filter(c => c.kind === 'free_signup' || c.kind === 'trial').length
      const wait = mine.filter(c => c.kind === 'waitlist').length
      signupCount = (fromAudience ?? 0) + free + wait
      const note = wait > 0 && signupCount === wait ? 'on the waitlist' : wait > 0 ? `${wait} on the waitlist` : 'free, not paying'
      signups = cell('signups', p, signupCount > 0 ? 'live' : 'zero', String(signupCount), note)
    }

    // Suggestions: the newest Sunday review's double-down list.
    const reviews = input.reviews
      .filter(r => r.product_slug === p.growthSlug)
      .sort((a, b) => (a.week_start < b.week_start ? 1 : -1))
    const latest = reviews[0]
    const suggestions = latest
      ? cell('suggestions', p, 'live', plural(asList(latest.double_down).length, 'move'), `review of ${dayMonth(latest.week_start)}`)
      : cell('suggestions', p, 'zero', 'No review yet', 'needs places first')

    // Growth hacks: the places map.
    const places = sig?.places ?? { covered: 0, total: 0, waiting: 0 }
    const hacks = places.total === 0
      ? cell('hacks', p, 'zero', 'None mapped', 'no places yet')
      : cell('hacks', p, places.covered > 0 ? 'live' : 'zero', `${places.covered} of ${places.total}`,
        'places covered')

    // Revenue
    const revenue = !p.sources.revenue.source
      ? external('revenue', p) ?? unwired('revenue', p)
      : mrr > 0
        ? cell('revenue', p, 'live', `${fmtUsd(mrr)}/mo`, plural(live.length, 'paying customer'))
        : cell('revenue', p, 'zero', 'None yet', 'no one paying')

    return {
      product: p,
      cells: { aeo, analytics, signups, suggestions, hacks, revenue },
      paid: p.sources.revenue.source ? live.length : null,
      mrrUsd: p.sources.revenue.source ? mrr : null,
      signups: signupCount,
    }
  })

  // What to wire next: every unwired cell, priority first, then the products
  // with no places mapped, since a product with no places gets no review.
  const gaps: BoardGap[] = []
  for (const r of rows) {
    for (const m of METRICS) {
      const c = r.cells[m.key]
      if (c.state === 'unwired') gaps.push({ product: r.product, metric: m.key, label: m.label, gap: c.source, fix: c.fix })
    }
    if (r.cells.hacks.value === 'None mapped') {
      gaps.push({ product: r.product, metric: 'hacks', label: 'Growth hacks', gap: 'No places are mapped, so the Sunday review skips it.', fix: 'Map where its buyers already go on Growth, Places.' })
    }
  }
  gaps.sort((a, b) => a.product.tier - b.product.tier || PORTFOLIO.indexOf(a.product) - PORTFOLIO.indexOf(b.product))
  return { rows, gaps }
}

/** The sentence under the title: who is paying, and how much of priority 1 can be seen. */
export function subscriptionsSummary(
  rows: BoardRow[],
  revenue: { active_subscriptions: number; substack?: { active_subscriptions: number } } | null,
): string {
  const parts: string[] = []
  if (revenue) {
    const n = revenue.active_subscriptions
    const viaSubstack = revenue.substack?.active_subscriptions ?? 0
    if (n === 0) parts.push('Nobody is paying on a subscription yet.')
    else if (viaSubstack === n) parts.push(`${n} paying, ${n === 1 ? 'through' : 'all through'} the Substack.`)
    else if (viaSubstack > 0) parts.push(`${n} paying, ${viaSubstack} of them through the Substack.`)
    else parts.push(`${n} paying.`)
  }
  const p1 = rows.filter(r => r.product.tier === 1)
  if (p1.length) {
    const total = p1.length * METRICS.length
    const wired = p1.reduce((s, r) => s + METRICS.filter(m => r.cells[m.key].state !== 'unwired').length, 0)
    // A number read in Shopify on purpose is accounted for, not missing.
    const outside = p1.reduce((s, r) => s + METRICS.filter(m => r.cells[m.key].state === 'external').length, 0)
    const tools = Array.from(new Set(p1.map(r => r.product.externalDashboard?.label).filter(Boolean))).join(' and ')
    const where = outside ? `, ${outside} of them in ${tools}` : ''
    parts.push(wired === total ? `Priority 1 shows all ${total} of its numbers${where}.` : `Priority 1 shows ${wired} of its ${total} numbers${where}; the rest are not wired yet.`)
  }
  return parts.join(' ')
}
