import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyIntent } from '../../api/_intentModel.js'

// The model never supplies facts. It picks a stance and returns a quote, and
// the quote is checked against the source before anything is stored — so a
// classification whose evidence is not in the post cannot reach the database,
// rather than merely being discouraged from doing so.
//
// With no API key configured the classifier returns null, which is the contract
// the caller relies on to fall back to the pattern classifier rather than
// storing nothing or, worse, storing an unverified stance.

test('no key configured means no verdict, not a guess', async () => {
  const prev = process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  try {
    const v = await classifyIntent([{ text: "We're stuck on our RAG pipeline.", postedAt: '2026-09-10' }])
    assert.equal(v, null)
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev
  }
})

test('posts too short to judge are not sent to the model at all', async () => {
  const prev = process.env.ANTHROPIC_API_KEY
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used'
  try {
    // Returns before any network call: nothing here is long enough to classify.
    const v = await classifyIntent([{ text: 'AI!', postedAt: '2026-09-10' }])
    assert.equal(v, null)
  } finally {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = prev
  }
})
