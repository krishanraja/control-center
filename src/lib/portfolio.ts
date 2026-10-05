/**
 * THE product portfolio: which products Krish is growing, in what order, and
 * where each of the six growth numbers comes from.
 *
 * ONE list. Growth and Subscriptions both read it, so the same products appear
 * in the same order with the same six columns on both tabs, and the weekly
 * growth review (api/growth/council-run.ts) reviews the same set. Before this,
 * Growth held its own five-product list (src/lib/growth.ts PRODUCTS),
 * Subscriptions sorted by whoever was paying most, and the review had a third
 * copy, so a new product had to be added in three places and never was.
 *
 * Ruling (Krish, 2026-10-05): Heartside and Full Time are priority 1,
 * Legibility priority 2, CTRL and Pulse priority 3. Advisory and Circle stay
 * tracked on Growth but carry no rank.
 *
 * Zero imports, no DOM, no import.meta: the serverless tree imports this file
 * too ('../../src/lib/portfolio.js'), like ventureOptions.ts and webProperties.ts.
 *
 * The slugs are NOT unified, because each is a foreign key, a CHECK value or an
 * enum label in a live table. This file records every spelling in one row:
 *   venture        venture_registry.slug (and the label via ventureLabel)
 *   growthSlug     growth_* tables' product_slug
 *   customerProduct customers.product (the customer_product enum)
 *   webPrefix      src/lib/webProperties.ts prefix (GA4 site read), if any
 *   metricsProduct product_metrics.product (PostHog nightly), if any
 *   audienceSource leads.audience_sources tag for free sign-ups, if any
 *
 * An unwired number is never a zero. Each metric names its source, or says in
 * one plain line what is missing, and the UI prints that line instead of 0.
 */

export type Tier = 1 | 2 | 3

/** The six things both tabs report for every product, in this order. Krish's own words. */
export type MetricKey = 'aeo' | 'analytics' | 'signups' | 'suggestions' | 'hacks' | 'revenue'

export const METRICS: ReadonlyArray<{ key: MetricKey; label: string; about: string }> = [
  { key: 'aeo', label: 'AEO / GEO', about: 'AI answers that name the product, last 30 days' },
  { key: 'analytics', label: 'Analytics', about: 'Site visits or active users this week' },
  { key: 'signups', label: 'Sign-ups', about: 'Free sign-ups and waitlist, not paying' },
  { key: 'suggestions', label: 'Suggestions', about: 'What the weekly growth review says to double down on' },
  { key: 'hacks', label: 'Growth hacks', about: 'Places buyers already go, and how many are covered' },
  { key: 'revenue', label: 'Revenue', about: 'Committed monthly revenue from paying customers' },
]

export interface MetricSource {
  /** Where the number is read from, in plain words. Null when nothing reads it yet. */
  source: string | null
  /** When source is null: what is missing, one plain line, said instead of a zero. */
  gap?: string
  /** When source is null: the one thing that would wire it. */
  fix?: string
}

export interface PortfolioProduct {
  venture: string
  label: string
  tier: Tier
  domain: string | null
  /** One plain line on what it is. */
  what: string
  /** A launch date still ahead, ISO day. Null once live. */
  opensOn: string | null
  growthSlug: string
  customerProduct: string | null
  webPrefix: string | null
  metricsProduct: string | null
  audienceSource: string | null
  /** The attribution warehouse `app` name candidates, for the weekly review. */
  attributionApps: string[]
  sources: Record<MetricKey, MetricSource>
  /**
   * Where Krish reads numbers the OS does not, by his choice. The listed
   * metrics render as a link out to `href` instead of "Not wired", and they
   * drop out of "Wire next": they are not a gap the OS failed to fill, they
   * are measured somewhere else on purpose. Never a zero, never an MRR.
   */
  externalDashboard?: { href: string; label: string; metrics: MetricKey[]; why: string }
}

const REVIEW: MetricSource = { source: 'The Sunday growth review (growth_council_reviews)' }
const PLACES: MetricSource = { source: 'The places map (growth_touchpoints)' }
const PROBES: MetricSource = { source: 'The Monday AI answer check (growth_geo_probes)' }

