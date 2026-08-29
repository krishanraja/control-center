import { callClaude, robustJson } from './_content.js'
import { JUDGE_MODEL } from './_models.js'
import { isRetiredVenture } from './_venturePositioning.js'

// Turns a sentence Krish typed or spoke into a query plan the scorer can run.
//
// The output is deliberately NOT a SQL fragment or a filter set. It is a set of
// WEIGHTED, SOFT signals, because network_search never filters on them — a
// person matching three of four constraints still ranks. If the planner could
// emit hard filters it would be able to return an empty result for a reasonable
// question, which is the exact failure this feature exists to remove.

// Haiku, not Sonnet. Planning is extraction into a fixed JSON shape, which is
// what this repo already uses Haiku for elsewhere (_relevance.ts,
// content-ideas/cluster.ts, pilot/resolve-ask.ts).
//
// Measured on the same three queries: Sonnet 4.6-5.0s, Haiku 2.1-2.7s. On a
// user-facing search that ran on every keystroke-to-answer, the planner was the
// single largest remaining cost once the explanation pass moved off the critical
// path, and 2.5s per search is worth more than the marginal plan quality.
//
// The trade is real and small: Haiku occasionally omits a venture inference that
// Sonnet makes. That costs less than it sounds, because the venture multiplier
// is penalty-only [0.65, 1.0], so a missed venture means no demotion rather than
// a missed boost. Constraints are soft either way.
const MODEL = JUDGE_MODEL

// Fields the planner may constrain on. This is an allow-list, not documentation:
// anything outside it is dropped before the plan reaches Postgres, so a
// hallucinated column degrades the score instead of the request. network_search
// also ignores unknown fields, which makes this belt and braces on purpose.
export const CONSTRAINT_FIELDS = [
  // 'geo' is where geography goes. 'country' is kept as an accepted alias
  // because it is the older name and a model that has seen either will emit
  // either; network_search normalises both to 'geo' and canonicalises the
  // values, so "GB", "United Kingdom", "Britain" and "London" all land on the
  // same country. Values are matched against the RESOLVED geo_code, which is
  // wider than the country column: it falls back to the contact's location and
  // then to the email ccTLD, and that fallback is the difference between 3,679
  // people with a known country and roughly 4,600.
  'seniority', 'geo', 'country', 'industry', 'company', 'title',
  'roles', 'surface_when', 'reachable_via', 'best_channel',
  'network_tier', 'confidence', 'primary_venture', 'mindmake_buyer_family',
] as const

// The live portfolio only. AdFixus (retired July 2026) is deliberately absent:
// listing it here let the planner classify AdFixus-flavoured queries, emit
// venture:'adfixus', and re-rank the whole network by a venture Krish no longer
// runs. Retirement is centralised in _venturePositioning.RETIRED_VENTURES;
// sanitizePlan also guards against a stale/model-emitted retired slug below.
const VENTURES = ['mindmake', 'signal_noise', 'builder_economy'] as const
const ROLES = ['buyer', 'partner', 'introducer', 'guest', 'operator_peer', 'investor', 'hire'] as const
const SENIORITY = ['founder_cxo', 'vp_director', 'manager_senior', 'ic_unknown'] as const
const TIERS = ['1_reciprocated', '2_core_network', '3_known_network', '4_owned_network', '5_cold_lead'] as const

export interface Constraint {
  field: string
  values: string[]
  weight: number
}

export interface QueryPlan {
  /** One line restating what was understood. Rendered above the results so the
   *  interpretation is confirmable at a glance rather than inferred from them. */
  restated: string
  /** Text to embed for the semantic tier. */
  semantic_query: string
  /** Space-joined terms for the lexical tier. OR'd in SQL, so more terms widen
   *  recall rather than narrowing it. */
  keywords: string
  venture: string | null
  constraints: Constraint[]
}

const SYSTEM = `You translate a question about Krish Raja's professional network into a search plan.

His network is 10,670 resolved people. Each carries: a one-line "who", a "why_them" judgment, a conversational "hook", a risk note, roles, per-venture fit scores, seniority, country, industry, company, title, and a relationship tier.

His ventures:
- mindmake — AI advisory, education and products. Buyers are senior operators at non-vendor companies who must build AI capability.
- signal_noise — a B2B/AI go-to-market podcast. Needs guests with a real operator story.
- builder_economy — building in the age of AI. Community, cohort and audience.

Return STRICT JSON ONLY, no prose and no code fences:
{
  "restated": string,
  "semantic_query": string,
  "keywords": string,
  "venture": one of ${JSON.stringify(VENTURES)} or null,
  "constraints": [{ "field": string, "values": string[], "weight": number }]
}

Rules:
- "restated" is ONE plain sentence stating what you understood him to be asking. It is shown to him before the results. No preamble, no "I will".
- "semantic_query" is a rich natural-language restatement to embed. Describe the KIND OF PERSON being looked for, not the instruction. Write "chief marketing officer at a regulated bank responsible for AI governance", never "find me CMOs".
- "keywords" is a space-separated list of concrete literal terms worth matching exactly: company names, surnames, product names, industry words. Omit generic words like "people", "find", "someone". Empty string if there are none.
- "constraints" are SOFT. They are weighted boosts, never filters, so include one whenever the question implies it even if you are unsure — a wrong constraint costs a little ranking, a missing one costs the right answer. Weight 1.0 for something stated outright, 0.5-0.7 for something implied.
- Allowed "field" values, and nothing else: ${JSON.stringify(CONSTRAINT_FIELDS)}
- Geography goes in a "geo" constraint. Emit the ISO-3166 alpha-2 country code where you know it: GB for the UK, Britain, England, Scotland or a British city; AU for Australia or an Australian city; US for the USA, America or an American city. Otherwise emit the plain English country name. A city is fine as a value ("London"), it resolves to its country. Add a geo constraint whenever a place is named. His three markets are the United States, the United Kingdom and Australia, so those are the ones that come up; do not invent a location he did not mention.
- Controlled vocabularies. roles: ${JSON.stringify(ROLES)}. seniority: ${JSON.stringify(SENIORITY)}. network_tier: ${JSON.stringify(TIERS)}. confidence: ["high","medium","low"]. best_channel: ["email","linkedin_dm","instagram_dm","phone"].
- "industry", "company" and "title" match on substring, so prefer a short distinctive fragment: "media agency", not "independent media agency group".
- Set "venture" only when the question is actually about one of his ventures. It re-ranks everyone, so a wrong guess is expensive.
- Never invent a person, a company, or a filter he did not imply.
- If the question carries no discernible intent, say so plainly in "restated" and leave the other fields empty rather than guessing at constraints.
- No em dashes anywhere in "restated". Use a comma, a full stop, or a semicolon. This is a house copy standard and it applies to model output as much as to hand-written text.`

