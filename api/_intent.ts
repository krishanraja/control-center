// What a person is publicly doing about AI, and whether that is a reason for
// KRISH to talk to them.
//
// ── Why this was rewritten after one day in production ─────────────────────
// The first version asked "is this person posting about AI". Run against the
// warm network it flagged 307 of 677 people — 45% — which is the correct answer
// to that question and a useless one to act on. In 2026, posting about AI is
// table stakes. Krish's words: there are tonnes of people posting hot air, and
// ranking them alongside someone actually building or stuck is what makes the
// signal worthless.
//
// So the question changed. Not "do they mention AI" but "what is their STANCE
// toward the work, is it first-person, and is it concrete".
//
// ── The ladder, and why it is ordered this way ──────────────────────────────
// Ordered by what it is worth to an operator who sells AI advisory, education
// and build work to commercial leaders. That is a judgment about Krish's
// business, not a general truth, and it is written here rather than left
// implicit so it can be argued with:
//
//   asking      someone publicly asking for help or recommendations. There is
//               no warmer opening than a question you can answer.
//   struggling  naming friction, a stalled rollout, a thing they cannot crack.
//               This is the advisory buying signal. A person with a stated
//               problem is worth ten with a stated opinion.
//   hiring      building an AI function, a new role, a budget. Organisational
//               commitment, which means money is already moving.
//   evaluating  pilots, POCs, trials, comparisons. Mid-funnel and time-boxed.
//   building    they shipped something themselves. A credible peer and a
//               possible collaborator; often needs less advice, not more, so
//               it ranks below a stated problem despite being more impressive.
//   teaching    sharing practice learned from doing. Real, but they are the
//               supply side.
//   commenting  opinions, predictions, reactions to the news. The hot air.
//   selling     pitching an AI product or service. NOT a buyer, and the reason
//               this is a named stance rather than a low score is that a vendor
//               can otherwise look identical to a builder.
//
// ── The two multipliers ────────────────────────────────────────────────────
// First person is the single best discriminator available without a model:
// "AI will transform marketing" and "we shipped an agent that handles tier-1
// support" are the same topic and different planets, and the difference is
// whether the author put themselves in the sentence.
//
// Concreteness is second: a number, a named tool, or a verb that implies work
// actually happened.
//
// ── Still deterministic, and now it shows its working ──────────────────────
// Every flag carries the sentence that produced it. A score is arguable; a
// quoted line is not, and Krish can read it on the row and disagree with the
// classifier in one glance.

export interface Post {
  text?: string | null
  /** ISO date. Undated posts are treated as old: an intent signal that cannot
   *  be dated cannot be called recent. */
  postedAt?: string | null
  url?: string | null
}

export type Stance =
  | 'asking' | 'struggling' | 'hiring' | 'evaluating'
  | 'building' | 'teaching' | 'commenting' | 'selling'

/** Base value of each stance to this business. See the ladder above. */
export const STANCE_VALUE: Record<Stance, number> = {
  asking: 90,
  struggling: 85,
  hiring: 70,
  evaluating: 65,
  building: 55,
  teaching: 35,
  commenting: 12,
  selling: 8,
}

export const STANCE_LABEL: Record<Stance, string> = {
  asking: 'asking for help',
  struggling: 'hitting problems',
  hiring: 'building a team',
  evaluating: 'evaluating tools',
  building: 'shipping AI work',
  teaching: 'teaching practice',
  commenting: 'commenting',
  selling: 'selling AI',
}

/** Does this post concern AI at all? Deliberately broad — the filter that
 *  matters is the stance ladder, not this gate. */
const AI_RE = /\b(ai|a\.i\.|artificial intelligence|llms?|large language models?|genai|gen ai|generative ai|agentic|ai agents?|machine learning|deep learning|chatgpt|claude|gemini|copilot|openai|anthropic|perplexity|midjourney|prompt engineering|rag|fine-?tun\w*|vibe cod\w*|evals?|post-?training|foundation models?|copilots?)\b/i

/** Subjects, for the chip and for search. Specific first: the label shown is
 *  the first that matched, so "AI agents" should win over the bare "AI". */
