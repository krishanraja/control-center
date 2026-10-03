/**
 * One place that knows which model runs which job.
 *
 * Before this, the model identity was 49 string literals scattered across
 * api/ and scripts/, so "what are we running?" was a grep and "move the
 * synthesis surfaces up a tier" was 29 edits with no way to tell whether you
 * had missed one. A typo in a model name fails at request time, in production,
 * on whichever route nobody ran that week. Both the dated Haiku snapshot and
 * its alias are valid; api/_prices.ts intentionally prices either by family.
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

/**
 * The most capable Claude model. Nothing runs on it today.
 *
 * It wrote the daily move for one morning. On 2026-10-03 Krish asked whether
 * it was worth its cost on the API, and the measured answer was about $8 to $20
 * a month for a gain nothing had shown, so the move went back to Sonnet. It is
 * kept callable for the day a read earns it: it always thinks (an explicit
 * `{type:'disabled'}` is a 400), takes no sampling parameters, can decline
 * through its safety classifiers with a 200 and stop_reason "refusal", is
 * priced, and is rescued by itself. thinkingParam, NO_SAMPLING_MODELS,
 * callClaude's refusalFallback and understudyFor handle each of those.
 */
export const TOP_TIER_MODEL = 'claude-fable-5-1'

/**
 * The daily move's decider: the one read a day that picks the single move he
 * reacts to on Home (ADR-028).
 *
 * Sonnet 5 with adaptive thinking at high effort, the same tier as every other
 * strategist read, so "never Opus" holds without an exception. The second
 * opinion comes from another lab (DAILY_MOVE_CHALLENGER_MODEL), which is where
 * a cross-check earns its keep. Measured on the 2026-10-03 dry run's token
 * counts, the read and its challenge cost about $0.07 a day.
 *
 * It moves up a tier on evidence, not on instinct: if he sets aside more than
 * half of the first moves over two weeks (the bank holds every verdict), try
 * TOP_TIER_MODEL here and compare. scripts/modelRoutePolicy.mts pins this
 * value, so the change is made on purpose or not at all.
 */
export const DAILY_MOVE_MODEL = 'claude-sonnet-5'

/**
 * The daily move's challenger: a model from another lab that reads the same
 * state, argues the strongest case against the decider's pick, and may point
 * at a runner-up. Different labs miss different things, which is the whole
 * reason to pay a second provider for one call a day. An OpenRouter slug, so
 * its cost arrives as OpenRouter's own figure and _prices.ts has no row for it.
 */
export const DAILY_MOVE_CHALLENGER_MODEL = 'openai/gpt-6.1-sol'

/** OpenAI is used only where the implementation is OpenAI-specific. Nano is
 * for extraction/ranking; mini is for bounded structured generation. These
 * are API models and are billed as API usage.
 *
 * NOTE these are no longer the outage understudies. api/_providerFallback.ts
 * rescues through OpenRouter now; see RESCUE_* below. `_goalGate.ts` and
 * `_skill-prompt.ts` still call OpenAI directly because their implementations
 * are OpenAI-specific, and they keep these. */
export const OPENAI_JUDGE_MODEL = 'gpt-5.4-nano'
export const OPENAI_GENERATION_MODEL = 'gpt-5.4-mini'

/**
 * Who answers when Anthropic will not: the same models, through OpenRouter.
 *
 * This was a cheap-tier demotion (nano/mini) until 2026-09-24, on the
 * assumption that a like-for-like rescue was the expensive option. Probing the
 * live OpenRouter credential showed that assumption was wrong, and the numbers
 * are worth keeping because they are the whole argument:
 *
 *   - Inference is Anthropic LIST PRICE with no per-token markup.
 *     anthropic/claude-sonnet-5 $2/$10 per 1M, anthropic/claude-haiku-4.5
 *     $1/$5 — the same rows
 *     _prices.ts already carries. OpenRouter's margin is on credit top-ups.
 *   - Prompt caching survives the hop intact, at the exact multipliers
 *     _prices.ts models: a 5m write measured 1.25x input, a 1h write 2.0x, a
 *     read 0.1x. An 8,348 token prefix cost $0.0209 to write and $0.0017 to
 *     read back.
 *
 * So the rescue costs what the primary costs, and a demotion would buy nothing
 * except a quality cliff on the surfaces Krish reads during an outage. The
 * spend controls that made the cheap tier safe are unchanged and are what keep
 * this bounded: bulk paths opt out by name, and a daily call ceiling applies.
 *
 * Krish's ruling, 2026-09-24: like-for-like, because a fallback that quietly
 * gets worse is a fallback that lies about being up.
 *
 * These are OpenRouter slugs, which use dots where Anthropic's API ids use
 * dashes. That is not a typo and _prices.ts must not be asked to price them:
 * OpenRouter reports the real cost per call and the meter records that number
 * instead of deriving one.
 */
