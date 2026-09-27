import assert from 'node:assert/strict'
import { test } from 'node:test'

// api/pilot/asks.ts imports _supabase at module load, which throws without
// credentials. CI sets fake ones for this job; these defaults do the same when
// the file runs alone. Nothing here calls out: rewritesSentAsk is pure.
process.env.SUPABASE_URL ||= 'https://ci.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'not-a-real-key-tests-never-call-out'
const { rewritesSentAsk, askWriteFor } = await import('../../api/pilot/asks.ts')

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

// The second half of the same bug: once the ask has gone out, the guess he
// made before sending it is what learningFor() holds the outcome against. A
// later post (a retry, a second tab, a body with no prediction) must not
// change it or null it.

test('a post on a sent ask never touches its prediction or its sent time', () => {
  const sent = { sent_at: '2026-09-28T10:00:00Z' }
  const row = askWriteFor(sent, 'Would you introduce me?', null, true, '2026-09-28', '2026-09-28T11:00:00Z')
  assert.deepEqual(row, { ask_date: '2026-09-28', ask_text: 'Would you introduce me?' })
  assert.ok(!('predicted_no_pct' in askWriteFor(sent, 'x', 60, false, '2026-09-28', 'now')))
})

test('an unsent ask takes his prediction, and marking it sent stamps the time once', () => {
  assert.deepEqual(
    askWriteFor({ sent_at: null }, 'Would you introduce me?', 60, false, '2026-09-28', 'T'),
    { ask_date: '2026-09-28', ask_text: 'Would you introduce me?', predicted_no_pct: 60 },
  )
  assert.deepEqual(
    askWriteFor(null, 'Would you introduce me?', null, true, '2026-09-28', 'T'),
    { ask_date: '2026-09-28', ask_text: 'Would you introduce me?', predicted_no_pct: null, sent_at: 'T' },
  )
})