const TOPICS: { term: string; re: RegExp }[] = [
  { term: 'AI agents', re: /\bai\s+agents?\b|\bagentic\b|\bmulti-?agent\b/i },
  { term: 'LLMs', re: /\bllms?\b|\blarge language models?\b|\bfine-?tun\w*\b|\brag\b/i },
  { term: 'AI strategy', re: /\bai\s+(strategy|roadmap|transformation|adoption|readiness|operating model)\b/i },
  { term: 'AI governance', re: /\bai\s+(governance|safety|ethics|regulation|policy|risk)\b|\beu ai act\b/i },
  { term: 'AI products', re: /\bai[-\s](powered|native|first|driven)\b|\bai\s+products?\b/i },
  { term: 'AI in marketing', re: /\bai\b[^.]{0,40}\b(marketing|advertising|media|creative|brand)\b/i },
  { term: 'automation', re: /\bautomat\w+\b|\bworkflows?\b/i },
  { term: 'prompting', re: /\bprompt(ing|s)?\b|\bprompt engineering\b|\bvibe cod\w*\b/i },
  { term: 'specific tools', re: /\b(chatgpt|claude|gemini|copilot|midjourney|openai|anthropic|perplexity|cursor|n8n|zapier)\b/i },
  { term: 'machine learning', re: /\bmachine learning\b|\bdeep learning\b|\bneural net(work)?s?\b/i },
  { term: 'generative AI', re: /\bgen(erative)?[-\s]?ai\b/i },
]

/** First person. The discriminator between a claim about the world and a claim
 *  about the author's own week. */
const FIRST_PERSON_RE = /\b(i|i'?m|i'?ve|we|we'?re|we'?ve|our|my|us)\b/i

/** Evidence that something actually happened: a number, a named tool, or a
 *  verb that cannot be performed by having an opinion. */
const CONCRETE_RE = /\b\d+([.,]\d+)?\s*(%|x|k|m|hours?|days?|weeks?|months?|people|users?|customers?|agents?|models?|calls?|tickets?|leads?)\b|\b(shipped|launched|deployed|migrated|rebuilt|automated|integrated|wired|replaced|cut|saved|scaled|prototyped|instrumented)\b|\b(chatgpt|claude|gemini|copilot|openai|anthropic|cursor|n8n|zapier|langchain|perplexity)\b/i