export const RESCUE_JUDGE_MODEL = 'anthropic/claude-haiku-4.5'
export const RESCUE_GENERATION_MODEL = 'anthropic/claude-sonnet-5'

/** The top tier's understudy: the same Fable, like-for-like by the ruling
 *  above. Without its own row the tier mapping would rescue Fable with Sonnet,
 *  which is exactly the fallback that quietly gets worse. Keyed on the model,
 *  never on a job: a job's model changes, and a job-keyed row once mapped every
 *  Sonnet call in the fleet to Fable the moment the daily move moved to Sonnet. */
export const RESCUE_TOP_TIER_MODEL = 'anthropic/claude-fable-5.1'

/**
 * The cheap lane (ADR-028): bulk work that leaves Anthropic, with the agents it
 * may serve named one by one.
 *
 * CANDIDATES are measured, never assumed. The lane starts every agent in
 * shadow: Claude still writes the answer that is kept, each candidate answers
 * the same evidence beside it, and the agreement is logged. An agent moves only
 * when a candidate clears the bar Krish set on 2026-10-03 (every reply parses,
 * and the fields that drive ranking agree with Claude at least 90% of the time,
 * or no worse than Claude agrees with itself). The serving order after that is
 * the cheapest passing candidate first and the next passing one from a
 * DIFFERENT provider as its fallback.
 *
 * Never Claude Sonnet or Opus as a fallback for these agents. A premium model
 * standing in on a background job is the shape of the $1,800 Gemini bill that
 * CFG-COST-001 exists to prevent; when the lane cannot answer, the job waits,
 * the same as when Anthropic could not. Haiku is a candidate, not a fallback:
 * it moves an agent only by passing the same bar as everything else.
 *
 * OpenRouter slugs. Their cost is read from OpenRouter's own usage.cost, which
 * is why _prices.ts has no row for any of them (check-anthropic-fallback).
 */
export const CHEAP_LANE_CANDIDATES = [
  'openai/gpt-6-luna',
  'deepseek/deepseek-v4-flash',
  'anthropic/claude-haiku-4.5',
] as const
export type CheapLaneCandidate = (typeof CHEAP_LANE_CANDIDATES)[number]

/** The agents the cheap lane may serve. A new one is a decision, not a default. */
export const CHEAP_LANE_AGENTS = ['enrich-person'] as const
export type CheapLaneAgent = (typeof CHEAP_LANE_AGENTS)[number]

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

/**
 * Models whose thinking cannot be switched off at all.
 *
 * The second half of the same trap. On Fable 5 and 5.1, Mythos 5.1, Opus 5.5
 * and Sonnet 5.5, `{type:'disabled'}` is not "no thinking", it is a 400. Before
 * this list, thinkingParam sent exactly that to any thinks-by-default model a
 * caller asked not to think, so the first Fable call site would have failed on
 * every request. For these models the field is omitted unless thinking is
 * wanted, which runs adaptive thinking either way: a caller of one of them
 * budgets max_tokens for thinking whatever it asks for.
 */
const ALWAYS_THINKS = /^claude-(fable-5|mythos-5|opus-5-5|sonnet-5-5)/

export function thinksByDefault(model: string): boolean {
  return THINKS_BY_DEFAULT.test(model)
}

export function alwaysThinks(model: string): boolean {
  return ALWAYS_THINKS.test(model)
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
  if (alwaysThinks(model)) return want ? { thinking: { type: 'adaptive' } } : {}
  return { thinking: want ? { type: 'adaptive' } : { type: 'disabled' } }
}

/** How hard a thinking model works before it answers. GA, no beta header. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Models that accept `output_config.effort`. Haiku 4.5 and Sonnet 4.5 reject it. */
const TAKES_EFFORT = /^claude-(opus-4-[5-9]|opus-5|sonnet-4-6|sonnet-5|fable-5|mythos-5)/

/** The effort field, or nothing when none was asked for or the model has none. */
export function effortParam(model: string, effort?: Effort): Record<string, unknown> {
  if (!effort || !TAKES_EFFORT.test(model)) return {}
  return { output_config: { effort } }
}

/**
 * Models that take the server-side refusal fallback (`fallbacks: "default"`,
 * beta server-side-fallback-2026-07-01, Claude API only). A safety classifier
 * can decline a request on these with an HTTP 200 and stop_reason "refusal";
 * the fallback re-runs it on the model Anthropic routes that category to,
 * inside the same call, instead of handing back nothing.
 */
const TAKES_REFUSAL_FALLBACK = /^claude-(fable-5-1|opus-5-5|opus-5(?!-)|sonnet-5-5)/

export function takesRefusalFallback(model: string): boolean {
  return TAKES_REFUSAL_FALLBACK.test(model)
}
