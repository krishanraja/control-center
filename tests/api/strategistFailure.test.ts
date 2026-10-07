import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { plainFailure } from '../../src/hooks/useStrategist.js'

// 2026-10-07: a Monday note's read stopped mid-write and the phone showed the
// browser's own "network error". Both halves are pinned here.

test('a stream cut mid-read is said in plain words, never as the browser text', () => {
  for (const raw of ['network error', 'Network Error', 'NetworkError when attempting to fetch resource.', 'Load failed', 'The network connection was lost.']) {
    const s = plainFailure(raw)
    assert.notEqual(s, raw)
    assert.match(s, /What you said is kept/)
  }
})

test("a route's own sentence still goes through", () => {
  const own = 'Your numbers and your network could not be read, so there is no read this time.'
  assert.equal(plainFailure(own), own)
})

test('the thinking read has room to finish: effort set, budget above the 12000 that ran out', () => {
  const src = readFileSync(new URL('../../api/strategist.ts', import.meta.url), 'utf8')
  const call = src.slice(src.indexOf('if (thinks) {'), src.indexOf('return streamClaude', src.indexOf('if (thinks) {') + 20))
  assert.match(call, /effort: 'medium'/)
  const max = Number(/maxTokens: (\d+)/.exec(call)?.[1])
  assert.ok(max >= 20000, `thinking maxTokens ${max}`)
  // and it still streams inside the deadline at ~92 tokens/s, the measured rate
  const deadline = Number(/DEADLINE_MS = (\d[\d_]*)/.exec(src)?.[1].replace(/_/g, ''))
  assert.ok(max / 92 * 1000 < deadline, 'budget would outrun DEADLINE_MS')
})
