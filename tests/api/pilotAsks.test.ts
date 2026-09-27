import assert from 'node:assert/strict'
import { test } from 'node:test'

// api/pilot/asks.ts imports _supabase at module load, which throws without
// credentials. CI sets fake ones for this job; these defaults do the same when
// the file runs alone. Nothing here calls out: rewritesSentAsk is pure.
process.env.SUPABASE_URL ||= 'https://ci.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'not-a-real-key-tests-never-call-out'
const { rewritesSentAsk } = await import('../../api/pilot/asks.ts')

// The bug this closes: a second post on the same day rewrote ask_text even
// after sent_at was stamped, so the record said he sent words he never sent.

test('changing the words of an ask that already went out is refused', () => {
  assert.equal(rewritesSentAsk({ sent_at: '2026-09-28T10:00:00Z', ask_text: 'Would you introduce me?' }, 'Would you introduce me to two people?'), true)
})

test('the same words again are not a change: a retry, or marking it sent twice', () => {
  const sent = { sent_at: '2026-09-28T10:00:00Z', ask_text: 'Would you introduce me?' }
  assert.equal(rewritesSentAsk(sent, 'Would you introduce me?'), false)
  assert.equal(rewritesSentAsk(sent, '  Would you introduce me?  '), false)
})

test('an ask that has not gone out can still be rewritten, and no ask at all is not a conflict', () => {
  assert.equal(rewritesSentAsk({ sent_at: null, ask_text: 'Old words' }, 'New words'), false)
  assert.equal(rewritesSentAsk(null, 'New words'), false)
  assert.equal(rewritesSentAsk(undefined, 'New words'), false)
})
