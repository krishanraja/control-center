// _icpScore — the executable copy of docs/APOLLO_ICP_RUBRIC.md.
//
// Given an Apollo-enriched record, ask Claude to score every dimension of every
// lane (0-100), then compute lane scores, tier, primary_venture, tags and the
// insert decision DETERMINISTICALLY in code (per architecture rule 15.5:
// numbers are computed, never LLM-emitted). The model judges fit; code does math.

import { callClaude } from './_content.js'
import type { ApolloEnriched } from './_apollo.js'
import { SYNTHESIS_MODEL } from './_models.js'

// Lane definitions. `key` is the icp_scores jsonb key (registry slug where one
// exists, else the tag). `primaryVenture` is the FK we set when this is the best
// lane. `dims` weights sum to 1.0 and match docs/APOLLO_ICP_RUBRIC.md §3.
export interface Lane {
  key: string
  tag: string
  primaryVenture: 'mindmaker' | 'signal_noise' | 'builder_economy'
  dims: Record<string, number>
}

export const LANES: Lane[] = [
  { key: 'mindmaker', tag: 'mindmaker_buyer', primaryVenture: 'mindmaker',
    dims: { role_fit: 0.30, intent_signals: 0.25, ai_fluency_gap: 0.20, budget_signal: 0.15, audience_overlap: 0.10 } },
  { key: 'fractional_network', tag: 'fractional_network', primaryVenture: 'mindmaker',
    dims: { role_fit: 0.30, referral_reach: 0.25, ai_delivery_fit: 0.20, independence_signal: 0.15, audience_overlap: 0.10 } },
  { key: 'signal_noise', tag: 'signal_noise_guest', primaryVenture: 'signal_noise',
    dims: { narrative_strength: 0.35, novelty: 0.25, audience_pull: 0.20, availability_signal: 0.10, krish_curiosity: 0.10 } },
  { key: 'builder_economy', tag: 'builder_economy_guest', primaryVenture: 'builder_economy',
    dims: { leverage_score: 0.35, ship_cadence: 0.25, infra_thesis: 0.20, audience_pull: 0.10, krish_curiosity: 0.10 } },
  { key: 'mm_ctrl_buyer', tag: 'mm_ctrl_buyer', primaryVenture: 'mindmaker',
    dims: { decision_load: 0.30, seniority_fit: 0.25, ai_curiosity: 0.20, budget_signal: 0.15, reachability: 0.10 } },
  { key: 'ecosystem_partner', tag: 'ecosystem_partner', primaryVenture: 'mindmaker',
    dims: { channel_leverage: 0.35, audience_overlap: 0.25, collaboration_fit: 0.20, reachability: 0.10, krish_curiosity: 0.10 } },
]

// Cross-lane tier thresholds on the best lane score (docs §5).
const TIER_A = 80
const TIER_B = 60
const TIER_C = 40
// A lead is only inserted if its best lane clears this (docs §6 — the "10/10" gate).
export const INSERT_THRESHOLD = 70
// Reachability hard cap: no email AND no LinkedIn → can't act on them (docs §3).
const UNREACHABLE_CAP = 55

export interface IcpScoreResult {
  icp_scores: Record<string, number>
  best_lane: string
  best_score: number
  tier: 'A' | 'B' | 'C'
  icp_score: number
  primary_venture: 'mindmaker' | 'signal_noise' | 'builder_economy'
  tags: string[]
  why_relevant: string
  /** Action verb + object: the one move to make on this person now. Empty when
   *  the judge returned nothing usable. */
  next_step: string
  dimension_breakdown: Record<string, Record<string, number>>
  insert: boolean
}

function recordContext(p: ApolloEnriched): string {
  return [
    `Name: ${p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || '(unknown)'}`,
    p.title ? `Title: ${p.title}` : '',
    p.headline ? `Headline: ${p.headline}` : '',
    p.organization_name ? `Company: ${p.organization_name}${p.organization_industry ? ` (${p.organization_industry})` : ''}` : '',
    p.organization_num_employees ? `Company size: ~${p.organization_num_employees} employees` : '',
    p.organization_website ? `Company site: ${p.organization_website}` : '',
    [p.city, p.state, p.country].filter(Boolean).length ? `Location: ${[p.city, p.state, p.country].filter(Boolean).join(', ')}` : '',
    p.email ? `Email: verified on file` : 'Email: not revealed',
    p.linkedin_url ? `LinkedIn: ${p.linkedin_url}` : '',
    p.employment_history?.length
      ? `Career: ${p.employment_history.map(e => `${e.title || ''}${e.organization_name ? ` @ ${e.organization_name}` : ''}`).filter(s => s.trim()).join('; ')}`
      : '',
  ].filter(Boolean).join('\n')
}

