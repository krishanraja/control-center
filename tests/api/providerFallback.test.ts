import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseResetAt, understudyFor, shouldFallBack } from '../../api/_providerFallback.js'
import { JUDGE_MODEL, SYNTHESIS_MODEL, OPENAI_JUDGE_MODEL, OPENAI_GENERATION_MODEL } from '../../api/_models.js'

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

test('a judge call is understudied by the cheap model, not a like-for-like swap', () => {
  // The whole cost argument rests on this: the fallback keeps the lights on, it
  // does not reproduce the model it replaced.
  assert.equal(understudyFor(JUDGE_MODEL), OPENAI_JUDGE_MODEL)
  assert.equal(understudyFor(`${JUDGE_MODEL}-20251001`), OPENAI_JUDGE_MODEL)
  assert.equal(understudyFor(SYNTHESIS_MODEL), OPENAI_GENERATION_MODEL)
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
