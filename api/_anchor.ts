// _anchor: Thursday anchor selection. Pure module, no I/O: the route loads the
// pool and this decides. Same split as _trendGate.ts / shifts/detect.ts.
//
// ORDER MATTERS AND IT IS THE POINT. Deterministic pre-gates run first because
// they are free. Scored ranking runs second on survivors only. The cheap kills
// (interested party, denominator, base rate) run third, BEFORE any ladder
// spend, because the expensive thing is the ladder and the whole design goal is
// to never run one on an anchor that was never going to hold.
//
// Anchors come from `inspiration_sweep`, not `pool_headline`. Measured on the
// live DB 2026-08-05: pool_headline has ONE live row, newest 2026-07-10, and
// the daily ingest has inserted nothing for about four weeks. inspiration_sweep
// has 44 live rows, newest today, and 100 percent URL coverage.

import {
  check, extractNumbers, namedArtifacts, denominatorVerdict, sourceTier,
  rootDomain, titleJaccard, normalizeSpan,
  type GateCheck,
} from './_gates.js'

export const ANCHOR_WINDOW_DAYS = 21
export const MAX_CANDIDATES_SCORED = 40
export const ANCHOR_DEDUPE_JACCARD = 0.5

/** Score weights. Every one is a named export so the ranking is auditable. */
export const W_FRESHNESS = 3.0
export const W_CORROBORATION = 2.5
export const W_SPECIFICITY = 2.0
export const W_CHECKABILITY = 3.0
export const W_PILLAR_FIT = 1.5
export const W_SOURCE_TIER = 2.0
export const W_DURABILITY = 1.0

export interface AnchorCandidate {
  id: string
  headline: string
  snippet: string
  url: string | null
  /** First citation day, 'YYYY-MM-DD'. */
  day: string
  recurrences: number
  temporalClass: string | null
  pillarId: string | null
  brandFit: number | null
  qualityScore: string | null
  sourceType: string
  sourceLabel: string | null
  state: string | null
}

export interface PreGateOutcome {
  passed: boolean
  checks: GateCheck[]
  failedIds: string[]
}

export interface PreGateOpts {
  today: string
  /** Headlines of anchors already investigated, for repeat suppression. */
  priorAnchorHeadlines: string[]
  windowDays?: number
}

function daysBetween(a: string, b: string): number {
  const t1 = new Date(`${a}T00:00:00Z`).getTime()
  const t2 = new Date(`${b}T00:00:00Z`).getTime()
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 9999
  return Math.round((t1 - t2) / 86_400_000)
}

/** FREE. Nothing here costs a call, so everything that can be decided here is
 *  decided here. A candidate that fails any of these never reaches the scorer. */
export function preGateAnchor(c: AnchorCandidate, opts: PreGateOpts): PreGateOutcome {
  const checks: GateCheck[] = []
  const failed: string[] = []
  const fail = (id: string, observed: unknown, expected: string) => {
    checks.push(check(id, false, observed, expected))
    failed.push(id)
  }
  const pass = (id: string, observed: unknown, expected: string) => checks.push(check(id, true, observed, expected))

  const dom = rootDomain(c.url)
  if (dom) pass('has_citable_url', dom, 'a parseable root domain')
  else fail('has_citable_url', c.url, 'a parseable root domain')

  const age = daysBetween(opts.today, c.day)
  const win = opts.windowDays ?? ANCHOR_WINDOW_DAYS
  if (age >= 0 && age <= win) pass('within_window', age, `first cited within ${win} days`)
  else fail('within_window', age, `first cited within ${win} days`)

  const live = c.state !== 'dropped' && c.state !== 'absorbed' && c.state !== 'published'
  if (live) pass('state_live', c.state, 'not dropped, absorbed or already published')
  else fail('state_live', c.state, 'not dropped, absorbed or already published')

  // Something must be there to investigate: a number, or a named entity.
  const text = `${c.headline} ${c.snippet}`
  const nums = extractNumbers(text).filter(n => !n.yearLike)
  const arts = namedArtifacts(text)
  const investigable = nums.length > 0 || arts.length >= 2
  if (investigable) pass('investigable', { numbers: nums.length, named_artifacts: arts.length }, 'at least one number, or two named artifacts')
  else fail('investigable', { numbers: nums.length, named_artifacts: arts.length }, 'at least one number, or two named artifacts')

  if (c.pillarId) pass('pillar_assigned', c.pillarId, 'a pillar, whose evidence_required becomes the bar')
  else fail('pillar_assigned', null, 'a pillar, whose evidence_required becomes the bar')

  const dupe = opts.priorAnchorHeadlines.find(h => titleJaccard(h, c.headline) >= ANCHOR_DEDUPE_JACCARD)
  if (!dupe) pass('not_repeat_anchor', null, `no prior anchor within jaccard ${ANCHOR_DEDUPE_JACCARD}`)
  else fail('not_repeat_anchor', dupe.slice(0, 120), `no prior anchor within jaccard ${ANCHOR_DEDUPE_JACCARD}`)

  return { passed: failed.length === 0, checks, failedIds: failed }
}

