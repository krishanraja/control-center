import test from 'node:test'
import assert from 'node:assert/strict'
import { readIntent, STANCE_VALUE } from '../../api/_intent.js'

const NOW = new Date('2026-09-15T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()
const post = (text: string, n = 5) => ({ text, postedAt: daysAgo(n), url: 'https://x' })

// ── The whole point of the rewrite ─────────────────────────────────────────
// The first version asked "is this person posting about AI" and flagged 45% of
// the warm network. These two posts are both about AI, both recent, and only
// one of them is a reason to pick up the phone.
test('a stated problem massively outranks a hot take', () => {
  const hotAir = readIntent([post('AI will change everything about marketing in the next 18 months. Thoughts?')], NOW)
  const stuck = readIntent([post("We're three months into our AI rollout and we still can't get the agents to handle tier-1 tickets reliably.")], NOW)

  assert.equal(hotAir.stance, 'commenting')
  assert.equal(stuck.stance, 'struggling')
  assert.ok(stuck.score > hotAir.score * 4, `stuck ${stuck.score} vs hot air ${hotAir.score}`)
})

test('someone asking for help is the warmest signal there is', () => {
  const s = readIntent([post('Any recommendations for someone who can help us build an AI strategy? Would love pointers.')], NOW)
  assert.equal(s.stance, 'asking')
  assert.ok(s.score >= 60)
})

test('hiring for AI outranks talking about AI', () => {
  const hiring = readIntent([post("We're hiring an AI lead to build out our automation function.")], NOW)
  const talking = readIntent([post('Great piece on how AI is reshaping the agency model.')], NOW)
  assert.equal(hiring.stance, 'hiring')
  assert.ok(hiring.score > talking.score * 3)
})

// A vendor can otherwise look exactly like a builder: both say "we built".
// Krish sells AI advisory, so a person selling AI is a competitor or a partner,
// never a prospect, and must not sit at the top of his list.
test('someone selling AI is named as such, not mistaken for a buyer', () => {
  const vendor = readIntent([post('Our AI platform helps marketing teams automate reporting. Book a demo — link in comments.')], NOW)
  assert.equal(vendor.stance, 'selling')
  assert.ok(vendor.score < 20)
})

test('first person beats the abstract claim on the same subject', () => {
  const abstract = readIntent([post('Companies are deploying AI agents across support functions this year.')], NOW)
  const owned = readIntent([post('We deployed AI agents across our support function this quarter.')], NOW)
  assert.ok(owned.score > abstract.score, `${owned.score} should beat ${abstract.score}`)
})

test('concrete work beats a vague claim of building', () => {
  const vague = readIntent([post('We are building some AI things at the moment.')], NOW)
  const concrete = readIntent([post('We shipped an AI agent that now handles 400 support tickets a week.')], NOW)
  assert.equal(concrete.stance, 'building')
  assert.ok(concrete.score > vague.score)
})

// A score is arguable. A quote is not: Krish can disagree with the classifier
// at a glance instead of trusting it.
test('every flag carries the sentence that produced it', () => {
  const s = readIntent([post('Lovely weather. We cannot get our RAG pipeline to stop hallucinating on customer docs.')], NOW)
  assert.equal(s.stance, 'struggling')
  assert.ok(s.evidence)
  assert.match(s.evidence as string, /RAG pipeline/)
  // The quote is the claim, not the whole post.
  assert.ok(!(s.evidence as string).includes('Lovely weather'))
})

test('the strongest post in a feed decides the stance', () => {
  const s = readIntent([
    post('Interesting week for AI news.', 3),
    post("We're stuck trying to get our LLM evals to mean anything.", 6),
    post('Here is how to write a better prompt.', 9),
  ], NOW)
  assert.equal(s.stance, 'struggling')
})

// Three posts of hot air must not add up to one person with a problem.
test('volume nudges the score, it does not manufacture intent', () => {
  const many = readIntent([
    post('AI is the future of work.', 2),
    post('Another big AI funding round today.', 4),
    post('AI will reshape every industry.', 6),
  ], NOW)
  const one = readIntent([post("We can't get our AI pilot past legal review.")], NOW)
  assert.ok(one.score > many.score * 3, `one problem ${one.score} vs three takes ${many.score}`)
})

// ── Recency, which is what makes this intent rather than biography ─────────
test('an old problem is not a live one', () => {
  const s = readIntent([post("We're completely stuck on our AI rollout.", 400)], NOW)
  assert.equal(s.score, 0)
  assert.equal(s.stance, null)
  assert.equal(s.aiPosts, 1)
})

test('a post inside the window outranks one at the edge of it', () => {
  const fresh = readIntent([post("We're stuck on our AI rollout.", 10)], NOW)
  const fading = readIntent([post("We're stuck on our AI rollout.", 60)], NOW)
  assert.ok(fading.score > 0 && fading.score < fresh.score)
})

test('an undated post is evidence of interest but never of intent', () => {
  const s = readIntent([{ text: "We're stuck on our AI agents.", postedAt: null }], NOW)
  assert.equal(s.score, 0)
  assert.equal(s.aiPosts, 1)
})

// ── Not everything is AI ───────────────────────────────────────────────────
test('posts about anything else produce no signal at all', () => {
  const s = readIntent([
    post('Delighted to announce our Series B.', 2),
    post('Hiring two account directors in Sydney.', 5),
  ], NOW)
  assert.equal(s.score, 0)
  assert.equal(s.stance, null)
  assert.equal(s.aiPosts, 0)
  // The last post date still says the account is live.
  assert.equal(s.lastPostAt, daysAgo(2))
})

test('words that merely contain the letters ai are not AI', () => {
  const s = readIntent([post('Back from Dubai. Said it would be good. Raising aid for the campaign.', 1)], NOW)
  assert.equal(s.score, 0)
})

test('no posts at all is a clean zero, not an error', () => {
  const s = readIntent([], NOW)
  assert.equal(s.score, 0)
  assert.equal(s.postsRead, 0)
  assert.equal(s.stance, null)
})

// Re-scoring must never require paying to scrape anyone a second time.
test('classified posts are kept so the model can be rescored for free', () => {
  const s = readIntent([
    post("We're stuck on our LLM evals.", 4),
    post('AI thoughts.', 8),
  ], NOW)
  assert.equal(s.all.length, 2)
  assert.ok(s.all[0].score >= s.all[1].score)
  assert.ok(s.all[0].quote.length > 0)
})

test('the ladder is ordered the way the comment claims it is', () => {
  assert.ok(STANCE_VALUE.asking > STANCE_VALUE.struggling)
  assert.ok(STANCE_VALUE.struggling > STANCE_VALUE.hiring)
  assert.ok(STANCE_VALUE.hiring > STANCE_VALUE.evaluating)
  assert.ok(STANCE_VALUE.evaluating > STANCE_VALUE.building)
  assert.ok(STANCE_VALUE.building > STANCE_VALUE.teaching)
  assert.ok(STANCE_VALUE.teaching > STANCE_VALUE.commenting)
  assert.ok(STANCE_VALUE.commenting > STANCE_VALUE.selling)
})

// ── Regressions from the first live run ────────────────────────────────────
// These are real posts, lightly trimmed, that the first pattern classifier
// called "struggling with AI" and put at 95 out of 100. They are the reason
// the model layer exists, and the pattern layer must not produce them either,
// because it is still the fallback whenever the model is unavailable.

test('a narrative use of struggle is not an AI problem', () => {
  const s = readIntent([post(
    "Sure, in my 20s I was sad I'd just missed that era, but because of it, we've been struggling with a certain image. Anyway, AI is everywhere now.",
  )], NOW)
  assert.notEqual(s.stance, 'struggling')
})

test('writing about the fact that people struggle is commentary', () => {
  const s = readIntent([post(
    "Building with AI is actually much harder than it looks, and that's worth saying out loud so that anyone currently assuming they're the only one struggling knows they are not.",
  )], NOW)
  assert.notEqual(s.stance, 'struggling')
})

test('a job ad that mentions hard problems is hiring, not struggling', () => {
  const s = readIntent([post(
    "We're hiring an AI engineer. If you like messy technical problems and building across agents, evals and post-training, we'd love to talk.",
  )], NOW)
  assert.equal(s.stance, 'hiring')
})

test('a success story is not a live problem, however hard it was', () => {
  const s = readIntent([post(
    "I used Claude Code across the whole process, from researching hundreds of sources and structuring messy information to designing, coding, testing and debugging. Here's how we did it.",
  )], NOW)
  assert.notEqual(s.stance, 'struggling')
})

test('an industry take about AI discourse is commentary', () => {
  const s = readIntent([post(
    "The problem isn't that nobody is sounding the alarm about AI, it's that every warning is treated as an isolated controversy.",
  )], NOW)
  assert.equal(s.stance, 'commenting')
})

test('rhetoric about AI is not a problem with AI', () => {
  const s = readIntent([post("Yet somehow we're stuck comparing AI to almonds atm??")], NOW)
  assert.notEqual(s.stance, 'struggling')
})

// And the true positive this must keep catching.
test('a real live problem still reads as one', () => {
  const s = readIntent([post(
    "Three months in and our RAG pipeline still can't stop hallucinating on customer docs. We're stuck.",
  )], NOW)
  assert.equal(s.stance, 'struggling')
  // 85 for the stance, full marks for first person, discounted for carrying no
  // number or named tool. The band is honest rather than flattering.
  assert.ok(s.score > 60, `scored ${s.score}`)
})
