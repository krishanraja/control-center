// _standards — the Five Standards gate, as a pure function.
//
// Extracted from api/content-ideas/[id]/score.ts so the same rubric that grades a
// draft in the product can grade a draft in an experiment. The route still owns
// persistence; this module owns only judgement. Nothing here touches the
// database, which is the entire point: an eval run has to be able to score a few
// hundred candidate drafts without writing one of them to a row.
//
// Keep the rubric text here and nowhere else. The moment the route and the
// harness grade against two different bars, every number the harness prints
// becomes a number about the harness rather than about the content.

import { callClaude, robustJson } from './_content.js'

export const STANDARD_KEYS = ['unique', 'researched', 'thoughtful', 'kind', 'helpful'] as const
export type StandardKey = typeof STANDARD_KEYS[number]

/** The two standards most AI-default content fails. A fail here is red, not amber. */
export const WATCH_STANDARDS: readonly StandardKey[] = ['unique', 'kind'] as const

export type StandardsScores = Record<StandardKey, number>

export interface StandardsVerdict {
  scores: StandardsScores
  failing: StandardKey[]
  notes: Partial<Record<StandardKey, string>>
  verdict: string | null
  /** green = nothing failing; amber = a non-watch fail; red = a watch fail. */
  quality_score: 'green' | 'amber' | 'red'
}

export interface StandardsInput {
  idea: string
  thesis?: string | null
  draft: string
  /** True when the piece is grounded in a real artifact rather than commentary. */
  hasArtifact?: boolean
}

export function buildStandardsSystem(corpus: string): string {
  return [
    'You are the Five Standards gate for Krish Raja\'s content. Score a draft against the channel corpus. Be a hard, honest editor — most drafts are a 3 on unique and kind; reserve 5 for genuinely exceptional. The two watch standards are "unique" (could anyone in his peer group have written this?) and "kind" (warm to people, sharp on ideas, never cruel or generic-mean).',
    corpus ? `\nCORPUS (the bar each standard must clear):\n${corpus.slice(0, 6000)}` : '',
    '\nReturn ONLY JSON: {"unique":1-5,"researched":1-5,"thoughtful":1-5,"kind":1-5,"helpful":1-5,"notes":{"unique":string,"researched":string,"thoughtful":string,"kind":string,"helpful":string},"verdict":string}',
  ].join('\n')
}

export function buildStandardsUser(input: StandardsInput): string {
  const artifact = input.hasArtifact ? 'yes' : 'unknown — may be commentary on a thing read'
  return `IDEA: ${input.idea}${input.thesis ? `\nTHESIS: ${input.thesis}` : ''}\nARTIFACT-SOURCED: ${artifact}\n\nDRAFT:\n${input.draft.slice(0, 6000)}`
}

/** Turn a parsed judge response into a verdict. Pure; no network, no clock. */
export function readStandards(parsed: any): StandardsVerdict {
  const scores = {} as StandardsScores
  for (const k of STANDARD_KEYS) scores[k] = Math.max(1, Math.min(5, Number(parsed?.[k]) || 3))
  const failing = STANDARD_KEYS.filter(k => scores[k] < 3)
  const watchFails = failing.filter(k => (WATCH_STANDARDS as readonly string[]).includes(k))
  return {
    scores,
    failing,
    notes: (parsed?.notes && typeof parsed.notes === 'object') ? parsed.notes : {},
    verdict: parsed?.verdict ? String(parsed.verdict) : null,
    quality_score: watchFails.length ? 'red' : failing.length ? 'amber' : 'green',
  }
}

/** The headline continuous metric: mean of the five 1-5 scores.
 *
 *  quality_score is what the product shows Krish, because a traffic light is what
 *  you can act on at a glance. It is the wrong statistic for an experiment: it is
 *  categorical, and it saturates — most drafts land amber, so a change that lifts
 *  every draft by half a point can move the mean and leave the light untouched.
 *  Report both; decide on this one. */
export function standardsMean(v: StandardsVerdict): number {
  const vals = STANDARD_KEYS.map(k => v.scores[k])
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

export interface ScoreOpts {
  corpus: string
  /** Judge model. Callers on the auto-score path pass haiku to stay cost-safe. */
  model?: string
  timeoutMs?: number
}

/** Score one draft. Throws on transport failure or an unparseable judge reply. */
export async function scoreStandards(input: StandardsInput, opts: ScoreOpts): Promise<StandardsVerdict> {
  const parsed = robustJson(await callClaude({
    agent: 'standards',
    system: buildStandardsSystem(opts.corpus),
    user: buildStandardsUser(input),
    maxTokens: 1200,
    temperature: 0.3,
    model: opts.model,
    timeoutMs: opts.timeoutMs,
  }))
  if (!parsed) throw new Error('could not parse score')
  return readStandards(parsed)
}
