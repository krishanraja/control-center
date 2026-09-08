// The one Anthropic price table.
//
// This existed twice — api/_harness.ts MODEL_PRICES and api/_content.ts PRICES,
// identical by luck rather than by construction. Two tables that must agree and
// are edited independently eventually disagree, and the failure is silent: the
// meter keeps reporting a number, just the wrong one. So there is one table,
// and both call sites import it.
//
// USD per 1M tokens, matched by prefix so a dated model id
// (claude-haiku-4-5-20251001) prices off its family.
//
// An unknown model prices at ZERO and says so through `isPriced`. That is
// deliberate: a guessed rate produces a plausible wrong number that nobody
// questions, whereas an unpriced model shows up in the meter as real token
// counts with no dollars beside them — visibly a gap, which is what it is.

export interface ModelPrice { in: number; out: number }

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  // Sonnet 5 is both newer and cheaper than the 4-6 it replaces. Its row has to
  // exist before the synthesis surfaces move onto it, or isPriced() is false for
  // nearly every call the OS makes and the meter reports real token counts with
  // no dollars beside them. That is this file's deliberate unknown-model
  // behaviour, and it would have fired on the whole fleet.
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}

/** The price-table family a model id belongs to, or null when we have no rate. */
export function priceFamily(model: string): string | null {
  return Object.keys(MODEL_PRICES).find(k => model.startsWith(k)) ?? null
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
    ((u.cacheRead || 0) / 1e6) * p.in * m.read +
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
