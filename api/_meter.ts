import { priceUsd, isPriced } from './_prices.js'

/**
 * Supabase, lazily.
 *
 * `_supabase.ts` THROWS at module scope when the service credentials are
 * missing, which is why api/_content.ts imports it inside loadConfig rather
 * than at the top — a comment there calls that placement load-bearing. This
 * module is imported statically by _content, _harness, _relevance and _stream,
 * every one of which is also run by the eval scripts outside Vercel with no
 * Supabase env at all. A static import here would crash all of them at load.
 * So the client is resolved per call, cached after the first, and a missing
 * environment makes metering a no-op instead of an outage.
 */
type Db = Awaited<typeof import('./_supabase.js')>['supabase']
let dbPromise: Promise<Db | null> | null = null
function db(): Promise<Db | null> {
  if (!dbPromise) {
    dbPromise = import('./_supabase.js').then(m => m.supabase).catch(() => null)
  }
  return dbPromise
}

// Read and write the usage meter (public.meter_daily).
//
// One shape for every provider, so the UI can rank an Apify actor, an n8n
// workflow and an Anthropic agent against each other without three code paths:
//
//   provider   who bills for it
//   unit_kind  what a row is one of — 'actor' | 'workflow' | 'agent'
//   unit_key   the provider's stable id for that unit
//   bucket     the one sub-dimension worth splitting by (run origin, execution
//              mode, model) — '' when there is none
//
// The two write paths are NOT interchangeable, and picking the wrong one is the
// bug that would make every number here worthless:
//
//   replaceDays()  Provider-derived truth. The collector recomputes a whole day
//                  from the provider's own records and overwrites. Safe to
//                  re-run, safe with overlapping windows, cannot double-count.
//   add()          Self-metered events, one call at a time, as they happen.
//                  Accumulates. Never use it for a value the provider can
//                  restate, or a re-sync will stack on top of what is there.

export type MeterProvider = 'apify' | 'n8n' | 'anthropic'
export type MeterUnitKind = 'actor' | 'workflow' | 'agent'

export interface MeterRow {
  provider: MeterProvider
  unit_kind: MeterUnitKind
  unit_key: string
  /** UTC calendar day, YYYY-MM-DD. */
  day: string
  bucket: string
  unit_label: string | null
  category: string | null
  usd: number
  runs: number
  failed: number
  units: number
  /** What `units` counts: 'compute-units' | 'executions' | 'tokens'. */
  unit_name: string | null
}

/** UTC calendar day of an instant, as the meter stores it. */
export function dayKey(d: Date | string | number): string {
  const t = d instanceof Date ? d : new Date(d)
  return Number.isNaN(t.getTime()) ? '' : t.toISOString().slice(0, 10)
}

/** N days back from now, as a UTC day key. */
export function daysAgoKey(n: number): string {
  return dayKey(Date.now() - n * 86_400_000)
}

/**
 * Overwrite whole meter cells with provider-derived truth.
 *
 * Chunked because a wide window over a busy account is thousands of rows and
 * PostgREST has a payload ceiling. Returns how many rows landed; a failure is
 * reported, not thrown — a collector that half-succeeded should say so and
 * leave the rest of its work intact.
 */
export async function replaceDays(rows: MeterRow[]): Promise<{ written: number; error: string | null }> {
  if (!rows.length) return { written: 0, error: null }
  const supabase = await db()
  if (!supabase) return { written: 0, error: 'supabase not configured' }
  const CHUNK = 500
  let written = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK).map(r => ({ ...r, updated_at: new Date().toISOString() }))
    const { error } = await supabase
      .from('meter_daily')
      .upsert(slice, { onConflict: 'provider,unit_kind,unit_key,day,bucket' })
    if (error) return { written, error: error.message }
    written += slice.length
  }
  return { written, error: null }
}

/**
 * Add one self-metered event to its cell.
 *
 * Fire-and-forget by contract: metering must never break the work it measures,
 * so every failure is swallowed. The cost is one round trip on a path that
 * already spent seconds waiting on a model.
 */
export async function add(e: {
  provider: MeterProvider
  unitKind: MeterUnitKind
  unitKey: string
  bucket?: string
  label?: string | null
  category?: string | null
  usd?: number
  runs?: number
  failed?: number
  units?: number
  unitName?: string | null
  /** Defaults to today. */
  day?: string
}): Promise<void> {
  try {
    const supabase = await db()
    if (!supabase) return
    await supabase.rpc('meter_add', {
      p_provider: e.provider,
      p_unit_kind: e.unitKind,
      p_unit_key: e.unitKey,
      p_day: e.day || dayKey(Date.now()),
      p_bucket: e.bucket || '',
      p_unit_label: e.label ?? null,
      p_category: e.category ?? null,
      p_usd: e.usd ?? 0,
      p_runs: e.runs ?? 1,
      p_failed: e.failed ?? 0,
      p_units: e.units ?? 0,
      p_unit_name: e.unitName ?? null,
    })
  } catch { /* metering is never load-bearing */ }
}

export interface MeterUnit {
  provider: MeterProvider
  unit_kind: MeterUnitKind
  unit_key: string
  label: string
  category: string | null
  usd: number
  runs: number
  failed: number
  units: number
  unit_name: string | null
  /** Spend inside the shorter recent window, for "is this one accelerating". */
  usd_recent: number
  /** Sub-dimension totals, biggest first: origins, modes, models. */
  buckets: Array<{ bucket: string; usd: number; runs: number }>
  last_day: string
}

