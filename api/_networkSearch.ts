import { supabase } from './_supabase.js'
import { embed, vectorLiteral } from './_embeddings.js'
import { callClaude, robustJson } from './_content.js'
import { planQuery, type QueryPlan } from './_networkQuery.js'

// The shared execution path behind /api/network/search, /recommend and /voice.
//
//   question -> plan -> embed -> network_search() -> rerank -> results
//
// Every stage degrades rather than fails. No key, no model, no embedding: the
// search still returns ranked people, just with a weaker signal. The one thing
// that must never happen is an empty result for a reasonable question.

/** Below this, the query-dependent signal is indistinguishable from noise.
 *
 *  Calibrated against the corpus, not guessed: "purple monkey dishwasher"
 *  measures 0.000 across 20 rows, while "chief marketing officer bank AI
 *  governance" measures 0.394. Anything under 0.10 means we did not understand
 *  the question or the network does not contain the answer — the UI says so and
 *  STILL shows the rows. Note this thresholds query_relevance, not match_score:
 *  a well-connected person scores ~38 on relationship alone, so match_score
 *  cannot tell a nonsense query from a real one. */
const WEAK_RELEVANCE = 0.10

const RERANK_MODEL = 'claude-sonnet-4-6'

export interface NetworkResult {
  contact_id: string
  full_name: string | null
  company: string | null
  title: string | null
  email: string | null
  linkedin_url: string | null
  who: string | null
  why_them: string | null
  hook: string | null
  risk: string | null
  roles: string[]
  surface_when: string[]
  network_tier: string
  best_channel: string | null
  reachable_via: string[]
  confidence: string
  intel_method: string
  seniority: string | null
  country: string | null
  industry: string | null
  venture_scores: Record<string, number>
  thin_evidence: boolean
  match_score: number
  query_relevance: number | null
  s_semantic: number
  s_lexical: number
  s_constraint: number
  s_relationship: number
  s_actionability: number
  venture_multiplier: number
  /** Added by the rerank pass. */
  why_match?: string
}

export interface SearchOptions {
  question?: string
  venture?: string | null
  roles?: string[] | null
  tiers?: string[] | null
  minConfidence?: string | null
  limit?: number
  /** Skip the LLM rerank. The UI uses this for instant filter changes, where a
   *  second of latency costs more than a sentence of explanation adds. */
  rerank?: boolean
  /** Pre-supplied plan, for recommend mode where there is no free text. */
  plan?: QueryPlan
}

export interface SearchResponse {
  ok: true
  restated: string
  /** Per-stage milliseconds. Kept in the response, not just a log line: when
   *  this endpoint is slow the question is always WHICH stage, and answering it
   *  from the outside otherwise means guessing or redeploying. */
  timings: Record<string, number>
  results: NetworkResult[]
  weak: boolean
  total: number
  plan: { venture: string | null; constraints: QueryPlan['constraints']; keywords: string }
  degraded: string[]
}