function clampWeight(w: unknown): number {
  const n = Number(w)
  if (!Number.isFinite(n)) return 1
  return Math.max(0.1, Math.min(1, n))
}

/** Validate and narrow whatever the model returned. Everything here is defensive
 *  because the plan is interpolated into a database call: unknown fields are
 *  dropped, weights are clamped, and every string is length-capped. */
export function sanitizePlan(raw: unknown, fallbackQuery: string): QueryPlan {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const allowed = new Set<string>(CONSTRAINT_FIELDS)

  const constraints: Constraint[] = Array.isArray(o.constraints)
    ? (o.constraints as unknown[])
        .map(c => (c && typeof c === 'object' ? c : {}) as Record<string, unknown>)
        .filter(c => typeof c.field === 'string' && allowed.has(c.field))
        .map(c => ({
          field: String(c.field),
          values: (Array.isArray(c.values) ? c.values : [])
            .map(v => String(v).slice(0, 80)).filter(Boolean).slice(0, 12),
          weight: clampWeight(c.weight),
        }))
        .filter(c => c.values.length > 0)
        .slice(0, 8)
    : []

  // A retired venture is dropped even if the model emits it, so a stored angle
  // or a stale prompt can never resurrect one into the ranker.
  const venture = typeof o.venture === 'string'
    && (VENTURES as readonly string[]).includes(o.venture)
    && !isRetiredVenture(o.venture)
    ? o.venture
    : null

  return {
    // Em dashes stripped rather than merely discouraged. The prompt asks; this
    // enforces, the same way sanitizeVoice does for outbound prose.
    restated: String(o.restated || fallbackQuery).replace(/\s*[—–]\s*/g, ', ').slice(0, 300),
    // Falling back to the raw question is right: an unusable plan should
    // degrade the ranking, never blank the search.
    semantic_query: String(o.semantic_query || fallbackQuery).slice(0, 1200),
    keywords: String(o.keywords || '').slice(0, 300),
    venture,
    constraints,
  }
}

/** Plan a query. Never throws: without a key, or on any model failure, it falls
 *  back to using the raw question as both the semantic and lexical query. That
 *  degrades result quality and still returns people, which is the whole
 *  contract. */
export async function planQuery(question: string): Promise<{ plan: QueryPlan; planned: boolean; reason?: string }> {
  const q = (question || '').trim().slice(0, 1000)
  const fallback: QueryPlan = {
    restated: q,
    semantic_query: q,
    // Strip the interrogative scaffolding so it does not dilute the lexical
    // tier, which OR's its terms.
    keywords: q.replace(/\b(who|what|which|find|me|should|i|talk|to|about|for|the|a|an|is|are|in|at|of|and|or|my|can|could|someone|people|person)\b/gi, ' ')
               .replace(/\s+/g, ' ').trim(),
    venture: null,
    constraints: [],
  }
  if (!q) return { plan: fallback, planned: false, reason: 'empty_query' }
  if (!process.env.ANTHROPIC_API_KEY) return { plan: fallback, planned: false, reason: 'missing_anthropic_key' }

  try {
    const text = await callClaude({
      agent: 'network-query',
      model: MODEL,
      system: SYSTEM,
      user: q,
      maxTokens: 700,
      // Planning is extraction, not writing. Temperature 0 keeps the same
      // question producing the same plan, so a result set that looks wrong can
      // actually be debugged.
      temperature: 0,
      // The plan is on the critical path of a user-facing search. If it has not
      // arrived in 8s the raw question is a perfectly serviceable query, and a
      // degraded ranking beats a spinner.
      timeoutMs: 8_000,
    })
    const parsed = robustJson(text)
    if (!parsed) return { plan: fallback, planned: false, reason: 'planner_unparseable' }
    return { plan: sanitizePlan(parsed, q), planned: true }
  } catch (e: unknown) {
    return { plan: fallback, planned: false, reason: (e as Error)?.message?.slice(0, 120) || 'planner_error' }
  }
}
