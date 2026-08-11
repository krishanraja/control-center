import { callClaude, robustJson } from './_content.js'

// Turns a sentence Krish typed or spoke into a query plan the scorer can run.
//
// The output is deliberately NOT a SQL fragment or a filter set. It is a set of
// WEIGHTED, SOFT signals, because network_search never filters on them — a
// person matching three of four constraints still ranks. If the planner could
// emit hard filters it would be able to return an empty result for a reasonable
// question, which is the exact failure this feature exists to remove.

const MODEL = 'claude-sonnet-4-6'

// Fields the planner may constrain on. This is an allow-list, not documentation:
// anything outside it is dropped before the plan reaches Postgres, so a
// hallucinated column degrades the score instead of the request. network_search
// also ignores unknown fields, which makes this belt and braces on purpose.
export const CONSTRAINT_FIELDS = [
  'seniority', 'country', 'industry', 'company', 'title',
  'roles', 'surface_when', 'reachable_via', 'best_channel',
  'network_tier', 'confidence', 'primary_venture', 'mindmaker_buyer_family',
] as const

const VENTURES = ['mindmaker', 'adfixus', 'signal_noise', 'builder_economy'] as const
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
- mindmaker — AI advisory, education and products. Buyers are senior operators at non-vendor companies who must build AI capability.
- adfixus — identity infrastructure for publishers and media owners. Buyers are publisher-side identity, data and addressability people.
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
- Controlled vocabularies. roles: ${JSON.stringify(ROLES)}. seniority: ${JSON.stringify(SENIORITY)}. network_tier: ${JSON.stringify(TIERS)}. confidence: ["high","medium","low"]. best_channel: ["email","linkedin_dm","instagram_dm","phone"].
- "industry", "company" and "title" match on substring, so prefer a short distinctive fragment: "media agency", not "independent media agency group".
- Set "venture" only when the question is actually about one of his ventures. It re-ranks everyone, so a wrong guess is expensive.
- Never invent a person, a company, or a filter he did not imply.`

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

  const venture = typeof o.venture === 'string' && (VENTURES as readonly string[]).includes(o.venture)
    ? o.venture
    : null

  return {
    restated: String(o.restated || fallbackQuery).slice(0, 300),
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
      model: MODEL,
      system: SYSTEM,
      user: q,
      maxTokens: 900,
      // Planning is extraction, not writing. Temperature 0 keeps the same
      // question producing the same plan, so a result set that looks wrong can
      // actually be debugged.
      temperature: 0,
    })
    const parsed = robustJson(text)
    if (!parsed) return { plan: fallback, planned: false, reason: 'planner_unparseable' }
    return { plan: sanitizePlan(parsed, q), planned: true }
  } catch (e: unknown) {
    return { plan: fallback, planned: false, reason: (e as Error)?.message?.slice(0, 120) || 'planner_error' }
  }
}
