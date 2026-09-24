import { priceUsd, priceUsdDetailed, priceUsdUncached, readUsage, isPriced, type TokenUsage } from './_prices.js'

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

// 'google' is here for the fleet's Gemini fallback nodes, which bill Google
// rather than Anthropic when Anthropic stops answering. Without it a spend cap
// would read in meter_daily as the fleet going quiet instead of the fleet
// changing provider. meter_daily has no CHECK on provider — the primary key is
// (provider, unit_kind, unit_key, day, bucket) — so widening this union is the
// whole change.
export type MeterProvider = 'apify' | 'n8n' | 'anthropic' | 'google' | 'openai' | 'openrouter'
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
  /**
   * Cached tokens, kept apart from `units` and from each other.
   *
   * Netting reads against writes would hide the one failure worth catching: a
   * site that writes cache entries nobody reads pays MORE than one with no
   * caching at all, because a write is priced above an ordinary input token
   * and a read is priced at a tenth of one. Two columns, so the ratio between
   * them is visible and a write-only site shows up as exactly what it is.
   */
  cache_read_tokens?: number
  cache_write_tokens?: number
  /** What the same work would have cost with no caching. usd minus this is the saving. */
  usd_uncached?: number
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
  cacheReadTokens?: number
  cacheWriteTokens?: number
  /** What this call would have cost uncached, so the saving is a stored number. */
  usdUncached?: number
  /** Defaults to today. */
  day?: string
}): Promise<void> {
  try {
    const supabase = await db()
    if (!supabase) return
    const { error } = await supabase.rpc('meter_add', {
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
      p_cache_read_tokens: e.cacheReadTokens ?? 0,
      p_cache_write_tokens: e.cacheWriteTokens ?? 0,
      p_usd_uncached: e.usdUncached ?? e.usd ?? 0,
    })
    // METERING IS NEVER LOAD-BEARING, BUT IT MUST BE ABLE TO SAY IT FAILED.
    //
    // supabase-js RETURNS errors here, it does not throw them, so the catch
    // below never saw a rejected write: the result was discarded and every
    // failure looked exactly like a successful one. Combined with the catch,
    // this function could not report anything at all.
    //
    // What that hides is the whole instrument going dark. Every Anthropic agent
    // in meter_daily stops on 2026-09-15 on the same day, control-center's own
    // and content-engine's alike, while the apify and n8n rows written by the
    // sync crons continue. Read off the dashboard that is "we spent nothing",
    // which is the most expensive sentence this codebase can say silently.
    //
    // Still swallowed, still never thrown: a failed meter write must not fail
    // the work it was measuring. But it is now SAID, once per failure, so the
    // difference between "no spend" and "no measurement" reaches a log.
    if (error) console.warn(`[meter] write failed for ${e.provider}/${e.unitKey}: ${error.message || error}`)
  } catch (e2) {
    console.warn(`[meter] write threw for ${e.provider}/${e.unitKey}: ${(e2 as Error)?.message || e2}`)
  }
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
  inputTokens?: number
  outputTokens?: number
  /**
   * The raw `usage` object from the response, preferred over the two counts.
   *
   * Every call site used to pluck input_tokens and output_tokens by hand and
   * drop everything else, which is why cache savings were invisible across the
   * whole OS: five sites, five places to forget. Passing the object through
   * means the cache fields are read in exactly one place, and a site that
   * starts caching tomorrow is measured without touching it.
   */
  usage?: unknown
  /** A call that errored after tokens were produced still cost money. */
  failed?: boolean
}): Promise<void> {
  const u: TokenUsage = e.usage
    ? readUsage(e.usage)
    : { input: e.inputTokens || 0, output: e.outputTokens || 0 }
  const cached = (u.cacheRead || 0) + (u.cacheWrite5m || 0) + (u.cacheWrite1h || 0)
  const tokens = u.input + u.output + cached
  if (!tokens) return
  await add({
    provider: 'anthropic',
    unitKind: 'agent',
    unitKey: normalizeAgent(e.agent),
    bucket: e.model,
    label: normalizeAgent(e.agent),
    category: isPriced(e.model) ? 'priced' : 'unpriced-model',
    usd: priceUsdDetailed(e.model, u),
    usdUncached: priceUsdUncached(e.model, u),
    runs: 1,
    failed: e.failed ? 1 : 0,
    units: tokens,
    unitName: 'tokens',
    cacheReadTokens: u.cacheRead || 0,
    cacheWriteTokens: (u.cacheWrite5m || 0) + (u.cacheWrite1h || 0),
  })
}

/**
 * The rescue provider's spend, recorded the same way Anthropic's is.
 *
 * Not optional. The fleet already learned this once: n8n's LLM calls went
 * unmetered and the dashboard reported $0.00 beside a real bill, which made the
 * whole automation layer look free. A rescue provider that nobody measures is
 * the same bug with a better excuse.
 *
 * THE DOLLARS COME FROM THE BILLER, NOT FROM _prices.ts, and that is deliberate
 * rather than an oversight to tidy up later. OpenRouter returns `usage.cost` in
 * real dollars on every call, so `usd` here is the charge itself instead of a
 * figure derived from a rate table. The rescue slugs (anthropic/claude-sonnet-5
 * and friends, dots not dashes) therefore have NO row in _prices.ts and must
 * not be given one: a second rate that has to agree with the invoice and is
 * edited independently eventually disagrees, silently, and this repo has
 * already paid for that lesson once with two identical price tables.
 *
 * The category is `priced` when a cost came back and `unpriced-model` when it
 * did not, which keeps the same contract the Anthropic rows have: a row with
 * real tokens and no dollars is visibly a gap rather than a quiet zero.
 *
 * One consequence, stated rather than hidden: `usdUncached` is left unset, so
 * it defaults to `usd` and the cache-saving surface reports ZERO saving on
 * rescue traffic even when a cached read plainly saved money. Computing the
 * counterfactual would need a rate for these slugs, which is the rate table
 * this function exists to avoid. A saving of zero is wrong by less than an
 * invented saving would be, and it only ever shows during an outage.
 */
export async function rescueCall(e: {
  agent?: string | null
  model: string
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  /** The provider's own charge for this call, in USD. */
  usd?: number
  failed?: boolean
}): Promise<void> {
  const cached = (e.cacheReadTokens || 0) + (e.cacheWriteTokens || 0)
  const tokens = (e.inputTokens || 0) + (e.outputTokens || 0) + cached
  if (!tokens) return
  const usd = Number(e.usd) || 0
  await add({
    provider: 'openrouter',
    unitKind: 'agent',
    unitKey: normalizeAgent(e.agent),
    bucket: e.model,
    label: normalizeAgent(e.agent),
    category: usd > 0 ? 'priced' : 'unpriced-model',
    usd,
    runs: 1,
    failed: e.failed ? 1 : 0,
    units: tokens,
    unitName: 'tokens',
    cacheReadTokens: e.cacheReadTokens || 0,
    cacheWriteTokens: e.cacheWriteTokens || 0,
  })
}
