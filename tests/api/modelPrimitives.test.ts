import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  thinkingParam, alwaysThinks, effortParam, takesRefusalFallback,
  TOP_TIER_MODEL, DAILY_MOVE_MODEL, SYNTHESIS_MODEL, JUDGE_MODEL, RESCUE_TOP_TIER_MODEL, RESCUE_GENERATION_MODEL,
} from '../../api/_models.js'
import { refusalFallbackParams, refusalOf, supportsSampling, systemParam } from '../../api/_content.js'
import { understudyFor, rescueReasoning } from '../../api/_providerFallback.js'
import { priceUsdDetailed, isPriced } from '../../api/_prices.js'

// The primitives every Claude call is built from. Each test here is a request
// that would have been a 400 or a silently empty answer before ADR-028.

test('Fable is never sent thinking disabled, which it answers with a 400', () => {
  assert.deepEqual(thinkingParam(TOP_TIER_MODEL, false), {})
  assert.deepEqual(thinkingParam(TOP_TIER_MODEL, true), { thinking: { type: 'adaptive' } })
  assert.equal(alwaysThinks('claude-opus-5-5'), true)
  assert.equal(alwaysThinks('claude-sonnet-5-5'), true)
})

test('Sonnet 5 can still switch thinking off, and does when not asked', () => {
  // The original trap: omitting the field runs adaptive thinking on Sonnet 5
  // and empties a JSON call budgeted for its answer alone.
  assert.equal(alwaysThinks(SYNTHESIS_MODEL), false)
  assert.deepEqual(thinkingParam(SYNTHESIS_MODEL, false), { thinking: { type: 'disabled' } })
})

test('pre-5 models get no thinking field at all', () => {
  assert.deepEqual(thinkingParam(JUDGE_MODEL, true), {})
})

test('effort goes only to models that take it', () => {
  assert.deepEqual(effortParam(TOP_TIER_MODEL, 'high'), { output_config: { effort: 'high' } })
  // Haiku 4.5 rejects effort; a caller passing one must not 400 the call.
  assert.deepEqual(effortParam(JUDGE_MODEL, 'high'), {})
  assert.deepEqual(effortParam(TOP_TIER_MODEL), {})
})

test('the refusal fallback is opt-in and only on the models that take it', () => {
  assert.equal(takesRefusalFallback(TOP_TIER_MODEL), true)
  assert.equal(takesRefusalFallback('claude-opus-5'), true)
  assert.equal(takesRefusalFallback(SYNTHESIS_MODEL), false)
  assert.deepEqual(refusalFallbackParams(TOP_TIER_MODEL, true), {
    headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' },
    body: { fallbacks: 'default' },
  })
  assert.deepEqual(refusalFallbackParams(TOP_TIER_MODEL, false), { headers: {}, body: {} })
  assert.deepEqual(refusalFallbackParams(SYNTHESIS_MODEL, true), { headers: {}, body: {} })
})

test('a cached system prompt is one block with a breakpoint, and off by default', () => {
  assert.deepEqual(systemParam('You score events.', true), [
    { type: 'text', text: 'You score events.', cache_control: { type: 'ephemeral' } },
  ])
  assert.equal(systemParam('You score events.', false), 'You score events.')
  assert.equal(systemParam('You score events.', undefined), 'You score events.')
})

test('a refusal is named, never read as an empty answer', () => {
  assert.equal(refusalOf({ stop_reason: 'refusal', stop_details: { category: 'general_harms' } }), 'anthropic_refusal:general_harms')
  assert.equal(refusalOf({ stop_reason: 'refusal', stop_details: null }), 'anthropic_refusal:uncategorised')
  assert.equal(refusalOf({ stop_reason: 'end_turn' }), null)
})

test('Fable takes no sampling parameters', () => {
  assert.equal(supportsSampling(TOP_TIER_MODEL), false)
})

test('Fable is rescued by Fable, like-for-like, never by Sonnet', () => {
  assert.equal(understudyFor(TOP_TIER_MODEL), RESCUE_TOP_TIER_MODEL)
  assert.notEqual(understudyFor(SYNTHESIS_MODEL), RESCUE_TOP_TIER_MODEL)
})

