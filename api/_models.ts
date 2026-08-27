/**
 * One place that knows which model runs which job.
 *
 * Before this, the model identity was 49 string literals scattered across
 * api/ and scripts/, so "what are we running?" was a grep and "move the
 * synthesis surfaces up a tier" was 29 edits with no way to tell whether you
 * had missed one. Two of the literals were also wrong in a way nothing could
 * catch: `claude-haiku-4-5-20251001` carries a date suffix that is not part of
 * the model ID, and it only worked because the price lookup matches on
 * `startsWith`. A typo in a model name fails at request time, in production,
 * on whichever route nobody ran that week.
 *
 * The names are jobs, not tiers, so a model change is a value change here
 * rather than a search-and-replace everywhere:
 *
 *   SYNTHESIS  the surfaces a human reads and decides from — the tab chats,
 *              Ask Marcus, the weekly brief, the growth council, arc cards.
 *              These get the best non-reasoning model because the whole point
 *              of them is the judgment, not the transcription.
 *   UTILITY    drafting and rewriting where voice matters more than reasoning.
 *   JUDGE      classifiers, extractors, scorers. High volume, narrow output,
 *              cost-sensitive.
 *   LADDER     the investigation ladder, which is the one place that pays for
 *              an opus-tier model deliberately.
 *
 * PRICES is USD per 1M tokens and must be updated in the same commit as any
 * value above it, or the spend surfaces silently under-report.
 */

/** Judgment surfaces a human reads. Sonnet 5 is both newer and cheaper than
 *  the 4-6 it replaces ($2/$10 vs $3/$15 per 1M). */
export const SYNTHESIS_MODEL = 'claude-sonnet-5'

/** Drafting and rewriting in Krish's voice. */
export const UTILITY_MODEL = 'claude-sonnet-5'

/** Classifiers, extractors and scorers: narrow output, high call volume. */
export const JUDGE_MODEL = 'claude-haiku-4-5'

/** The investigation ladder — the one deliberate opus-tier spend. */
export const LADDER_MODEL = 'claude-opus-4-8'

// Prices are NOT here. api/_prices.ts owns them, and owns them better: an
// unknown model prices at zero and says so through isPriced(), rather than a
// guessed rate producing a plausible wrong number nobody questions. This module
// owns model IDENTITY and the thinking policy, which that file has no view on.
export { MODEL_PRICES, priceUsd, isPriced, priceFamily } from './_prices.js'

/**
 * Models the n8n proxy will forward to.
 *
 * Deliberately wider than the constants above: a checked-in workflow keeps
 * sending its old model ID until that workflow is redeployed, and a proxy that
 * rejected it would take the fleet down between the two deploys. Old IDs come
 * out of this list only once no live workflow sends them.
 */
export const PROXY_ALLOWED_MODELS = [
  'claude-sonnet-5',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
] as const

/**
 * Models that run adaptive thinking when `thinking` is omitted.
 *
 * This is the trap that made the model move dangerous, and it fails silently.
 * On Sonnet 5 and the Opus 5 family, omitting `thinking` does not mean "no
 * thinking" — it means adaptive thinking, which spends the max_tokens budget
 * before writing any answer. Observed on the live Friday retro the moment it
 * moved to Sonnet 5: max_tokens 1200, thinking_tokens 1199, stop_reason
 * max_tokens, and a `content` array holding one thinking block and no text at
 * all. The route "succeeded" and returned an empty string.
 *
 * Every JSON-returning call site in this repo sets a max_tokens tuned for the
 * answer alone, so moving them to a thinking-by-default model without saying
 * anything about thinking would have emptied all of them at once.
 *
 * So thinking is explicit from here on: off unless a call site asks for it,
 * and a call site that asks for it must budget for it.
 */
const THINKS_BY_DEFAULT = /^claude-(sonnet-5|opus-5|fable-5|mythos-5)/

export function thinksByDefault(model: string): boolean {
  return THINKS_BY_DEFAULT.test(model)
}

/**
 * The `thinking` field for a request, or nothing when the model has no such
 * field. `want` true asks for adaptive thinking; the caller is responsible for
 * a max_tokens that leaves room for an answer after it.
 */
export function thinkingParam(model: string, want: boolean): Record<string, unknown> {
  if (!thinksByDefault(model)) {
    // Pre-5 models: thinking is opt-in via budget_tokens and no call site here
    // uses it, so omitting the field is both correct and a no-op.
    return {}
  }
  return { thinking: want ? { type: 'adaptive' } : { type: 'disabled' } }
}
