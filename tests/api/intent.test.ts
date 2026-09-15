import test from 'node:test'
import assert from 'node:assert/strict'
import { readIntent } from '../../api/_intent.js'

const NOW = new Date('2026-09-15T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

test('a recent post about AI agents reads as intent, named specifically', () => {
  const s = readIntent([{ text: 'We shipped our first AI agents into production this week.', postedAt: daysAgo(4) }], NOW)
  assert.ok(s.score > 0)
  assert.equal(s.topics[0], 'AI agents')
  assert.equal(s.aiPosts, 1)
  assert.match(s.summary || '', /AI agents/)
})

// The difference between a reason to message someone today and a biographical
// fact. A badge saying "interested in AI" over a post from last year is a lie
// the row tells at a glance.
test('an old post about AI is not intent', () => {
  const s = readIntent([{ text: 'Thoughts on generative AI.', postedAt: daysAgo(400) }], NOW)
  assert.equal(s.score, 0)
  assert.equal(s.summary, null)
  // Still counted as evidence of interest, just not of intent.
  assert.equal(s.aiPosts, 1)
})

test('a post just past the cliff scores below one inside the window', () => {
  const fresh = readIntent([{ text: 'Using LLMs daily.', postedAt: daysAgo(10) }], NOW)
  const fading = readIntent([{ text: 'Using LLMs daily.', postedAt: daysAgo(60) }], NOW)
  assert.ok(fading.score > 0)
  assert.ok(fading.score < fresh.score)
})

test('posting about AI repeatedly outranks mentioning it once', () => {
  const once = readIntent([{ text: 'A note on AI.', postedAt: daysAgo(3) }], NOW)
  const often = readIntent([
    { text: 'A note on AI.', postedAt: daysAgo(3) },
    { text: 'More on LLMs.', postedAt: daysAgo(6) },
    { text: 'Agentic workflows in practice.', postedAt: daysAgo(9) },
  ], NOW)
  assert.ok(often.score > once.score)
})

test('posts about anything else produce no signal at all', () => {
  const s = readIntent([
    { text: 'Delighted to announce our Series B.', postedAt: daysAgo(2) },
    { text: 'Hiring two account directors in Sydney.', postedAt: daysAgo(5) },
  ], NOW)
  assert.equal(s.score, 0)
  assert.deepEqual(s.topics, [])
  assert.equal(s.aiPosts, 0)
  // The last post date is still useful: it says the account is live.
  assert.equal(s.lastPostAt, daysAgo(2))
})

// "Said" contains no standalone ai; "Dubai" and "aid" must not match either.
test('words that merely contain the letters ai are not AI', () => {
  const s = readIntent([
    { text: 'Back from Dubai. Said it would be a good trip. Raising aid for the campaign.', postedAt: daysAgo(1) },
  ], NOW)
  assert.equal(s.score, 0)
})

test('an undated post is evidence of interest but never of intent', () => {
  const s = readIntent([{ text: 'Building with Claude every day.', postedAt: null }], NOW)
  assert.equal(s.score, 0)
  assert.equal(s.aiPosts, 1)
  assert.equal(s.lastPostAt, null)
})

test('no posts at all is a clean zero, not an error', () => {
  const s = readIntent([], NOW)
  assert.equal(s.score, 0)
  assert.equal(s.postsRead, 0)
  assert.equal(s.lastPostAt, null)
})