test('the rescue never asks an always-thinking model to stop thinking', () => {
  assert.deepEqual(rescueReasoning('anthropic/claude-fable-5.1', false), { effort: 'low' })
  assert.deepEqual(rescueReasoning('anthropic/claude-fable-5.1', true, 'high'), { effort: 'high' })
  assert.deepEqual(rescueReasoning('anthropic/claude-sonnet-5', false), { enabled: false })
})

test('Fable is priced, and reads its cache back at its own rate', () => {
  assert.equal(isPriced(TOP_TIER_MODEL), true)
  // 1M uncached in + 1M out = $10 + $50; 1M cache read = $0.25, not $1.00.
  assert.equal(priceUsdDetailed(TOP_TIER_MODEL, { input: 1e6, output: 1e6 }), 60)
  assert.equal(priceUsdDetailed(TOP_TIER_MODEL, { input: 0, output: 0, cacheRead: 1e6 }), 0.25)
  // Every other model still reads back at a tenth of input.
  assert.equal(priceUsdDetailed(SYNTHESIS_MODEL, { input: 0, output: 0, cacheRead: 1e6 }), 0.2)
})

test('a reply the refusal fallback served is reported as the model that wrote it', async () => {
  // The API names the producing model at the top level and bills that attempt
  // at its rates. Reporting it as Fable would misprice the day and put the
  // wrong model's name on the read in the learning bank.
  const realFetch = globalThis.fetch
  const hadKey = process.env.ANTHROPIC_API_KEY
  process.env.ANTHROPIC_API_KEY = 'test-only'
  const reply = (model: string) => new Response(JSON.stringify({
    model, stop_reason: 'end_turn',
    content: [
      ...(model === TOP_TIER_MODEL ? [] : [{ type: 'fallback', from: { model: TOP_TIER_MODEL }, to: { model } }]),
      { type: 'text', text: 'the read' },
    ],
    usage: { input_tokens: 10, output_tokens: 5 },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  let answeredBy = 'claude-opus-4-8'
  globalThis.fetch = (async (url: string | URL | Request) =>
    String(url).includes('api.anthropic.com') ? reply(answeredBy) : new Response('{}')) as typeof fetch
  try {
    const { callClaude } = await import('../../api/_content.js')
    const ask = (refusalFallback: boolean) => {
      let seen = ''
      return callClaude({
        agent: 'daily-move', model: TOP_TIER_MODEL, refusalFallback, think: true, maxTokens: 64,
        system: 's', user: 'u', fallback: false, onUsage: u => { seen = u.model },
      }).then(text => ({ text, seen }))
    }
    assert.deepEqual(await ask(true), { text: 'the read', seen: 'claude-opus-4-8' })
    answeredBy = TOP_TIER_MODEL
    assert.deepEqual(await ask(true), { text: 'the read', seen: TOP_TIER_MODEL })
    // Without the fallback the model asked for is the model reported, as before.
    answeredBy = 'claude-fable-5-1-20261001'
    assert.deepEqual(await ask(false), { text: 'the read', seen: TOP_TIER_MODEL })
  } finally {
    globalThis.fetch = realFetch
    if (hadKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = hadKey
  }
})

test('the daily move is rescued like-for-like by Sonnet, and no Sonnet call is ever rescued by Fable', () => {
  // A rescue row keyed on the daily move's model once sent every Sonnet call
  // in the fleet to Fable the moment the daily move moved to Sonnet.
  assert.equal(DAILY_MOVE_MODEL, SYNTHESIS_MODEL)
  assert.equal(understudyFor(DAILY_MOVE_MODEL), RESCUE_GENERATION_MODEL)
  assert.equal(understudyFor('claude-sonnet-5-20261001'), RESCUE_GENERATION_MODEL)
  assert.equal(understudyFor(TOP_TIER_MODEL), RESCUE_TOP_TIER_MODEL)
})