/**
 * Roll the meter up per unit over a window.
 *
 * `recentDays` is a second, shorter window scored in the same pass so the
 * caller can say "and half of that was this week" without a second query.
 */
export async function readUnits(opts: {
  sinceDay: string
  recentSinceDay?: string
  providers?: MeterProvider[]
  limit?: number
}): Promise<{ units: MeterUnit[]; total_usd: number; error: string | null }> {
  const supabase = await db()
  if (!supabase) return { units: [], total_usd: 0, error: 'supabase not configured' }
  let q = supabase
    .from('meter_daily')
    .select('provider, unit_kind, unit_key, day, bucket, unit_label, category, usd, runs, failed, units, unit_name')
    .gte('day', opts.sinceDay)
    .order('day', { ascending: false })
    .limit(opts.limit ?? 5000)
  if (opts.providers?.length) q = q.in('provider', opts.providers)

  const { data, error } = await q
  if (error) return { units: [], total_usd: 0, error: error.message }

  const agg = new Map<string, MeterUnit & { _buckets: Map<string, { usd: number; runs: number }> }>()
  let total = 0
  for (const r of (data || []) as Array<Record<string, unknown>>) {
    const provider = String(r.provider) as MeterProvider
    const unit_kind = String(r.unit_kind) as MeterUnitKind
    const unit_key = String(r.unit_key)
    const id = `${provider}|${unit_kind}|${unit_key}`
    const usd = Number(r.usd) || 0
    const runs = Number(r.runs) || 0
    const day = String(r.day)
    total += usd

    let u = agg.get(id)
    if (!u) {
      u = {
        provider, unit_kind, unit_key,
        label: (r.unit_label as string) || unit_key,
        category: (r.category as string) ?? null,
        usd: 0, runs: 0, failed: 0, units: 0,
        unit_name: (r.unit_name as string) ?? null,
        usd_recent: 0, buckets: [], last_day: day,
        _buckets: new Map(),
      }
      agg.set(id, u)
    }
    u.usd += usd
    u.runs += runs
    u.failed += Number(r.failed) || 0
    u.units += Number(r.units) || 0
    if (r.unit_label) u.label = String(r.unit_label)
    if (r.category) u.category = String(r.category)
    if (r.unit_name) u.unit_name = String(r.unit_name)
    if (day > u.last_day) u.last_day = day
    if (opts.recentSinceDay && day >= opts.recentSinceDay) u.usd_recent += usd

    const b = String(r.bucket || '')
    if (b) {
      const cur = u._buckets.get(b) || { usd: 0, runs: 0 }
      cur.usd += usd
      cur.runs += runs
      u._buckets.set(b, cur)
    }
  }

  const units = [...agg.values()]
    .map(({ _buckets, ...u }) => ({
      ...u,
      usd: round6(u.usd),
      usd_recent: round6(u.usd_recent),
      units: Math.round(u.units * 100) / 100,
      buckets: [..._buckets.entries()]
        .map(([bucket, v]) => ({ bucket, usd: round6(v.usd), runs: v.runs }))
        .sort((a, b) => b.usd - a.usd || b.runs - a.runs),
    }))
    // Dollars first, then volume — an unpriced provider (n8n) still ranks.
    .sort((a, b) => b.usd - a.usd || b.runs - a.runs)

  return { units, total_usd: round6(total), error: null }
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6

// ── Anthropic self-metering ─────────────────────────────────────────────────
//
// The API key cannot read Anthropic's billing: the usage and cost reports are
// Admin-key endpoints, and an Admin key does not exist for an individual
// account. So the OS meters itself — every call records the token counts
// Anthropic returned on the response, priced from _prices.ts, stamped with the
// agent that made it.
//
// What this therefore CANNOT see, stated here so it is never quietly forgotten:
// any Anthropic call made outside these helpers. An n8n node holding its own
// Anthropic credential bills Krish's account and never touches this code. The
// one such path the OS owns — n8n workflows that POST to
// /api/internal/sonnet-proxy — IS metered, stamped with their X-Internal-Caller.
// Everything else shows up only on the invoice, which is why the invoice
// remains the source of truth for total Anthropic spend and this meter answers
// the different question: which agent, of the ones we run, is spending.

export const UNATTRIBUTED = 'unattributed'

/** Agent stamps become unit keys, so they are normalised once, here. */
export function normalizeAgent(raw: string | null | undefined): string {
  const s = (raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s ? s.slice(0, 48) : UNATTRIBUTED
}

/**
 * Record one Anthropic call against the agent that made it.
 *
 * `units` is total tokens; `usd` is the priced split, which is the number that
 * matters (output costs five times input). A model with no known rate records
 * its tokens with usd 0 — deliberately a visible gap rather than a guess.
 */
export async function anthropicCall(e: {
  agent?: string | null
  model: string
  inputTokens: number
  outputTokens: number
  /** A call that errored after tokens were produced still cost money. */
  failed?: boolean
}): Promise<void> {
  const tokens = (e.inputTokens || 0) + (e.outputTokens || 0)
  if (!tokens) return
  await add({
    provider: 'anthropic',
    unitKind: 'agent',
    unitKey: normalizeAgent(e.agent),
    bucket: e.model,
    label: normalizeAgent(e.agent),
    category: isPriced(e.model) ? 'priced' : 'unpriced-model',
    usd: priceUsd(e.model, e.inputTokens || 0, e.outputTokens || 0),
    runs: 1,
    failed: e.failed ? 1 : 0,
    units: tokens,
    unitName: 'tokens',
  })
}
