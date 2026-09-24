// The judging ladder's verdict, as the dashboard reads it.
//
// content-engine's api/judge/ladder.ts writes meta.ladder on every idea it
// judges: the panel's standing, which judge held it down, what each repair was
// given and what it decided, and the router's fit against all three
// subchannels. Until 2026-09-24 the dashboard read NONE of it. The engine
// learned to expand, research, repair and route, and the tab it reports to
// still showed a title and a thesis.
//
// ONE READER. Every surface that wants a score, a band or a judge name comes
// through here, for the reason the venture-label map exists: five files holding
// five spellings of the same idea is how the taxonomy drifted, and a verdict is
// exactly the kind of thing that grows a second spelling the moment two
// components each parse it.
//
// Everything is optional and nothing throws. A row judged by an older roster,
// a row never judged at all, and a row whose run died mid-write all have to
// render, because the alternative is a tab that goes blank over a shape change
// in a JSON column.

/** Where a piece stands, in the ladder's own words. */
export type Band = 'ready' | 'repairable' | 'weak' | 'unjudged'

/** What the expansion made of the seed, summarised. The full expansion is not
 *  on the row: this is the shape of it, which is enough to say whether the
 *  piece was judged as a headline or as an argument. */
export interface LadderExpansion {
  ok: boolean
  angle: string | null
  parties: string[]
  scenarios: number
  decisionRule: boolean
  known: number
  inferred: number
  failed: string | null
}

export interface LadderAttempt {
  n: number
  outcome: 'improved' | 'declined' | 'unchanged' | 'call_failed' | 'regressed'
  detail: string | null
  score_before: number | null
  score_after: number | null
  weakest_before: string | null
  /** Whether the repair had research to work from. A refusal WITH research is
   *  a finished idea; one with none is a lookup that did not happen, and the
   *  desk has to be able to tell them apart because they need different things
   *  from Krish. */
  researched?: boolean
  sources?: string[]
  briefed?: number
}

