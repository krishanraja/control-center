// What the Growth API routes and the Growth UI both need to agree on.
//
// Zero imports, no DOM, no import.meta and no @/ alias, because this file is
// compiled twice, like src/lib/webProperties.ts: by the app (tsconfig.json)
// and by the serverless tree (tsconfig.api.json, NodeNext). The API imports it
// as '../../src/lib/growthWire.js', the UI as '../lib/growthWire'.

// ---------- the weekly review ----------

/**
 * The krish_decision written onto an older week's review when the old weeks
 * are cleared in one go (PATCH /api/growth/council { action: 'clear_old' }).
 *
 * krish_decision is free text with no CHECK, and setting it is the only thing
 * that "rules" a review: council-run skips a product whose row for that week
 * is already ruled, and Ask Marcus reads the text as context. So a cleared
 * week says plainly that it was cleared, not judged, and the UI can tell a
 * cleared week from a real ruling by this exact string.
 */
export const CLEARED_OLD_WEEK = 'Cleared: an older week'

// ---------- where you rank on Google ----------

/** One keyword, as GET /api/growth/seo-rank serves it: the newest check of that keyword for that product. */
export interface SeoRankRow {
  id: string
  keyword: string
  /** The registry slug (mm_ctrl, fractionl_pulse, legibility), normalised through the ventureLabel aliases. */
  product: string
  /** Google position at the last check; null = not in the results the check reads. Lower is better. */
  position: number | null
  previous_position: number | null
  /** Monthly searches; null = never measured, never 0. */
  monthly_searches: number | null
  priority: number | null
  impressions: number | null
  clicks: number | null
  /** The last check of this keyword (falls back to when it was first found). */
  checked_at: string | null
}

export interface SeoRankResponse {
  ok: true
  /** The newest check across every row, or null when there are none. */
  checked_at: string | null
  count: number
  rows: SeoRankRow[]
}

/** PostgREST serialises Postgres numeric as a JSON string, so position "10" < "9" would be true. Coerce once. */
export function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function stamp(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null
  return Number.isFinite(Date.parse(v)) ? v : null
}

function ms(v: string | null): number {
  const t = v ? Date.parse(v) : NaN
  return Number.isFinite(t) ? t : -Infinity
}

/**
 * maya_striking_distance rows into the served shape: product slugs normalised
 * with `canonical` (pass canonicalVentureSlug from src/lib/ventureOptions, so
 * there is one alias map), numbers coerced, and only the newest check kept per
 * product and keyword (keyword compared trimmed and case-folded). Sorted the
 * way the panel reads it: priority first (unscored last), then monthly
 * searches (unmeasured last), then keyword, then id, so equal rows never swap.
 */
export function normaliseSeoRows(raw: unknown, canonical: (slug: string) => string): SeoRankRow[] {
  const rows = Array.isArray(raw) ? raw : []
  const newest = new Map<string, SeoRankRow>()
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const keyword = typeof o.query === 'string' ? o.query.trim() : typeof o.keyword === 'string' ? o.keyword.trim() : ''
    const productRaw = typeof o.product === 'string' ? o.product.trim() : ''
    if (!keyword || !productRaw) continue
    const product = canonical(productRaw) || productRaw
    const row: SeoRankRow = {
      id: String(o.id ?? `${product}:${keyword}`),
      keyword,
      product,
      position: toNumberOrNull(o.current_position ?? o.position),
      previous_position: toNumberOrNull(o.previous_position),
      monthly_searches: toNumberOrNull(o.search_volume ?? o.monthly_searches),
      priority: toNumberOrNull(o.priority),
      impressions: toNumberOrNull(o.impressions),
      clicks: toNumberOrNull(o.clicks),
      checked_at: stamp(o.last_checked_at) ?? stamp(o.checked_at) ?? stamp(o.found_at),
    }
    const key = `${product}|${keyword.toLowerCase().replace(/\s+/g, ' ')}`
    const had = newest.get(key)
    if (!had || ms(row.checked_at) > ms(had.checked_at) || (ms(row.checked_at) === ms(had.checked_at) && row.id > had.id)) {
      newest.set(key, row)
    }
  }
  const desc = (a: number | null, b: number | null) => (b ?? -Infinity) - (a ?? -Infinity)
  return [...newest.values()].sort((a, b) =>
    desc(a.priority, b.priority)
    || desc(a.monthly_searches, b.monthly_searches)
    || a.keyword.localeCompare(b.keyword)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** The newest checked_at across rows, or null. */
export function newestCheck(rows: SeoRankRow[]): string | null {
  let best: string | null = null
  for (const r of rows) if (r.checked_at && ms(r.checked_at) > ms(best)) best = r.checked_at
  return best
}