// Stance patterns, tested in ladder order so the strongest claim in a post
// wins. Each is anchored on how people actually write on LinkedIn, and the
// doing-stances require the author to be in the sentence.
const STANCE_RULES: { stance: Stance; re: RegExp; needsFirstPerson: boolean }[] = [
  {
    stance: 'asking',
    needsFirstPerson: false,
    re: /\b(any (recommendations|advice|suggestions|tips)|looking for (recommendations|advice|help|someone|a partner)|who('s| is| has) (good|best|done|cracked)|can anyone|does anyone (know|have)|would love (input|advice|pointers)|what (are|would) you (using|recommend|do)|how (are|do) you (all )?(handle|approach|deal with)|open to (ideas|suggestions))\b/i,
  },
  {
    stance: 'struggling',
    needsFirstPerson: true,
    // Deliberately narrow. Every loose term that used to be here — "problem",
    // "messy", "failed", "hardest part" — matched commentary far more often
    // than it matched a person with a live problem, and a false positive on
    // this stance is the most expensive one available: it puts hot air at the
    // top of the list.
    re: /\b(struggl(e|ing) (with|to)|(are|is|am|'?re|'?m) stuck|(can'?t|cannot|couldn'?t) (seem to |figure|get|work out|crack|stop|make)|still (haven'?t|can'?t)|haven'?t (cracked|figured|solved|managed)|keeps? (breaking|failing|hallucinating)|doesn'?t work|isn'?t working|blocked on|burned? (weeks|months|days)|wasted (weeks|months|days)|our biggest (challenge|blocker|headache))\b/i,
  },
  {
    stance: 'hiring',
    needsFirstPerson: false,
    re: /\b(we'?re hiring|now hiring|join (our|the) team|new role|hiring an?|building (out )?(our|a) (ai|data|automation) (team|function|practice|capability)|head of ai|ai lead|got (the )?(budget|sign-?off|green ?light)|standing up a team)\b/i,
  },
  {
    stance: 'evaluating',
    needsFirstPerson: true,
    re: /\b(evaluat\w+|trial(l)?ing|piloting|a pilot|poc\b|proof of concept|testing out|comparing|bake-?off|shortlist\w*|kicking the tyres|assessing|running an experiment|experimenting with)\b/i,
  },
  {
    stance: 'building',
    needsFirstPerson: true,
    re: /\b(built|building|shipped|shipping|launched|deployed|deploying|rolled out|rolling out|prototyp\w+|wired up|put (it )?into production|live (in|with)|we made|i made|migrat\w+|automated|integrated|replaced)\b/i,
  },
  {
    stance: 'teaching',
    needsFirstPerson: false,
    re: /\b(here'?s how|step[-\s]by[-\s]step|lessons? (learned|from)|what (i|we) learned|a guide to|how to|playbook|breakdown|tutorial|walkthrough|framework for|template)\b/i,
  },
  {
    stance: 'selling',
    needsFirstPerson: false,
    re: /\b(book a (demo|call)|dm me|get in touch|our (platform|product|solution|software|tool) (helps|lets|gives)|sign up (now|today|free)|free trial|limited spots|early access|waitlist|link in (the )?comments|check it out|launch(ing)? (today|soon)|introducing our)\b/i,
  },
]

export interface IntentEvidence {
  stance: Stance
  /** The sentence that produced the classification, trimmed. */
  quote: string
  postedAt: string | null
  url: string | null
  firstPerson: boolean
  concrete: boolean
  /** What this one post scored, before volume. */
  score: number
}

export interface IntentSignal {
  /** 0-100. The best single piece of evidence, with a small bonus for
   *  sustained posting. Zero means nothing AI-related, or nothing recent. */
  score: number
  /** The stance behind the score. Null when there is no signal. */
  stance: Stance | null
  topics: string[]
  /** One line for the row. Names the stance, not just the subject. */
  summary: string | null
  /** The sentence that earned the score. A score is arguable; a quote is not. */
  evidence: string | null
  evidenceUrl: string | null
  lastPostAt: string | null
  aiPosts: number
  postsRead: number
  /** Every classified post, strongest first. Stored so the model can be
   *  re-scored later without paying to scrape anyone again. */
  all: IntentEvidence[]
}

const DAY = 86_400_000

/** Full weight inside a month, nothing past a quarter. The cliff is
 *  deliberate: a badge reading "hitting problems with AI" over a post from
 *  last year is a lie the row tells at a glance. */
function recencyWeight(ageDays: number): number {
  if (ageDays <= 30) return 1
  if (ageDays >= 90) return 0
  return (90 - ageDays) / 60
}

/** Split into sentences so the evidence quote is the claim itself rather than
 *  an eight-paragraph post. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 12)
}

/** Talking about what OTHER people do. A post can be specific, first-person in
 *  grammar and still be commentary: "anyone currently assuming they're the only
 *  one struggling" was read as somebody struggling, and it is a LinkedIn post
 *  about struggle. The high stances all claim something about the author's own
 *  current work, so a sentence generalising about the world cannot support one. */
const ABOUT_OTHERS_RE = /\b(anyone|everyone|most people|many people|companies|organi[sz]ations|the industry|people (are|who)|if you|founders|teams are|leaders are|nobody|no one)\b/i

/** Reporting a finished thing. A success story is building or teaching; it is
 *  never a live problem, however much difficulty it describes on the way. */
/** Struggling has to be struggling WITH something you are working on. Without
 *  this, "we're stuck comparing AI to almonds" scored 64: the grammar of a
 *  problem with none of the substance. */
const WORK_OBJECT_RE = /\b(pipeline|model|models|agent|agents|rollout|roll-?out|deployment|project|integration|eval|evals|dataset|data|workflow|workflows|automation|tool|tooling|stack|system|prompt|prompts|api|implementation|migration|adoption|pilot|poc|use case|team|process)\b/i

const RESOLVED_RE = /\b(here'?s how (we|i)|lesson|what (i|we) learned|in the end|we solved|turned out|ended up|now (it|we) (works?|can)|the fix was|takeaway)\b/i

function classifyPost(text: string): { stance: Stance; quote: string } | null {
  const sents = sentences(text)
  // Whole-post fallback for posts written without punctuation, which is most
  // of LinkedIn.
  const units = sents.length ? sents : [text.slice(0, 400)]

  // Stances that assert something about the author's own current work. For
  // these the QUOTED SENTENCE must itself be about AI — letting the whole post
  // vouch for it is how "in my 20s I was sad I'd just missed that era, but
  // we've been struggling with a certain image" became an AI intent signal.
  const SELF_CLAIM: ReadonlySet<Stance> = new Set<Stance>(['asking', 'struggling', 'evaluating', 'building'])

  for (const rule of STANCE_RULES) {
    for (const s of units) {
      if (!rule.re.test(s)) continue
      if (rule.needsFirstPerson && !FIRST_PERSON_RE.test(s)) continue
      if (SELF_CLAIM.has(rule.stance)) {
        if (!AI_RE.test(s)) continue
        if (ABOUT_OTHERS_RE.test(s)) continue
        if (rule.stance === 'struggling') {
          if (RESOLVED_RE.test(text)) continue
          // The problem must be with a thing they are working on.
          if (!WORK_OBJECT_RE.test(s)) continue
        }
      } else if (!AI_RE.test(s) && !AI_RE.test(text)) continue
      return { stance: rule.stance, quote: s }
    }
  }
  return { stance: 'commenting', quote: units[0] }
}

export function readIntent(posts: Post[], now = new Date()): IntentSignal {
  const dated = posts.map(p => {
    const t = p.postedAt ? Date.parse(p.postedAt) : NaN
    return {
      text: (p.text || '').slice(0, 4000),
      at: Number.isFinite(t) ? t : null,
      url: p.url || null,
    }
  })

  const lastPostAt = dated.reduce<number | null>(
    (max, p) => (p.at !== null && (max === null || p.at > max) ? p.at : max), null)

  const topics: string[] = []
  const all: IntentEvidence[] = []
  let aiPosts = 0

  for (const p of dated) {
    if (!p.text || !AI_RE.test(p.text)) continue
    aiPosts++
    for (const t of TOPICS) if (t.re.test(p.text) && !topics.includes(t.term)) topics.push(t.term)

    const c = classifyPost(p.text)
    if (!c) continue

    const firstPerson = FIRST_PERSON_RE.test(c.quote) || FIRST_PERSON_RE.test(p.text.slice(0, 300))
    const concrete = CONCRETE_RE.test(p.text)
    // An undated post is evidence of interest, never of intent.
    const ageDays = p.at === null ? Infinity : (now.getTime() - p.at) / DAY

    const score = Math.round(
      STANCE_VALUE[c.stance]
      * (firstPerson ? 1 : 0.5)
      * (concrete ? 1 : 0.75)
      * recencyWeight(ageDays),
    )

    all.push({
      stance: c.stance,
      quote: c.quote.replace(/\s+/g, ' ').slice(0, 300),
      postedAt: p.at === null ? null : new Date(p.at).toISOString(),
      url: p.url,
      firstPerson,
      concrete,
      score,
    })
  }

  all.sort((a, b) => b.score - a.score)
  const top = all[0]

  // Sustained beats one-off, but only a little: three posts of hot air must not
  // add up to one person with a problem.
  // Volume is a nudge, not a lift. With a 0.12 bonus every struggling post
  // landed on 95 and the stance stopped discriminating within itself, which
  // defeats the point of scoring at all.
  const strong = all.filter(e => e.score > 0).length
  const volume = 1 + Math.min(0.06, 0.02 * Math.max(0, strong - 1))
  const score = top ? Math.min(100, Math.round(top.score * volume)) : 0

  return {
    score,
    stance: score > 0 && top ? top.stance : null,
    topics: topics.slice(0, 5),
    summary: score > 0 && top
      ? `${STANCE_LABEL[top.stance]}${topics.length ? ` — ${topics.slice(0, 2).join(', ')}` : ''}`
      : null,
    evidence: score > 0 && top ? top.quote : null,
    evidenceUrl: score > 0 && top ? top.url : null,
    lastPostAt: lastPostAt === null ? null : new Date(lastPostAt).toISOString(),
    aiPosts,
    postsRead: dated.length,
    all: all.slice(0, 10),
  }
}