export interface LadderVerdict {
  band: Band
  /** The panel's standing: the median judge, never a mean. */
  score: number | null
  /** The genuinely lowest judge. Not the same as the score since 2026-09-24,
   *  and the distinction is the point: the score says how good it is, this says
   *  what to fix. */
  weakest: string | null
  /** Where it started, before any repair. */
  firstScore: number | null
  expansion: LadderExpansion
  attempts: LadderAttempt[]
  /** The panel run these numbers came from. The eight per-judge scores are NOT
   *  on the row — they live in judge_verdicts, joined on this. A scorecard is a
   *  detail view that fetches them, not something the list can render for free,
   *  and pretending otherwise would put a second copy of the verdicts in a JSON
   *  column for a view most rows never open. */
  panelRunId: string | null
  /** The router's fit against every subchannel, not just the winner. A piece
   *  scoring low on all three is homeless, which is a verdict. */
  fits: Record<string, number>
  winner: string | null
  contested: string[]
  routerWhy: string | null
  /** True when the router's pick differs from the subchannel on the row. */
  routerDisagrees: boolean
  /** Present only on a piece that reached the weak band: the second reading
   *  that decided whether it lands on the Sunday list. */
  confirmation: {
    firstScore: number | null
    secondScore: number | null
    agreed: boolean
    reExpanded: boolean
  } | null
  judgedAt: string | null
  rosterVersion: string | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

const BANDS: Band[] = ['ready', 'repairable', 'weak', 'unjudged']
const band = (v: unknown): Band => (BANDS.includes(v as Band) ? (v as Band) : 'unjudged')

/**
 * Read the ladder's verdict off a row, or null when it was never judged.
 *
 * Null and a weak verdict are different facts and the caller must be able to
 * tell them apart: "the machine has not looked at this yet" and "the machine
 * looked and could not lift it" are opposite instructions to a human.
 */
export function ladderVerdict(row: { meta?: Record<string, any> | null } | null | undefined): LadderVerdict | null {
  const l = row?.meta?.ladder
  if (!l || typeof l !== 'object') return null

  const final = (l.final && typeof l.final === 'object') ? l.final : {}
  const first = (l.first && typeof l.first === 'object') ? l.first : {}
  const router = (l.router && typeof l.router === 'object') ? l.router : null
  const conf = (l.bury_confirmation && typeof l.bury_confirmation === 'object') ? l.bury_confirmation : null

  const exp = (l.expansion && typeof l.expansion === 'object') ? l.expansion : {}

  const fits: Record<string, number> = {}
  if (router?.fits && typeof router.fits === 'object') {
    for (const [k, v] of Object.entries(router.fits)) {
      const n = num(v)
      if (n !== null) fits[k] = n
    }
  }

  return {
    band: band(final.band),
    score: num(final.score),
    weakest: str(final.weakest),
    firstScore: num(first.score),
    expansion: {
      ok: !exp.failed,
      angle: str(exp.angle),
      parties: Array.isArray(exp.parties) ? exp.parties.filter((p: unknown) => typeof p === 'string') : [],
      scenarios: num(exp.scenarios) ?? 0,
      decisionRule: exp.decision_rule === true,
      known: num(exp.known) ?? 0,
      inferred: num(exp.inferred) ?? 0,
      failed: str(exp.failed),
    },
    panelRunId: str(l.panel_run_id),
    attempts: Array.isArray(l.attempts)
      ? l.attempts.map((a: any): LadderAttempt => ({
          n: num(a?.n) ?? 0,
          outcome: a?.outcome ?? 'unchanged',
          detail: str(a?.detail),
          score_before: num(a?.score_before),
          score_after: num(a?.score_after),
          weakest_before: str(a?.weakest_before),
          researched: a?.researched === true,
          sources: Array.isArray(a?.sources) ? a.sources.filter((s: unknown) => typeof s === 'string') : [],
          briefed: num(a?.briefed) ?? 0,
        }))
      : [],
    fits,
    winner: str(router?.winner),
    contested: Array.isArray(router?.contested) ? router.contested.filter((c: unknown) => typeof c === 'string') : [],
    routerWhy: str(router?.why),
    routerDisagrees: l.router_disagrees === true,
    confirmation: conf
      ? {
          firstScore: num(conf.first?.score),
          secondScore: num(conf.second?.score),
          agreed: conf.agreed === true,
          reExpanded: conf.re_expanded === true,
        }
      : null,
    judgedAt: str(l.judged_at),
    rosterVersion: str(l.roster_version),
  }
}

/**
 * The judge that held a piece down, in words rather than a rubric key.
 *
 * The Sunday list groups by this, so a rubric doing all the killing is visible
 * on sight rather than after someone runs a query. These read as what the
 * judge WANTED, not as what it is called, because "reader" on its own tells
 * Krish nothing about why a piece is sitting there.
 */
export const JUDGE_ASK: Record<string, string> = {
  novelty: 'Says this has been said before',
  evidence: 'Cannot trace the reasoning',
  consequence: 'Nobody does anything differently',
  reader: 'Will not reach the person it is for',
  buyer: 'Reaches nobody who might hire you',
  connection: 'One news item, not a pattern',
  fun: 'Nobody would enjoy this',
  standing: 'Not yours to say',
}

export const judgeAsk = (judge: string | null): string =>
  (judge && JUDGE_ASK[judge]) || 'The panel could not name one thing'

/**
 * What a weak piece needs from Krish, which is not the same for every one.
 *
 * Measured on the ten he graded: every repair that refused did so for want of
 * a named client, a real deal or a moment he had lived, and no amount of web
 * research can supply those. That is a different ask from a piece nobody
 * researched at all, and the list is useless if it renders them the same.
 */
export function whatItNeeds(v: LadderVerdict): 'your standing' | 'a lookup that never ran' | 'a decision' {
  const last = v.attempts[v.attempts.length - 1]
  if (!last) return 'a decision'
  if (last.outcome === 'declined' && last.researched) return 'your standing'
  if (last.outcome === 'declined' && !last.researched) return 'a lookup that never ran'
  return 'a decision'
}
