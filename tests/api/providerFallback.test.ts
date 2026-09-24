import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseResetAt, understudyFor, shouldFallBack, readRescueUsage } from '../../api/_providerFallback.js'
import { JUDGE_MODEL, SYNTHESIS_MODEL, RESCUE_JUDGE_MODEL, RESCUE_GENERATION_MODEL } from '../../api/_models.js'

// The three decisions the fallback makes before it spends anything: how long to
// stay out of Anthropic's way, which model answers instead, and whether the
// failure was the kind worth answering at all. Each one is cheap to get wrong
// and expensive to notice.

test('the reset time comes from the provider, not from a guess', () => {
  // The real message, 2026-09-23. Reading it is what turns an eight day outage
  // into one failed call instead of tens of thousands.
  const real = 'anthropic_400:You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC.'
  const at = parseResetAt(real, new Date('2026-09-23T16:00:00Z'))
  assert.equal(at?.toISOString(), '2026-10-01T00:00:00.000Z')
})

test('a date with no time of day still parses, at midnight UTC', () => {
  const at = parseResetAt('You will regain access on 2026-10-01', new Date('2026-09-23T16:00:00Z'))
  assert.equal(at?.toISOString(), '2026-10-01T00:00:00.000Z')
})

test('a reset already in the past is not a reset', () => {
  // Otherwise a stale message would hold the breaker open on a date that has
  // been and gone, and the caller would never try Anthropic again.
  assert.equal(parseResetAt('regain access on 2026-09-01 at 00:00 UTC', new Date('2026-09-23T16:00:00Z')), null)
})

test('an error with no stated reset falls to the caller default', () => {
  assert.equal(parseResetAt('anthropic_429:rate limited'), null)
})

test('the understudy is like-for-like, matched by tier not by exact id', () => {
  // This assertion was the exact opposite until 2026-09-24, and the reversal is
  // the point: the cheap-tier demotion existed because a like-for-like rescue
  // was assumed to be expensive. Probing OpenRouter on the live credential
  // showed Anthropic models there are LIST PRICE with no per-token markup and
  // that prompt caching survives the hop at the multipliers _prices.ts already
  // models. So the demotion bought nothing but a worse answer during an outage.
  //
  // The dated snapshot matters: JUDGE_MODEL is 'claude-haiku-4-5' and the
  // fleet also sends 'claude-haiku-4-5-20251001'. Matching by prefix is what
  // stops the dated id silently falling through to the generation tier.
  assert.equal(understudyFor(JUDGE_MODEL), RESCUE_JUDGE_MODEL)
  assert.equal(understudyFor(`${JUDGE_MODEL}-20251001`), RESCUE_JUDGE_MODEL)
  assert.equal(understudyFor(SYNTHESIS_MODEL), RESCUE_GENERATION_MODEL)
})

test('the understudy slugs are OpenRouter ids, and unpriced on purpose', async () => {
  // Dots, not dashes. An Anthropic API id (claude-sonnet-5) sent to OpenRouter
  // 404s, and an OpenRouter slug sent to Anthropic does too, so the spelling is
  // load-bearing rather than cosmetic.
  for (const slug of [RESCUE_JUDGE_MODEL, RESCUE_GENERATION_MODEL]) {
    assert.match(slug, /^anthropic\/claude-[a-z]+-\d+(\.\d+)?$/, slug)
  }
  // And they must stay OUT of the price table: the meter records OpenRouter's
  // own `usage.cost`, and a second rate that has to agree with the invoice is
  // the two-price-tables bug this repo already paid for once.
  const { isPriced } = await import('../../api/_prices.js')
  assert.equal(isPriced(RESCUE_JUDGE_MODEL), false)
  assert.equal(isPriced(RESCUE_GENERATION_MODEL), false)
})

test('rescue usage does not count a cached prefix twice', () => {
  // OpenRouter reports prompt_tokens INCLUSIVE of cached and cache-write
  // tokens. Adding them on top would inflate `units` on exactly the cheapest
  // calls, which is the direction that makes caching look like a cost.
  // Numbers are from a real probe on 2026-09-24.
  const u = readRescueUsage({
    prompt_tokens: 8362,
    completion_tokens: 4,
    cost: 0.0017376,
    prompt_tokens_details: { cached_tokens: 8348, cache_write_tokens: 0 },
  })
  assert.equal(u.inputTokens, 14)
  assert.equal(u.cacheReadTokens, 8348)
  assert.equal(u.outputTokens, 4)
  assert.equal(u.usd, 0.0017376)
})

test('rescue usage reads a cache WRITE without inventing a dollar figure', () => {
  const u = readRescueUsage({
    prompt_tokens: 8362,
    completion_tokens: 4,
    cost: 0.020938,
    prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 8348 },
  })
  assert.equal(u.cacheWriteTokens, 8348)
  assert.equal(u.inputTokens, 14)
  assert.equal(u.usd, 0.020938)
})

test('a usage object with nothing in it is zeros, not NaN', () => {
  // A NaN reaching the meter writes a row that poisons every sum downstream,
  // and it arrives from the one frame nobody tests: a stream that ended early.
  const u = readRescueUsage(null)
  assert.deepEqual(u, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, usd: 0 })
})

test('the failures worth switching provider for', () => {
  for (const msg of [
    'anthropic_400:You have reached your specified API usage limits.',
    'anthropic_400:your credit balance is too low',
    'anthropic_401:API key is invalid.',
    'anthropic_429:rate limited',
    'anthropic_529:overloaded',
    'ANTHROPIC_API_KEY not configured',
    'missing_anthropic_key',
  ]) assert.equal(shouldFallBack(new Error(msg)), true, msg)
})

test('a timeout is NOT one of them', () => {
  // A slow upstream has already spent the caller's latency budget. Following it
  // with a second provider turns a slow answer into a very slow one, and the
  // caller's own degrade path is better at that point.
  assert.equal(shouldFallBack(new Error('anthropic_timeout_8000ms')), false)
})

test('an unrelated failure does not reach for another provider', () => {
  assert.equal(shouldFallBack(new Error('rerank_unparseable')), false)
  assert.equal(shouldFallBack(new Error('planner_unparseable')), false)
})