export const PORTFOLIO: readonly PortfolioProduct[] = [
  {
    venture: 'heartside', label: 'Heartside', tier: 1, domain: 'heartside.io',
    what: 'Gifts written by your dog. A Shopify store selling to the US.',
    opensOn: '2026-10-20',
    growthSlug: 'heartside', customerProduct: 'heartside', webPrefix: null, metricsProduct: null, audienceSource: null,
    attributionApps: ['heartside'],
    sources: {
      aeo: { source: null, gap: 'No AI answer questions are set up for Heartside yet.', fix: 'Add a Heartside subject to the Monday AI answer check.' },
      analytics: { source: null, gap: 'heartside.io is still behind its password page and nothing reads its visits.', fix: 'Turn on Google Analytics in Shopify and add heartside.io to the site check.' },
      signups: { source: null, gap: 'Shopify email sign-ups are not read by the OS.', fix: 'Give the OS a read-only Shopify Admin API token.' },
      suggestions: REVIEW,
      hacks: PLACES,
      revenue: { source: null, gap: 'Shopify orders are not read by the OS.', fix: 'Give the OS a read-only Shopify Admin API token.' },
    },
    // Ruling (Krish, 2026-10-05): Heartside takes payment through Shopify
    // Payments, not Stripe, and he reads its visits, sign-ups and orders in
    // Shopify itself for now: "just link it out". One-off orders, so never an
    // MRR or "paying subscribers"; reported in USD.
    externalDashboard: {
      href: 'https://admin.shopify.com/store/bnf1em-ge/analytics',
      label: 'Shopify',
      metrics: ['analytics', 'signups', 'revenue'],
      why: 'Heartside sells one-off orders through Shopify Payments, so its visits, sign-ups and orders are read in Shopify, in USD.',
    },
  },
  {
    venture: 'full_time', label: 'Full Time', tier: 1, domain: 'fulltime.fm',
    what: 'Football recaps read by a pundit you pick. Free, with Pro at $4.99 a month.',
    opensOn: null,
    growthSlug: 'full-time', customerProduct: 'full_time', webPrefix: 'fulltime', metricsProduct: 'full_time', audienceSource: null,
    attributionApps: ['full-time', 'fulltime', 'full_time'],
    sources: {
      aeo: PROBES,
      analytics: { source: 'Google Analytics for fulltime.fm (the daily site check)' },
      signups: { source: null, gap: 'Full Time accounts live in its own database and are not copied to the OS.', fix: 'Bridge Full Time sign-ups into the OS the way CTRL sign-ups are.' },
      suggestions: REVIEW,
      hacks: PLACES,
      // In the pull since 2026-10-05: one organisation key reads all five
      // accounts, so this no longer waits on a per-account key. Zero here is a
      // measured zero, not an unwired one.
      revenue: { source: 'Stripe, Full Time account (daily pull). Checkout is wired and live; it has never collected a payment.' },
    },
  },
  {
    venture: 'legibility', label: 'Legibility', tier: 2, domain: 'legibility.io',
    what: 'Typed product data for AI agents, over REST and MCP. Private beta.',
    opensOn: null,
    growthSlug: 'legibility', customerProduct: 'legibility', webPrefix: 'legibility', metricsProduct: 'legibility', audienceSource: null,
    attributionApps: ['legibility'],
    sources: {
      aeo: { source: null, gap: 'No AI answer questions are set up for Legibility yet.', fix: 'Add a Legibility subject to the Monday AI answer check.' },
      analytics: { source: 'Google Analytics for legibility.io (the daily site check)' },
      signups: { source: null, gap: 'Legibility accounts live in its own database and are not copied to the OS.', fix: 'Send Legibility sign-ups into the audience pipeline.' },
      suggestions: REVIEW,
      hacks: PLACES,
      // In the pull since 2026-10-05 (see the Full Time note above).
      revenue: { source: 'Stripe, Legibility account (daily pull). Growth at $199 a month and Starter at $29 are live; every customer so far is a QA account or you.' },
    },
  },
  {
    venture: 'mm_ctrl', label: 'CTRL', tier: 3, domain: 'ctrl.mindmake.co',
    what: 'The AI brain app. It sells one thing, Edge Pro at $49 a month, and nobody has bought it.',
    opensOn: null,
    growthSlug: 'ctrl', customerProduct: 'mm_ctrl', webPrefix: null, metricsProduct: 'mm_ctrl', audienceSource: 'ctrl',
    attributionApps: ['ctrl'],
    sources: {
      aeo: PROBES,
      analytics: { source: 'PostHog weekly active users (product_metrics)' },
      signups: { source: 'CTRL sign-ups through the audience pipeline (leads)' },
      suggestions: REVIEW,
      hacks: PLACES,
      // Corrected 2026-10-05. This read "sold through the Substack", and the
      // price map agreed: all three Substack plans were mapped to mm_ctrl, so
      // the tab reported CTRL at $13.51 a month with 2 paying. Read live from
      // Stripe, those plans carry metadata.substack=yes and belong to the
      // publication. CTRL has zero paying customers; saying so is the point.
      // A MEASURED zero, not an unwired one, and the difference matters. CTRL
      // has a product (Edge Pro, $49 a month), an active price, a live Stripe
      // webhook and working checkout in the mm-ctrl edge functions, and its
      // account is in the daily pull. So nothing is missing: nobody has bought
      // it. "Not wired" would excuse that; 0 states it.
      revenue: { source: 'Stripe, Mindmaker LLC account (daily pull). CTRL sells Edge Pro at $49 a month through the mm-ctrl edge functions and has never taken a payment. The $8, $81 and A$115 plans that used to read here are the Substack’s and now read under the publication.' },
    },
  },
  {
    venture: 'fractionl_pulse', label: 'Pulse', tier: 3, domain: 'pulse.fractionl.ai',
    what: 'Market intelligence for fractional executives.',
    opensOn: null,
    growthSlug: 'pulse', customerProduct: 'fractionl_pulse', webPrefix: null, metricsProduct: 'fractionl_pulse', audienceSource: null,
    attributionApps: ['pulse'],
    sources: {
      aeo: PROBES,
      analytics: { source: 'PostHog weekly active users (product_metrics)' },
      signups: { source: 'The customers ledger (waitlist and free sign-ups)' },
      suggestions: REVIEW,
      hacks: PLACES,
      // Pulse has the prices and now the keys; what it does not have is a
      // checkout. Confirmed 2026-10-05: Pulse Pro exists on the Fractionl
      // account at $99 a month and $948 a year (Krish's ruling: keep that
      // pricing as the data feed licence, do not invent new price points), and
      // the Fractionl account is in the daily pull, so a payment would appear
      // here. Nothing in the Pulse app can start one.
      revenue: { source: null, gap: 'Pulse Pro exists in Stripe at $99 a month and $948 a year, and the Fractionl account is in the daily pull, but the Pulse app has no checkout so it cannot start a payment.', fix: 'Add a checkout to the Pulse app on the existing Pulse Pro prices.' },
    },
  },
]

