import { callClaude, robustJson } from './_content.js'
import { JUDGE_MODEL } from './_models.js'
import type { Post, Stance } from './_intent.js'

// The judgment half of the intent signal.
//
// ── Why a model, after arguing against one ─────────────────────────────────
// The first classifier was pure pattern matching, on the grounds that it is
// free, testable, and cannot invent a fact. All true. It also cannot tell "I
// have this problem" from "here is a problem people have", and on the real
// corpus that is the whole game. It read these as someone struggling with AI:
//
//   "in my 20s I was sad I'd just missed that era, but because of it, we've
//    been struggling with a certain image"        — not about AI at all
//   "anyone currently assuming they're the only one struggling"
//                                                 — thought leadership ABOUT struggle
//   "If you like messy technical problems, we'd love to talk"
//                                                 — a hiring ad
//
// Krish's point was exactly this: plenty of people post hot air, and a signal
// that ranks them with someone genuinely stuck is worse than no signal, because
// it costs attention and teaches him not to trust the badge.
//
// ── What stops it inventing things ─────────────────────────────────────────
// The model never supplies facts. It picks a stance and returns a quote, and
// the quote is checked against the source text before anything is stored. A
// classification whose evidence is not verbatim in the post is DISCARDED, not
// softened. That makes hallucination structurally unable to reach the database
// rather than merely discouraged.
//
// ── What it costs ──────────────────────────────────────────────────────────
// Only people whose posts already passed the free pattern gate get here, which
// is roughly a third of them, and it is one small call each on the fast model.
// The pattern classifier remains the fallback for every run where the model is
// unavailable or unsure.

export interface ModelVerdict {
  stance: Stance
  quote: string
  /** One clause on why, for the operator rather than the ranker. */
  reason: string
  /** 'high' only when the post is unambiguously first-person and current. */
  confidence: 'high' | 'medium' | 'low'
}

const SYSTEM = `You classify what a person is DOING about AI, from their own recent LinkedIn posts.

You are helping decide who is worth contacting. The reader sells AI advisory, education and build work to commercial leaders. Posting opinions about AI is near-universal and worth almost nothing. What matters is whether this person has a live need, a live project, or a live budget.

Pick exactly ONE stance, the strongest that is genuinely supported:

- "asking": they are publicly asking for help, recommendations or advice.
- "struggling": THEY (or their team) are hitting a real, current problem with AI work they are doing. Not observing that problems exist. Not saying something is hard in general. Not a lesson learned from a solved problem.
- "hiring": they are hiring for AI/automation, standing up a team or function, or have budget.
- "evaluating": they or their team are trialling, piloting, comparing or running a POC now.
- "building": they have built, shipped or deployed AI work themselves.
- "teaching": they are sharing how-to or lessons from their own practice.
- "commenting": opinions, predictions, news reactions, industry takes, motivational posts. This is the DEFAULT and most posts are this.
- "selling": they are pitching an AI product or service, running ads, or recruiting customers.

Decisive rules:
- The post must be about the AUTHOR or their team. A post about what companies, "most people", "everyone" or the industry is doing is "commenting", no matter how specific.
- A rhetorical or narrative use of struggle, failure or difficulty is "commenting".
- A job ad is "hiring" even when it mentions hard problems.
- A success story is "building" or "teaching", never "struggling".
- If you are choosing between a high stance and "commenting", choose "commenting".

Return STRICT JSON only, no prose and no code fences:
{"stance": string, "quote": string, "reason": string, "confidence": "high"|"medium"|"low"}

"quote" MUST be copied VERBATIM from the posts, one sentence, the sentence that most supports your stance. Never paraphrase it and never write a sentence of your own: a quote that is not word-for-word in the posts is discarded and your whole answer with it.
"reason" is at most 12 words, plain, no em dashes.
"confidence" is "high" only when the post is unmistakably first-person and current.`

/** Normalised for the verbatim check. LinkedIn mangles quotes and spacing on
 *  the way out, and a smart apostrophe must not be the thing that throws away a
 *  correct classification. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

const VALID: ReadonlySet<string> = new Set<Stance>([
  'asking', 'struggling', 'hiring', 'evaluating', 'building', 'teaching', 'commenting', 'selling',
])

/** Classify one person's posts. Returns null when the model is unavailable,
 *  unparseable, or returned a quote that is not actually in the posts — every
 *  one of which means the caller keeps the pattern classifier's answer rather
 *  than storing something unverified. */
export async function classifyIntent(posts: Post[], timeoutMs = 12_000): Promise<ModelVerdict | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null

  const usable = posts.filter(p => (p.text || '').trim().length > 40).slice(0, 6)
  if (!usable.length) return null

  const body = usable
    .map((p, i) => `POST ${i + 1}${p.postedAt ? ` (${p.postedAt.slice(0, 10)})` : ''}:\n${(p.text || '').slice(0, 1200)}`)
    .join('\n\n')

  let raw: string
  try {
    raw = await callClaude({
      agent: 'network-intent',
      model: JUDGE_MODEL,
      system: SYSTEM,
      user: body,
      maxTokens: 300,
      temperature: 0,
      timeoutMs,
    })
  } catch {
    return null
  }

  const parsed = robustJson(raw) as Partial<ModelVerdict> | null
  if (!parsed || typeof parsed.stance !== 'string' || typeof parsed.quote !== 'string') return null

  const stance = parsed.stance.trim().toLowerCase()
  if (!VALID.has(stance)) return null

  // The verbatim check. This is the whole safety story: a stance whose evidence
  // is not in the source text does not reach the database.
  const haystack = norm(usable.map(p => p.text || '').join('\n'))
  const quote = parsed.quote.trim()
  if (quote.length < 12 || !haystack.includes(norm(quote))) return null

  const confidence = parsed.confidence === 'high' || parsed.confidence === 'medium' ? parsed.confidence : 'low'

  return {
    stance: stance as Stance,
    quote: quote.slice(0, 300),
    reason: String(parsed.reason || '').replace(/\s*[—–]\s*/g, ', ').slice(0, 120),
    confidence,
  }
}
