// What a person is publicly talking about, and whether that is a reason to
// talk to them now.
//
// Krish's ask: if someone in the network is posting about AI on LinkedIn, that
// is an intent signal and it should be on the row. This module turns raw post
// text into that signal.
//
// ── Deterministic, not a model call ─────────────────────────────────────────
// Classifying 5,000 people's posts with an LLM costs real money per person and
// introduces a failure mode this system specifically avoids: a confident
// sentence about somebody with nothing behind it. Matching a vocabulary is
// free, testable, and its evidence is the matched phrase itself, which can be
// shown to Krish and checked against the post.
//
// ── Recency is the whole point ──────────────────────────────────────────────
// "Posted about AI agents last week" is a reason to send a message today.
// "Posted about AI in 2023" is a biographical fact. The score decays hard, and
// a signal older than a quarter is not reported as intent at all.

/** Phrases that mean the poster is engaging with AI as a subject, not merely
 *  using a word that happens to contain it. Ordered specific-first: the label
 *  shown to Krish is the first phrase that matched, so "AI agents" should win
 *  over the bare "AI". */
const AI_TERMS: { term: string; re: RegExp }[] = [
  ['AI agents', /\bai\s+agents?\b|\bagentic\b/i],
  ['LLMs', /\bllms?\b|\blarge language models?\b/i],
  ['AI strategy', /\bai\s+(strategy|roadmap|transformation|adoption|readiness)\b/i],
  ['AI governance', /\bai\s+(governance|safety|ethics|regulation|policy)\b|\beu ai act\b/i],
  ['AI products', /\bai[-\s](powered|native|first|driven)\b|\bai\s+products?\b/i],
  ['prompting', /\bprompt(ing|s)?\b|\bprompt engineering\b/i],
  ['specific models', /\b(chatgpt|claude|gemini|copilot|midjourney|openai|anthropic|perplexity)\b/i],
  ['machine learning', /\bmachine learning\b|\bdeep learning\b|\bneural net(work)?s?\b/i],
  ['generative AI', /\bgen(erative)?[-\s]?ai\b/i],
  ['AI', /(^|[^a-z])ai([^a-z]|$)/i],
].map(([term, re]) => ({ term: term as string, re: re as RegExp }))

export interface Post {
  text?: string | null
  /** ISO date, or anything Date can parse. Undated posts are treated as old:
   *  an intent signal that cannot be dated cannot be called recent. */
  postedAt?: string | null
  url?: string | null
}

export interface IntentSignal {
  /** 0-100. Zero means no AI talk found, or all of it is stale. */
  score: number
  /** The matched subjects, most specific first, for the chip and for search. */
  topics: string[]
  /** One line a human reads on the row. Null when there is no signal. */
  summary: string | null
  /** Most recent post of any kind, which is also how we know the account is live. */
  lastPostAt: string | null
  /** How many of the posts read were about AI. */
  aiPosts: number
  postsRead: number
}

const DAY = 86_400_000

/** Full weight inside a month, nothing past a quarter. The cliff is deliberate:
 *  a signal that decays smoothly to a small number still shows a badge, and a
 *  badge that says "interested in AI" about a post from last year is a lie the
 *  row tells at a glance. */
function recencyWeight(ageDays: number): number {
  if (ageDays <= 30) return 1
  if (ageDays >= 90) return 0
  return (90 - ageDays) / 60
}

export function readIntent(posts: Post[], now = new Date()): IntentSignal {
  const dated = posts.map(p => {
    const t = p.postedAt ? Date.parse(p.postedAt) : NaN
    return { text: (p.text || '').slice(0, 4000), at: Number.isFinite(t) ? t : null }
  })

  const lastPostAt = dated.reduce<number | null>(
    (max, p) => (p.at !== null && (max === null || p.at > max) ? p.at : max), null)

  const topics: string[] = []
  let best = 0
  let aiPosts = 0

  for (const p of dated) {
    if (!p.text) continue
    const hits = AI_TERMS.filter(t => t.re.test(p.text))
    if (!hits.length) continue
    aiPosts++
    for (const h of hits) if (!topics.includes(h.term)) topics.push(h.term)

    // An undated post counts as evidence of interest but never as intent.
    const ageDays = p.at === null ? Infinity : (now.getTime() - p.at) / DAY
    const w = recencyWeight(ageDays)
    // More than one AI post is a pattern rather than a passing mention, so the
    // second and third add, with diminishing returns.
    best = Math.max(best, w)
  }

  const volume = Math.min(1, aiPosts / 3)
  const score = Math.round(100 * best * (0.6 + 0.4 * volume))

  return {
    score,
    topics: topics.slice(0, 5),
    summary: score > 0
      ? `Posting about ${topics.slice(0, 2).join(' and ')} — ${aiPosts} of the last ${dated.length} posts`
      : null,
    lastPostAt: lastPostAt === null ? null : new Date(lastPostAt).toISOString(),
    aiPosts,
    postsRead: dated.length,
  }
}