export async function runNetworkSearch(opts: SearchOptions): Promise<SearchResponse> {
  const degraded: string[] = []
  const timings: Record<string, number> = {}
  const t0 = Date.now()
  const mark = (k: string, from: number) => { timings[k] = Date.now() - from }
  const limit = Math.max(1, Math.min(100, opts.limit ?? 20))

  // 1 + 2. Plan and embed CONCURRENTLY.
  //
  // These used to be sequential, because the embedding was taken of the
  // planner's `semantic_query`. That made the planner's ~4s a hard prefix on
  // the embedding's ~2s for no retrieval benefit worth 4 seconds: embedding the
  // operator's own words retrieves nearly as well, and the plan is still used
  // for everything it is actually good at (constraints, venture, keywords, and
  // the `restated` line).
  //
  // The wait is now max(plan, embed) instead of plan + embed.
  const planPromise: Promise<QueryPlan> = opts.plan
    ? Promise.resolve(opts.plan)
    : planQuery(opts.question || '').then(r => {
        if (!r.planned && r.reason) degraded.push(`planner:${r.reason}`)
        return r.plan
      })

  // A null vector is fine: network_search skips the semantic term, renormalises
  // the remaining weights, and falls back to an exhaustive scan, which is
  // CHEAPER without a vector. Degrading here costs latency, not answers.
  const embedText = opts.plan?.semantic_query || opts.question || ''
  const vecPromise: Promise<string | null> = embedText
    ? embed({ title: null, body: embedText })
        .then(v => { if (!v) degraded.push('embedding:unavailable'); return v ? vectorLiteral(v) : null })
        .catch((e: unknown) => { degraded.push(`embedding:${(e as Error)?.message?.slice(0, 60) || 'error'}`); return null })
    : Promise.resolve(null)

  const tPlan = Date.now()
  const [planned, qvec] = await Promise.all([
    planPromise.then(r => { mark('plan', tPlan); return r }),
    vecPromise.then(r => { mark('embed', tPlan); return r }),
  ])
  mark('plan_and_embed', tPlan)
  let plan = planned
  if (opts.venture) plan = { ...plan, venture: opts.venture }

  // 3. Score. Over-fetch so the rerank has something to reorder.
  const poolSize = Math.min(100, Math.max(limit * 2, 40))
  const tRpc = Date.now()
  const { data, error } = await supabase.rpc('network_search', {
    p_query_vec: qvec,
    p_keywords: plan.keywords || null,
    p_venture: plan.venture,
    p_constraints: plan.constraints,
    p_tiers: opts.tiers && opts.tiers.length ? opts.tiers : null,
    p_min_conf: opts.minConfidence || null,
    p_roles: opts.roles && opts.roles.length ? opts.roles : null,
    p_limit: poolSize,
  })
  mark('rpc', tRpc)
  if (error) throw new Error(`network_search: ${error.message}`)

  let results = (data || []) as NetworkResult[]

  // Weakness is a property of the BEST result, not the average: one strong match
  // among twenty weak ones is a successful search.
  //
  // It is also only meaningful when a question was ASKED. network_search returns
  // query_relevance NULL when neither the semantic nor the lexical tier ran,
  // which is exactly recommend mode: there is no question, so there is nothing
  // to have failed to understand. Treating that as weak made the venture
  // recommender always render "nothing matches this closely" over a perfectly
  // good list of buyers.
  const scored = results.filter(r => r.query_relevance !== null && r.query_relevance !== undefined)
  const topRelevance = scored.length ? Math.max(...scored.map(r => Number(r.query_relevance))) : null
  const weak = results.length === 0 || (topRelevance !== null && topRelevance < WEAK_RELEVANCE)

  // 4. Rerank + explain, OFF the critical path by default.
  //
  //    Measured on production: this endpoint took 33.5s with the rerank and 8.2s
  //    without. Generating a sentence per candidate is ~25s of model output, and
  //    on a phone that is indistinguishable from the app having hung. Worse, the
  //    function's ceiling is 60s, so a slow upstream turned a slow search into a
  //    failed one.
  //
  //    Explanations are now a second, separate request (/api/network/explain)
  //    that fills `why_match` in behind an already-rendered list. Ranking does
  //    not depend on them: the scorer decides the order, the model only says
  //    why. Pass rerank:true to keep both in one round trip.
  if (opts.rerank === true && results.length > 0 && !weak) {
    try {
      const tRe = Date.now()
      results = await rerank(opts.question || plan.restated, results, limit)
      mark('rerank', tRe)
    } catch (e: unknown) {
      degraded.push(`rerank:${(e as Error)?.message?.slice(0, 60) || 'error'}`)
    }
  }

  mark('total', t0)
  return {
    ok: true,
    restated: plan.restated,
    timings,
    results: results.slice(0, limit),
    weak,
    total: results.length,
    plan: { venture: plan.venture, constraints: plan.constraints, keywords: plan.keywords },
    degraded,
  }
}

const RERANK_SYSTEM = `You are reordering search results over Krish Raja's professional network, and writing one line per person saying why they match.

You are given the question and a numbered list of candidates the scorer already ranked. For each, you have their role, company, the stored judgment about them, and a component score breakdown.

Return STRICT JSON ONLY, no prose and no code fences:
{ "ranked": [{ "i": number, "why_match": string }] }

Rules:
- "i" is the candidate's given index. Include every candidate exactly once, in your preferred order.
- "why_match" is ONE short sentence, grounded ONLY in that person's supplied fields, saying why they answer THIS question. Cite the concrete thing: their role, their company, the stored reason. Never invent a fact that is not in front of you.
- If someone is a poor match, say so plainly in their why_match and rank them low. Do not manufacture a connection. A candidate list is not a promise that everyone on it fits.
- Trust the scorer's ordering unless you have a specific reason from the supplied fields to move someone. You are correcting it, not replacing it.
- No em dashes.`

async function rerank(question: string, rows: NetworkResult[], limit: number): Promise<NetworkResult[]> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('missing_anthropic_key')
  // Only the head of the list is worth a model's attention; the tail is
  // returned in scorer order. Twelve, not twenty: output length is what this
  // costs, and nobody reads a justification for result nineteen.
  const head = rows.slice(0, Math.min(rows.length, 12))

  const candidates = head.map((r, i) => ({
    i,
    name: r.full_name,
    title: r.title,
    company: r.company,
    tier: r.network_tier,
    roles: r.roles,
    who: r.who,
    why_them: r.why_them,
    risk: r.risk,
    thin_evidence: r.thin_evidence,
    score: r.match_score,
  }))

  const text = await callClaude({
    model: RERANK_MODEL,
    system: RERANK_SYSTEM,
    user: `QUESTION:\n${question}\n\nCANDIDATES:\n${JSON.stringify(candidates, null, 1)}`,
    maxTokens: 900,
    temperature: 0,
    timeoutMs: 20_000,
  })
  const parsed = robustJson(text) as { ranked?: { i: number; why_match: string }[] } | null
  if (!parsed || !Array.isArray(parsed.ranked)) throw new Error('rerank_unparseable')

  const out: NetworkResult[] = []
  const seen = new Set<number>()
  for (const item of parsed.ranked) {
    const idx = Number(item?.i)
    if (!Number.isInteger(idx) || idx < 0 || idx >= head.length || seen.has(idx)) continue
    seen.add(idx)
    out.push({ ...head[idx], why_match: String(item.why_match || '').slice(0, 400) })
  }
  // Anything the model dropped keeps its scorer position. A reranker silently
  // deleting candidates would be indistinguishable from a search that found
  // fewer people.
  head.forEach((r, i) => { if (!seen.has(i)) out.push(r) })
  return [...out, ...rows.slice(head.length)]
}

export { WEAK_RELEVANCE }