export interface AnchorScore {
  total: number
  parts: Record<string, number>
  observed: Record<string, unknown>
}

/** Transparent additive score over survivors. Deliberately NOT a place where a
 *  vendor number can win: the vendor rule is a GATE, applied after this, in
 *  code, never a weight that a high freshness score could outvote. */
export function scoreAnchor(c: AnchorCandidate, today: string): AnchorScore {
  const age = Math.max(0, daysBetween(today, c.day))
  const freshness = Math.max(0, 1 - age / ANCHOR_WINDOW_DAYS)

  // Cross-day corroboration is the strongest honest freshness signal available
  // in this schema: the sweep dedupes a re-seen story into meta.recurrences
  // rather than a duplicate row, so a recurrence is a real second citation.
  const corroboration = Math.min(1, c.recurrences / 3)

  const text = `${c.headline} ${c.snippet}`
  const nums = extractNumbers(text).filter(n => !n.yearLike).length
  const arts = namedArtifacts(text).length
  const specificity = Math.min(1, (nums * 0.25) + (arts * 0.08))

  // A denominated number is checkable. A bare ratio is a marketing artifact
  // until proven otherwise, so it scores zero here rather than negative: the
  // penalty it deserves is the G1 gate, not a thumb on the scale.
  //
  // Read the SAME span G1 reads. Scoring the whole headline-plus-snippet while
  // the gate reads only the number-bearing sentence let the score award full
  // checkability to an item the gate then called a bare ratio (observed live
  // 2026-08-05 on the CrowdStrike anchor). A score that disagrees with the gate
  // about the same property is a trap, not a signal.
  const den = denominatorVerdict(numberSentence(c))
  const checkability = den.verdict === 'denominated' ? 1 : den.verdict === 'no_number' ? 0.3 : 0

  const pillarFit = c.brandFit ? Math.min(1, c.brandFit / 10) : 0.4
  const tier = sourceTier(c.url)
  const tierScore = [1, 0.85, 0.6, 0.3, 0.15][tier] ?? 0.15
  const quality = c.qualityScore === 'green' ? 1 : c.qualityScore === 'amber' ? 0.6 : 0.3
  const durability = c.temporalClass === 'durable' ? 1 : c.temporalClass === 'developing' ? 0.7 : 0.35

  const parts = {
    freshness: Number((W_FRESHNESS * freshness).toFixed(3)),
    corroboration: Number((W_CORROBORATION * corroboration).toFixed(3)),
    specificity: Number((W_SPECIFICITY * specificity).toFixed(3)),
    checkability: Number((W_CHECKABILITY * checkability).toFixed(3)),
    pillar_fit: Number((W_PILLAR_FIT * pillarFit * quality).toFixed(3)),
    source_tier: Number((W_SOURCE_TIER * tierScore).toFixed(3)),
    durability: Number((W_DURABILITY * durability).toFixed(3)),
  }
  const total = Number(Object.values(parts).reduce((a, b) => a + b, 0).toFixed(3))

  return {
    total,
    parts,
    observed: {
      age_days: age, recurrences: c.recurrences, numbers: nums, named_artifacts: arts,
      denominator: den.verdict, denominator_matched: den.matched,
      source_tier: tier, domain: rootDomain(c.url), quality: c.qualityScore,
      temporal_class: c.temporalClass, brand_fit: c.brandFit,
    },
  }
}

export interface RankedAnchor {
  candidate: AnchorCandidate
  preGate: PreGateOutcome
  score: AnchorScore | null
  rank: number | null
  /** Passed the pre-gates but fell outside MAX_CANDIDATES_SCORED. Reported, not
   *  silently dropped: cap-and-report is the discipline this pipeline inherits
   *  from api/growth/geo-probe.ts, and a candidate that was merely over the cap
   *  is not the same thing as one that failed a gate. */
  overCap: boolean
}

export function rankAnchors(cands: AnchorCandidate[], opts: PreGateOpts): RankedAnchor[] {
  const rows: RankedAnchor[] = cands.map(c => {
    const pg = preGateAnchor(c, opts)
    return { candidate: c, preGate: pg, score: pg.passed ? scoreAnchor(c, opts.today) : null, rank: null, overCap: false }
  })
  const survivors = rows.filter(r => r.score).sort((a, b) => (b.score as AnchorScore).total - (a.score as AnchorScore).total)
  survivors.forEach((r, i) => {
    if (i < MAX_CANDIDATES_SCORED) r.rank = i + 1
    else r.overCap = true
  })
  return rows
}

/** The number-bearing sentence, which is what G1 classifies. A sweep row splits
 *  the claim across idea and thesis, so the honest unit is both, trimmed to the
 *  sentence that actually carries a number when one exists. */
export function numberSentence(c: AnchorCandidate): string {
  const whole = normalizeSpan(`${c.headline}. ${c.snippet}`)
  const sentences = whole.split(/(?<=[.!?])\s+/)
  const withNum = sentences.find(s => extractNumbers(s).some(n => !n.yearLike))
  return withNum || whole.slice(0, 600)
}
