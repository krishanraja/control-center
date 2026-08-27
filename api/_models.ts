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

/** USD per 1M tokens. Keyed on the bare ID; `usageCost` matches on prefix. */
export const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}

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
