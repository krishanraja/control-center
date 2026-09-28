import test from 'node:test'
import assert from 'node:assert/strict'
import { streamFailure } from '../../src/lib/streamText.js'

// The engine's revise routes refuse before their stream opens when the model
// provider is down or over its limit (content-engine 1d6a1b0, 3164fde), with
// `{ error: 'revise_failed', detail: '<a sentence>' }`. streamText throws the
// bare code as its message and keeps the body, so the composers read the
// sentence from here. From 2026-09-27 the account was over its usage limit
// for days; "Rewrite failed: revise_failed" told Krish nothing.
test('a refusal before the stream shows the route\'s own sentence', () => {
  const e = Object.assign(new Error('revise_failed'), { status: 503, body: { ok: false, error: 'revise_failed', detail: 'The rewrite did not run. Anthropic is over its usage limit until 2026-10-01 00:00 UTC.' } })
  assert.equal(streamFailure(e), 'The rewrite did not run. Anthropic is over its usage limit until 2026-10-01 00:00 UTC.')
})

test('anything else keeps its message, as before', () => {
  assert.equal(streamFailure(new Error('Stream failed')), 'Stream failed')
  assert.equal(streamFailure(Object.assign(new Error('Request failed (500)'), { status: 500, body: null })), 'Request failed (500)')
  assert.equal(streamFailure(Object.assign(new Error('revise_failed'), { body: { detail: '  ' } })), 'revise_failed')
  assert.equal(streamFailure('plain'), 'plain')
})