function buildScoringPrompt(p: ApolloEnriched, webContext?: string): { system: string; user: string } {
  const laneSpec = LANES.map(l => `- ${l.key}: dimensions [${Object.keys(l.dims).join(', ')}]`).join('\n')
  const system = [
    'You are an ICP analyst for Krish Raja\'s Mindmaker portfolio (AI consulting, builder products, and two podcasts).',
    'Score one prospect against every lane. For EACH lane, score EACH listed dimension 0-100 strictly from the record below.',
    'Be conservative: if a signal is absent from the record, that dimension is LOW (10-30), never invented. High scores (80+) require explicit evidence.',
    'CRITICAL for the BUYER lanes (mindmaker, mm_ctrl_buyer): the prospect must be a BUYER, not a seller. If their employer is itself an AI/software vendor (company name contains "AI", or industry is software / IT services / artificial intelligence), they are the supply side — score mindmaker and mm_ctrl_buyer 25 or below.',
    'Lanes: mindmaker = AI-ADOPTION buyers: senior operators or dedicated AI/transformation leaders INSIDE non-vendor operating companies who need help adopting AI. fractional_network = fractional execs / independent advisors who actually DELIVER AI work (referral + co-delivery + buyers); a generic fractional CMO with no AI signal scores low. signal_noise = podcast GUESTS who are credible AI-in-media voices. builder_economy = podcast GUESTS doing something that was IMPOSSIBLE BEFORE AI (a tiny team shipping what used to take many, a net-new AI-native product, novel craft) with real audience/traction; a junior AI engineer at a dev shop scores low. mm_ctrl_buyer = leaders at NON-AI operating companies (manufacturing, healthcare, logistics, professional services, retail) with high decision load who would buy an external decision-clarity product; leaders at AI/software companies score low (they build their own). ecosystem_partner = startup accelerators / VC platforms / communities (NOT government or nonprofit programs) who can channel many buyers or guests.',
    'Return ONLY strict JSON, no prose, no code fences.',
  ].join(' ')
  const user = [
    'PROSPECT RECORD:',
    recordContext(p),
    webContext ? `\nWEB FINDINGS (use for audience reach + novelty, esp. builder_economy):\n${webContext}` : '',
    '',
    'LANES AND THEIR DIMENSIONS:',
    laneSpec,
    '',
    'Return JSON of exactly this shape:',
    '{',
    '  "scores": { "<lane>": { "<dimension>": <0-100>, ... }, ... },',
    '  "why_relevant": "<one concrete sentence grounded in the record, naming the strongest lane>",',
    '  "next_step": "<action verb + object: the one move to make on this person now>"',
    '}',
    '',
    // The n8n deep-enrich workflow has emitted next_step for the same entity
    // for months, and leads.next_step already renders on the card. This scorer
    // wrote the row without it, so whether a lead arrived with a move attached
    // depended on which path scored it.
    'next_step must be a concrete first move, not a category: "send the Maven cohort link referencing their AI-governance post" not "reach out". If the record does not support a specific move, say what to find out first.',
  ].join('\n')
  return { system, user }
}

function parseJson(text: string): any {
  let t = (text || '').trim()
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const a = t.indexOf('{'); const b = t.lastIndexOf('}')
  if (a >= 0 && b > a) t = t.slice(a, b + 1)
  return JSON.parse(t)
}

/** Score one enriched prospect against the rubric. Returns per-lane scores, the
 *  insert decision, and everything needed to write a leads row. */
export async function scoreProspect(p: ApolloEnriched, opts: { webContext?: string } = {}): Promise<IcpScoreResult> {
  const { system, user } = buildScoringPrompt(p, opts.webContext)
  const raw = await callClaude({ agent: 'icp-score', system, user, model: SYNTHESIS_MODEL, maxTokens: 900, temperature: 0.2 })
  const parsed = parseJson(raw)
  const modelScores: Record<string, Record<string, number>> = parsed?.scores || {}
  const why = String(parsed?.why_relevant || '').trim()
  const nextStep = String(parsed?.next_step || '').trim()

  const reachable = !!(p.email || p.linkedin_url)
  // Deterministic guard (calibration v2): an AI/software-vendor employer is the
  // supply side, so the BUYER lanes are capped hard regardless of the model.
  const vendor = isAIVendor(p)

  const icp_scores: Record<string, number> = {}
  const dimension_breakdown: Record<string, Record<string, number>> = {}
  for (const lane of LANES) {
    const dims = modelScores[lane.key] || {}
    let sum = 0
    const brk: Record<string, number> = {}
    for (const [dim, w] of Object.entries(lane.dims)) {
      const v = clamp(Number(dims[dim])) // missing/NaN → 0
      brk[dim] = v
      sum += v * w
    }
    let laneScore = Math.round(sum)
    if (!reachable) laneScore = Math.min(laneScore, UNREACHABLE_CAP)
    if (vendor && (lane.key === 'mindmaker' || lane.key === 'mm_ctrl_buyer')) laneScore = Math.min(laneScore, 25)
    icp_scores[lane.key] = laneScore
    dimension_breakdown[lane.key] = brk
  }

  // Best lane + tags (every lane clearing tier-C earns its tag).
  let best = LANES[0]
  for (const lane of LANES) if (icp_scores[lane.key] > icp_scores[best.key]) best = lane
  const best_score = icp_scores[best.key]
  const tags = LANES.filter(l => icp_scores[l.key] >= TIER_C).map(l => l.tag)
  if (!tags.includes(best.tag)) tags.unshift(best.tag)

  const tier: 'A' | 'B' | 'C' = best_score >= TIER_A ? 'A' : best_score >= TIER_B ? 'B' : 'C'

  return {
    icp_scores,
    best_lane: best.tag,
    best_score,
    tier,
    icp_score: best_score,
    primary_venture: best.primaryVenture,
    tags,
    why_relevant: why,
    next_step: nextStep,
    dimension_breakdown,
    insert: best_score >= INSERT_THRESHOLD,
  }
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

// An AI/software vendor employer = the supply side, disqualifying for the buyer
// lanes. Standalone "AI" token in the org name, or a software/AI industry.
function isAIVendor(p: ApolloEnriched): boolean {
  const name = (p.organization_name || '').toLowerCase()
  if (/\bai\b/.test(name) || /artificial intelligence/.test(name)) return true
  const ind = (p.organization_industry || '').toLowerCase()
  return /software|artificial intelligence|information technology/.test(ind)
}