/**
 * Tracked on Growth, reviewed on Sunday, never ranked. They sort after the
 * three tiers. Kept so the weekly review and the places map do not lose two
 * products' history the day the ranking arrived.
 */
export const UNRANKED_GROWTH: ReadonlyArray<{ venture: string; growthSlug: string; customerProducts: string[]; attributionApps: string[] }> = [
  { venture: 'mindmake', growthSlug: 'mindmake', customerProducts: ['mindmake', 'makeyourmindup', 'publication'], attributionApps: ['mindmake'] },
  { venture: 'fractionl_circle', growthSlug: 'circle', customerProducts: ['fractionl_circle'], attributionApps: ['circle'] },
]

/** Every product Growth and the weekly review cover, ranked first, in order. */
export const GROWTH_ORDER: readonly string[] = [
  ...PORTFOLIO.map(p => p.growthSlug),
  ...UNRANKED_GROWTH.map(p => p.growthSlug),
]

export const TIER_LABEL: Record<Tier, string> = { 1: 'Priority 1', 2: 'Priority 2', 3: 'Priority 3' }

export function portfolioProduct(slug: string | null | undefined): PortfolioProduct | null {
  if (!slug) return null
  return PORTFOLIO.find(p => p.venture === slug || p.growthSlug === slug || p.customerProduct === slug) ?? null
}

export function tierOf(slug: string | null | undefined): Tier | null {
  return portfolioProduct(slug)?.tier ?? null
}

/** Sort position: ranked products in list order, then unranked, then anything else. */
export function portfolioRank(slug: string | null | undefined): number {
  if (!slug) return 999
  const i = PORTFOLIO.findIndex(p => p.venture === slug || p.growthSlug === slug || p.customerProduct === slug)
  if (i >= 0) return i
  const j = UNRANKED_GROWTH.findIndex(p => p.venture === slug || p.growthSlug === slug)
  return j >= 0 ? PORTFOLIO.length + j : 999
}

/**
 * The Substack. Not a ranked product: it is where CTRL's paid tier is sold and
 * where the publication's free readers sign up, so both tabs account for it on
 * its own line. Paid subscribers arrive automatically: Substack charges through
 * the Mindmaker LLC Stripe account and every such plan carries
 * `metadata.substack = "yes"`, which the daily Stripe pull keeps. The price map
 * files those subscribers under CTRL, so they are counted once, there. Free
 * subscribers arrive only from the CSV export dropped on Subscriptions, because
 * Substack has no API.
 */
export const SUBSTACK = {
  label: 'Substack',
  publication: 'mindmakerlive.substack.com',
  paidCountedUnder: 'mm_ctrl',
  freeAudienceSource: 'publication',
  totalMetricKey: 'substack_publication_total',
} as const
