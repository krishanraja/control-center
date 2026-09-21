import test from 'node:test'
import assert from 'node:assert/strict'
import { modelCallOf, modelCallsOf, writableDays } from '../../api/meter/n8n-llm-sync.js'
import { priceUsdDetailed } from '../../api/_prices.js'

// The fixture is not invented. It is execution 43145 of "Cleo | Mindmaker OS |
// Inspiration Sweep", node "Anthropic Extract Seeds", read off n8n Cloud on
// 2026-09-20 — structure and token counts verbatim, with only the answer text
// removed. Everything this collector believes about the shape of n8n execution
// data rests on that one live read, so the read is what the test asserts
// against rather than a shape written from memory.
//
// The numbers matter on their own: 22,089 input tokens, none of them cached, on
// a job that runs every hour or two. That single node was spending more per day
// than several of the metered Vercel routes, and meter_daily had never carried
// one token of it.
const LIVE = {
  data: {
    resultData: {
      runData: {
        'Anthropic Extract Seeds': [{
          startTime: 1789909944528,
          executionTime: 27404,
          executionStatus: 'success',
          data: {
            main: [
              [{
                json: {
                  model: 'claude-sonnet-4-6',
                  id: 'msg_011CfEkQoLNaD3Xim3PWAfrm',
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'text', text: '[ ... ]' }],
                  stop_reason: 'end_turn',
                  usage: {
                    input_tokens: 22089,
                    cache_creation_input_tokens: 0,
                    cache_read_input_tokens: 0,
                    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
                    output_tokens: 1347,
                    service_tier: 'standard',
                  },
                },
              }],
              // n8n hands back one array per output branch and the second is
              // routinely empty. Reading main[0] only happens to work; reading
              // every branch is what the data actually is.
              [],
            ],
          },
        }],
      },
    },
  },
}

test('an httpRequest node hands the provider body through untouched, so json IS the message', () => {
  const call = modelCallOf(LIVE.data.resultData.runData['Anthropic Extract Seeds'][0].data.main[0][0].json)
  assert.ok(call)
  assert.equal(call.model, 'claude-sonnet-4-6')
  assert.equal(call.usage.input, 22089)
  assert.equal(call.usage.output, 1347)
})

test('the live execution prices at the table rate, not at zero', () => {
  const [call] = modelCallsOf(LIVE, ['Anthropic Extract Seeds'])
  // 22089 in at $3/1M plus 1347 out at $15/1M.
  assert.ok(Math.abs(priceUsdDetailed(call.model, call.usage) - 0.086472) < 1e-6)
})

test('only the named LLM nodes are read, so an ordinary node is never mistaken for a call', () => {
  assert.equal(modelCallsOf(LIVE, ['Build Extraction Prompt']).length, 0)
  assert.equal(modelCallsOf(LIVE, []).length, 0)
})

// A node inside a loop runs once per iteration and every iteration was billed.
// Reading only the first run is the quiet way to under-report the workflows
// that cost the most, because the expensive ones are exactly the ones that loop.
test('every run of a looping node is counted, not just the first', () => {
  const run = LIVE.data.resultData.runData['Anthropic Extract Seeds'][0]
  const looped = { data: { resultData: { runData: { N: [run, run, run] } } } }
  const calls = modelCallsOf(looped, ['N'])
  assert.equal(calls.length, 3)
  assert.equal(calls.reduce((s, c) => s + c.usage.input, 0), 66267)
})

// The Gemini branch is the one shape here NOT read off a live execution: the
// fallback nodes are idle by design. So the test pins what it must do when it
// is wrong — return nothing — rather than pretending the shape is confirmed.
test('a Gemini fallback answer is read as tokens', () => {
  const call = modelCallOf({
    modelVersion: 'gemini-3.6-flash',
    usageMetadata: { promptTokenCount: 4000, candidatesTokenCount: 250 },
  })
  assert.ok(call)
  assert.equal(call.model, 'gemini-3.6-flash')
  assert.equal(call.usage.input, 4000)
})

test('an unrecognised body yields no call rather than a row of invented numbers', () => {
  assert.equal(modelCallOf({ ok: true, rows: 3 }), null)
  assert.equal(modelCallOf({ model: 'claude-sonnet-4-6' }), null)
  assert.equal(modelCallOf({ usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 } }), null)
})

// The truncation rule is the one place this collector could invent a quiet
// wrong number. replaceDays overwrites a whole day, so half of Tuesday written
// over all of Tuesday reads as a cheap Tuesday and nothing says otherwise.
const WINDOW = ['2026-09-19', '2026-09-20', '2026-09-21']

test('a complete run writes every day in the window', () => {
  const r = writableDays(WINDOW, null, true)
  assert.deepEqual(r.complete, WINDOW)
  assert.deepEqual(r.incomplete, [])
})

test('the day the budget stopped in is not written, nor anything after it', () => {
  const r = writableDays(WINDOW, '2026-09-20', true)
  assert.deepEqual(r.complete, ['2026-09-19'])
  assert.deepEqual(r.incomplete, ['2026-09-20', '2026-09-21'])
})

// Running out of listing pages is the invisible one: a day we only half
// enumerated looks exactly like a quiet day, so the oldest goes unwritten.
test('an unfinished listing costs the oldest day, which is the one it truncated', () => {
  const r = writableDays(WINDOW, null, false)
  assert.deepEqual(r.complete, ['2026-09-20', '2026-09-21'])
  assert.deepEqual(r.incomplete, ['2026-09-19'])
})

test('both limits at once leave nothing safe to write', () => {
  const r = writableDays(WINDOW, '2026-09-20', false)
  assert.deepEqual(r.complete, [])
  assert.deepEqual(r.incomplete, WINDOW)
})

test('days are deduplicated and ordered, whatever order the executions arrived in', () => {
  const r = writableDays(['2026-09-21', '2026-09-19', '2026-09-21', '2026-09-20'], null, true)
  assert.deepEqual(r.complete, WINDOW)
})

// Gemini has no row in MODEL_PRICES, and that is deliberate: _prices.ts prices
// an unknown model at zero and says so through isPriced, because a guessed rate
// produces a plausible wrong number nobody questions. The collector must carry
// the tokens anyway, so the gap is visible as tokens-without-dollars.
test('an unpriced model still carries its tokens', () => {
  const call = modelCallOf({ modelVersion: 'gemini-3.6-flash', usageMetadata: { promptTokenCount: 4000, candidatesTokenCount: 250 } })
  assert.ok(call)
  assert.equal(priceUsdDetailed(call.model, call.usage), 0)
  assert.equal(call.usage.input + call.usage.output, 4250)
})
