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
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
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
