/**
 * THE ICP: who each product is for, defined once and read by the agents.
 *
 * Krish, 2026-10-05: "Can you add in Control Center somewhere I can define ICP
 * for each and it gets saved and acted on by the system durably?"
 *
 * The row lives in Supabase (`product_icp`, migration 20261005140000), keyed on
 * `venture_registry.slug`, which is the same key `src/lib/portfolio.ts` already
 * carries as `venture` for every product on the ladder. One ranking, one slug
 * space, one definition.
 *
 * This file holds the two things both sides of the wire need: the shape, and
 * the honest account of what an undefined ICP costs. The second is the point.
 * Before this, Maya's prospecting lane fell back to Mindmake's buyer titles for
 * any product that had none of its own, so a new product prospected the WRONG
 * buyer and the run still reported success. Silence was the bug. A product with
 * no ICP now says so, and names what is not running because of it.
 *
 * Zero imports, no DOM, no import.meta: the serverless tree imports this file
 * too ('../src/lib/icp.js'), like portfolio.ts and ventureOptions.ts.
 */

export interface ProductIcp {
  venture: string
  /** The titles a prospecting run searches for. Empty means do not prospect. */
  buyer_titles: string[]
  seniorities: string[]
  geos: string[]
  /** One plain line: who this is for. */
  who: string | null
  who_not: string | null
  company_shape: string | null
  buying_trigger: string | null
  notes: string | null
  /** Generated in Postgres: titles AND a who line. Never set by hand. */
  defined: boolean
  updated_at: string | null
  updated_by: string | null
}

/** The fields Krish edits. Everything else is stamped by the database. */
export const ICP_FIELDS = [
  'buyer_titles', 'seniorities', 'geos',
  'who', 'who_not', 'company_shape', 'buying_trigger', 'notes',
] as const
export type IcpField = (typeof ICP_FIELDS)[number]

export const ICP_LIST_FIELDS: ReadonlyArray<IcpField> = ['buyer_titles', 'seniorities', 'geos']

/**
 * Apollo's seniority vocabulary, which is what `seniorities` is sent as. Chips,
 * never a native select (AGENTS.md: "Choosing from a small set").
 */
export const SENIORITY_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'owner', label: 'Owner' },
  { id: 'founder', label: 'Founder' },
  { id: 'c_suite', label: 'C-suite' },
  { id: 'partner', label: 'Partner' },
  { id: 'vp', label: 'VP' },
  { id: 'head', label: 'Head of' },
  { id: 'director', label: 'Director' },
  { id: 'manager', label: 'Manager' },
]

export const GEO_OPTIONS: ReadonlyArray<string> = [
  'United States', 'United Kingdom', 'Australia', 'Canada', 'Ireland', 'New Zealand', 'Singapore',
]

/**
 * What stops when a product has no ICP. Each line names a real consumer in this
 * repo or the n8n fleet, so the empty state is a list of consequences rather
 * than a shrug. Keep it true: if a consumer stops reading the ICP, take its
 * line out.
 */
export interface IcpConsumer {
  id: string
  /** What it is, in Krish's vocabulary. */
  what: string
  /** What it cannot do without an ICP. */
  blocked: string
  /** True when the ICP is what gates it outright, rather than weakening it. */
  hard: boolean
}

export const ICP_CONSUMERS: ReadonlyArray<IcpConsumer> = [
  {
    id: 'maya_prospecting',
    what: 'Maya\'s daily prospecting run',
    blocked: 'It cannot search for anyone, because it has no buyer titles to search for. It skips this product and says why, rather than prospecting the wrong people.',
    hard: true,
  },
  {
    id: 'growth_review',
    what: 'The Sunday growth review',
    blocked: 'It judges the places map without knowing who it is trying to reach, so its suggestions are about channels rather than about buyers.',
    hard: false,
  },
  {
    id: 'acquisition_direction',
    what: 'The acquisition lane\'s writing brief',
    blocked: 'Outreach and replies are written with no stated audience, so they fall back to whatever the lane\'s prose happens to say.',
    hard: false,
  },
  {
    id: 'tab_grounding',
    what: 'Ask this tab',
    blocked: 'It cannot answer who the buyer is for this product.',
    hard: false,
  },
]

/** The ones an undefined ICP stops outright. */
export const HARD_BLOCKED = ICP_CONSUMERS.filter(c => c.hard)

/** An empty, undefined ICP for a product that has no row at all. */
export function blankIcp(venture: string): ProductIcp {
  return {
    venture,
    buyer_titles: [], seniorities: [], geos: [],
    who: null, who_not: null, company_shape: null, buying_trigger: null, notes: null,
    defined: false, updated_at: null, updated_by: null,
  }
}

/**
 * The same rule the generated `defined` column applies, for code that holds an
 * ICP it has not read back from Postgres yet. Postgres stays the authority.
 */
export function isDefined(icp: Pick<ProductIcp, 'buyer_titles' | 'who'> | null | undefined): boolean {
  if (!icp) return false
  return icp.buyer_titles.length > 0 && !!icp.who && icp.who.trim().length > 0
}

/**
 * One line for a prompt, or null when there is nothing honest to say. Every
 * agent-facing consumer goes through this, so none of them can invent an
 * audience and none of them can quietly borrow another product's.
 */
export function icpPromptLine(icp: ProductIcp | null | undefined): string | null {
  if (!isDefined(icp)) return null
  const i = icp as ProductIcp
  const parts = [`AUDIENCE (ICP): ${i.who}`]
  if (i.buyer_titles.length) parts.push(`Titles: ${i.buyer_titles.join(', ')}.`)
  if (i.company_shape) parts.push(`Companies: ${i.company_shape}`)
  if (i.buying_trigger) parts.push(`They buy when: ${i.buying_trigger}`)
  if (i.who_not) parts.push(`NOT for: ${i.who_not}`)
  if (i.geos.length) parts.push(`Where: ${i.geos.join(', ')}.`)
  return parts.join(' ')
}

/** What a consumer says about itself when the ICP is missing. Never a guess. */
export function icpMissingLine(venture: string): string {
  return `No ICP is defined for ${venture}. Say so rather than assuming a buyer, and never use another product's.`
}

/** Normalise the spellings a product slug arrives in onto venture_registry.slug. */
export function ventureKey(slug: string): string {
  return slug.trim().toLowerCase().replace(/-/g, '_')
}
