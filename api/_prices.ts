// The one Anthropic price table.
//
// This existed twice — api/_harness.ts MODEL_PRICES and api/_content.ts PRICES,
// identical by luck rather than by construction. Two tables that must agree and
// are edited independently eventually disagree, and the failure is silent: the
// meter keeps reporting a number, just the wrong one. So there is one table,
// and both call sites import it.
//
// USD per 1M tokens. A model prices off the row whose key is its exact id, or
// whose key it extends by a dated snapshot suffix only, so
// claude-haiku-4-5-20251001 prices as claude-haiku-4-5. Any other longer id is
// a different model: claude-opus-5-5 is NOT claude-opus-5, and used to price as
// it by plain prefix ($5/$25 and $0.50 cache reads instead of $4/$20 and
// $0.20), which isPriced() could never catch because the prefix made it true.
//
// Every rate here is the published first-party rate as stated by the
// claude-api reference (model table cached 2026-09-25). claude-fable-5 is left
// out on purpose: the reference states its input and output rates but not its
// cache read rate, and no code calls it.
//
// An unknown model prices at ZERO and says so through `isPriced`. That is
// deliberate: a guessed rate produces a plausible wrong number that nobody
// questions, whereas an unpriced model shows up in the meter as real token
// counts with no dollars beside them — visibly a gap, which is what it is.

export interface ModelPrice {
  in: number
  out: number
  /** USD per 1M cache-read tokens, where a model does not read back at the
   *  standard tenth of its input rate. Absent means CACHE_MULTIPLIERS.read. */
  cacheRead?: number
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // The top tier (TOP_TIER_MODEL in _models.ts). Fable 5.1 reads its cache back at
  // $0.25, a fortieth of input rather than the usual tenth, so it carries its
  // own cacheRead.
  'claude-fable-5-1': { in: 10, out: 50, cacheRead: 0.25 },
  // Opus 5.5 reads its cache back at $0.20, a twentieth of input, so it carries
  // its own cacheRead too.
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2 },
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  // Sonnet 5 is both newer and cheaper than the 4-6 it replaces. Its row has to
  // exist before the synthesis surfaces move onto it, or isPriced() is false for
  // nearly every call the OS makes and the meter reports real token counts with
  // no dollars beside them. That is this file's deliberate unknown-model
  // behaviour, and it would have fired on the whole fleet.
  // Sonnet 5.5 is priced like Sonnet 5, and its $0.20 cache read is the
  // standard tenth of input, so it needs no cacheRead of its own.
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}

/** A dated snapshot suffix: -20251001. */
const SNAPSHOT_SUFFIX = /^-\d{8}$/

/**
 * The price-table family a model id belongs to, or null when we have no rate.
 *
 * The exact id wins; otherwise the longest key the id extends by a dated
 * snapshot suffix. Nothing else matches, so a newer model with a longer id
 * stays visibly unpriced until its own published row is added, instead of
 * silently borrowing an older model's rate.
 */
export function priceFamily(model: string): string | null {
  if (Object.prototype.hasOwnProperty.call(MODEL_PRICES, model)) return model
  let best: string | null = null
  for (const k of Object.keys(MODEL_PRICES)) {
    if (model.startsWith(k) && SNAPSHOT_SUFFIX.test(model.slice(k.length)) && (!best || k.length > best.length)) best = k
  }
  return best
}

/** Whether this model's tokens can be turned into dollars at all. */
export function isPriced(model: string): boolean {
  return priceFamily(model) !== null
}

/** USD for a token count. Unknown model => 0, paired with isPriced() === false. */
export function priceUsd(model: string, inputTokens: number, outputTokens: number): number {
  const key = priceFamily(model)
  if (!key) return 0
  const p = MODEL_PRICES[key]
  return (inputTokens / 1e6) * p.in + (outputTokens / 1e6) * p.out
}

// ---------------------------------------------------------------- caching
//
// Cached tokens are priced as multiples of the model's base input rate, so
// there is one multiplier set rather than three more columns per model. Adding
// a model still means adding one row.
//
//   read      a cache hit, an order of magnitude cheaper than sending it again
//   write5m   the surcharge for writing a five minute cache entry
//   write1h   the surcharge for a one hour entry
//
// A write costs MORE than an uncached send. That is the whole trade: you
// overpay once so the next N calls pay a tenth. It only wins when the prefix is
// genuinely reused, which is why the meter records reads and writes separately
// instead of netting them off. A site writing caches nobody reads is more
// expensive than one with no caching at all, and netting them would hide it.
export const CACHE_MULTIPLIERS = { read: 0.1, write5m: 1.25, write1h: 2 } as const

export interface TokenUsage {
  input: number
  output: number
  /** Tokens served from an existing cache entry. */
  cacheRead?: number
  /** Tokens written into a new five minute cache entry. */
  cacheWrite5m?: number
  /** Tokens written into a new one hour cache entry. */
  cacheWrite1h?: number
}

/**
 * USD for a call, cache included.
 *
 * Unknown model => 0, same contract as priceUsd: a guessed rate produces a
 * plausible wrong number nobody questions.
 */
export function priceUsdDetailed(model: string, u: TokenUsage): number {
  const key = priceFamily(model)
  if (!key) return 0
  const p = MODEL_PRICES[key]
  const m = CACHE_MULTIPLIERS
  return (
    (u.input / 1e6) * p.in +
    (u.output / 1e6) * p.out +
    ((u.cacheRead || 0) / 1e6) * (p.cacheRead ?? p.in * m.read) +
    ((u.cacheWrite5m || 0) / 1e6) * p.in * m.write5m +
    ((u.cacheWrite1h || 0) / 1e6) * p.in * m.write1h
  )
}

/**
 * What the same call would have cost with no caching at all.
 *
 * Every cached token, read or written, would otherwise have been an ordinary
 * input token. The difference between this and priceUsdDetailed is the saving,
 * and it is negative when a site writes caches nobody reads.
 */
export function priceUsdUncached(model: string, u: TokenUsage): number {
  const key = priceFamily(model)
  if (!key) return 0
  const p = MODEL_PRICES[key]
  const cached = (u.cacheRead || 0) + (u.cacheWrite5m || 0) + (u.cacheWrite1h || 0)
  return ((u.input + cached) / 1e6) * p.in + (u.output / 1e6) * p.out
}

/** Read the cache fields off an Anthropic usage object, whatever is present. */
export function readUsage(usage: unknown): TokenUsage {
  const u = (usage || {}) as Record<string, unknown>
  const n = (v: unknown) => Number(v) || 0
  // The 1h figure arrives nested under cache_creation on the extended-TTL shape
  // and is absent otherwise, so a missing key is zero rather than a crash.
  const creation = (u.cache_creation || {}) as Record<string, unknown>
  const write1h = n(creation.ephemeral_1h_input_tokens)
  const write5m = n(creation.ephemeral_5m_input_tokens) || Math.max(0, n(u.cache_creation_input_tokens) - write1h)
  return {
    input: n(u.input_tokens),
    output: n(u.output_tokens),
    cacheRead: n(u.cache_read_input_tokens),
    cacheWrite5m: write5m,
    cacheWrite1h: write1h,
  }
}
