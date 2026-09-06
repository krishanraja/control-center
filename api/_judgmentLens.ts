// ─────────────────────────────────────────────────────────────────────────────
// The "Judgment Economy" editorial lens (Control Center copy).
//
// One curated point of view that drives BOTH the content-idea radar (the seed
// rail) and the podcast-guest scout toward a specific editorial direction:
//
//   Execution is becoming free; judgment, taste, coordination and credibility
//   are the new moat. The leaders worth covering point AI at the repeatable
//   middle and spend their own judgment on the calls no model can make.
//
// Distilled from a curated set of anchor signals (LinkedIn posts, essays,
// podcast guests). Those anchors live here as calibration EXEMPLARS and a
// curated voice/source list - never as content_ideas rows. The radar/scout use
// this lens to go and find MORE in the same direction; they never paste the
// seeds into a queue.
//
// Mirrors mm-ctrl/supabase/functions/_shared/editorial-lens.ts (the same
// direction, expressed for each product's own voice). Kept deliberately small.
// ─────────────────────────────────────────────────────────────────────────────

export interface CuratedVoice {
  /** Display name. */
  name: string
  /** LinkedIn /in/ slug, when known (drives the profile-posts scrape). */
  linkedin?: string
  /** One line on why this voice fits the direction. */
  why: string
}

export interface JudgmentLens {
  id: string
  thesis: string
  facets: string[]
  exemplarPOVs: string[]
  antagonists: string[]
  evidencePatterns: string[]
  /** Bare domains worth lifting in reputation (a quality signal, not a filter). */
  curatedSources: string[]
  /** Sharp operators in this direction - seed the content radar AND the guest scout.
   *  Since 2026-09-02 the content_creators table is canonical (read through
   *  api/_creators.ts loadCuratedVoices); this array is the migration seed and
   *  the no-database fallback. Add new creators to the table, not here. */
  curatedVoices: CuratedVoice[]
  /** The kind of operator worth booking - the guest-scout archetype. */
  guestArchetype: string
}

export const JUDGMENT_ECONOMY_LENS: JudgmentLens = {
  id: 'judgment-economy',
  thesis:
    'Execution is becoming free; judgment, taste, coordination and credibility are the new moat. ' +
    'The leaders worth covering point AI at the repeatable middle and spend their own judgment on the calls no model can make.',
  facets: [
    'the software/execution moat is dying - anything cloneable in a weekend was never the moat',
    'judgment, taste and verification are the scarce, monetizable assets',
    'most of AI transformation is human: process, adoption, orchestration, routing, evals',
    'non-linear careers and community capitalise on judgment, not headcount',
  ],
  exemplarPOVs: [
    'If non-engineers can clone your product in days, the moat was the data, contracts and switching costs, never the features.',
    'Trust AI to do the work, not to do the thinking - the dangerous prompt is "what is wrong with this?".',
    'Most of AI transformation has nothing to do with AI: only one of ten steps is the model.',
    'When coordination gets cheap, the moat migrates from the work to owning the work’s context.',
    'Token cost makes model routing, not raw capability, the next applied-AI edge.',
  ],
  antagonists: [
    'the easy button and the "one prompt, job done" promise',
    'the demo that cannot run by week ten',
    'hype with no shipped proof',
    'the say-do gap between what leaders claim and what they actually deploy',
  ],
  evidencePatterns: [
    'a real deployment, number or shipped outcome, not a press release',
    'a named tradeoff or the judgment call a leader actually had to make',
    'who owns the context, distribution or credibility layer',
  ],
  curatedSources: [
    'every.to',
    'stratechery.com',
    'platformer.news',
    'newcomer.co',
    'groundlevel-ai.com',
    'importai.net',
  ],
  curatedVoices: [
    { name: 'Dan Pratl', linkedin: 'danpratl', why: 'ex-SEC attorney building verification/credibility infra for the AI economy; "monetize judgment".' },
    { name: 'Alanna Laforet', linkedin: 'alanna-laforet-7672281', why: 'serial reinventor (adtech -> web3 -> AI regulation); portfolio-of-you, thesis-led.' },
    { name: 'Justin Kramm', linkedin: 'justinkramm', why: 'creative director turned movement-builder; taste, attention and community as the moat.' },
    { name: 'Melissa Rosenthal', why: 'the "clone test" - the software moat was never the features.' },
    { name: 'Sharon Goldman', why: 'Ground Level AI - what happens when AI meets the real world.' },
    { name: 'Cole Medin', why: 'multi-agent orchestration; the model that writes the code is not the one grading it.' },
    { name: 'Aaron Levie', why: 'token cost and model routing as the applied-AI differentiator.' },
    { name: 'Alex Lieberman', why: 'most of AI transformation has nothing to do with AI.' },
    { name: 'Joe Reid', why: 'when coordination gets cheap, the moat migrates to owning the work’s context.' },
  ],
  guestArchetype:
    'An operator who has been inside multiple decaying systems and can narrate the meta-pattern; ' +
    'building for the judgment/credibility/attention economy; non-linear, judgment-led and community-driven; ' +
    'strong point of view and a story-arc career; honest and specific, not a hype merchant.',
}

