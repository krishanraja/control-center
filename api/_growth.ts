// _growth: shared allow-lists and small helpers for the Growth tab API routes
// (touchpoints / creative / council / probes).
//
// Every set here mirrors a CHECK constraint on the matching growth_* table in
// Supabase, so a bad value comes back as a readable 400 instead of a raw
// Postgres constraint error.

export const PRODUCT_SLUGS = new Set(['ctrl', 'circle', 'pulse', 'full-time', 'mindmake'])

export const TOUCHPOINT_CHANNELS = new Set([
  'seo', 'geo', 'social_organic', 'social_paid', 'substack',
  'partner', 'community', 'product', 'podcast', 'maven',
])

export const COVERAGE_STATUSES = new Set(['unaddressed', 'in_progress', 'covered', 'retired'])

export const CREATIVE_STAGES = new Set(['brief', 'script', 'producing', 'produced', 'posted', 'dropped'])

/** Trim a string field, returning null for blank so we never store empty text. */
export function text(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s : null
}

/** Validate an optional 1-10 score. Returns { ok, value } so null stays legal. */
export function score(v: unknown): { ok: boolean; value: number | null } {
  if (v == null || v === '') return { ok: true, value: null }
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 10) return { ok: false, value: null }
  return { ok: true, value: n }
}

/** Resolve the row id from the body (these routes are collection endpoints). */
export function bodyId(req: { body?: unknown }): string | null {
  const b = (req.body || {}) as { id?: unknown }
  const v = b.id == null ? '' : String(b.id).trim()
  return v || null
}

/** ISO date (yyyy-mm-dd) of the Monday that owns a given day. */
export function mondayOf(d: Date): string {
  const day = d.getUTCDay()
  const back = day === 0 ? 6 : day - 1
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back))
  return m.toISOString().slice(0, 10)
}