// ── Deterministic, no-API fit scoring ────────────────────────────────────────
// Mirrors the repo's keyword-classifier style (e.g. _relevance / classifyCategory):
// fast, testable, and honest. The radar/scout use this to gate + rank candidates
// by how squarely they sit in the direction. An embedding cross-check can layer
// on later; this is the floor and it never calls an API.

// Weighted on-direction terms. Core terms (the spine of the thesis) count double.
const CORE_TERMS: string[] = [
  'judgment', 'judgement', 'taste', 'moat', 'clone', 'cloned', 'commoditi',
  'execution', 'orchestrat', 'model routing', 'evals', 'eval ', 'verification',
  'credibility', 'coordination', 'non-linear', 'nonlinear', 'say-do', 'say/do',
  'context layer', 'agentic', 'leverage',
]
const SUPPORT_TERMS: string[] = [
  'easy button', 'one prompt', 'hype', 'proof', 'shipped', 'deployment', 'in production',
  'tradeoff', 'trade-off', 'distribution', 'headcount', 'reskill', 'adoption', 'autonomy',
  'friction', 'workflow', 'fractional', 'reinvent', 'portfolio', 'community', 'attention',
  'wetware', 'expertise', 'middle managers', 'real deployment', 'roi', 'switching cost',
]

const SATURATION = 5 // weighted-hit total at which fit saturates to 1.0

/**
 * How squarely a piece of text sits in the Judgment-Economy direction, in [0,1].
 * Pure + deterministic: same input always yields the same score, no network.
 */
export function lensFitScore(text: string | null | undefined): number {
  if (!text) return 0
  const t = text.toLowerCase()
  let hits = 0
  for (const term of CORE_TERMS) if (t.includes(term)) hits += 2
  for (const term of SUPPORT_TERMS) if (t.includes(term)) hits += 1
  return hits >= SATURATION ? 1 : hits / SATURATION
}

/** True when the text clears the on-direction bar (default 0.4 = ~2 core hits). */
export function isOnDirection(text: string | null | undefined, threshold = 0.4): boolean {
  return lensFitScore(text) >= threshold
}

/** Search queries that hunt the direction on the open web (Exa/Perplexity). */
export function lensThemeQueries(): string[] {
  return [
    'AI killed the software moat - judgment and taste as the new advantage',
    'leaders monetizing judgment and expertise in the AI economy',
    'most of AI transformation is human: process, adoption, orchestration, evals',
    'when coordination gets cheap the moat moves to owning the context layer',
    'non-linear careers reinventing around AI - operators who capitalise on judgment',
    'model routing and token cost as the applied-AI differentiator',
  ]
}
