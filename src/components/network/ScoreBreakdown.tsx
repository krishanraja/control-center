import type { ScoreBreakdown as Breakdown } from '../../hooks/useNetworkSearch'
import { WhyBadge } from '../shared/WhyBadge'
import type { Why } from '../../lib/servedSurfaces'

// The score, and why it is that number.
//
// A ranked list whose ordering cannot be interrogated is a list you either
// trust blindly or ignore. Five bars is the whole explanation: which signal put
// this person here, and which one is carrying nothing.
//
// This used to draw its own popover. It was the first surface in the app to
// answer "why am I seeing this", and the badge that now asks that question
// everywhere was modelled on it -- so it would have been perverse to leave a
// second, near-identical popover sitting next to the general one. It keeps its
// weighted terms, which are richer than anything the generic resolver could
// derive, and hands them over as a resolved Why.

// Two kinds of term since 20260927160000. The first three are the question:
// they decide the score. The last two are who the person is to Krish: they
// adjust it, by up to about a third, and cannot carry someone who does not
// answer the question. They used to be five weights added together, which let
// a warm contact who matched nothing outrank a stranger who was the answer.
const TERMS: Array<{ key: keyof Breakdown; label: string; weight: number; hint: string; adjusts?: true }> = [
  { key: 's_semantic',      label: 'Meaning',      weight: 0.34, hint: 'How close their profile reads to what you asked for' },
  { key: 's_lexical',       label: 'Keywords',     weight: 0.16, hint: 'Literal terms matched, including past roles and skills, weighted by how much of the query they cover' },
  { key: 's_constraint',    label: 'Constraints',  weight: 0.22, hint: 'Share of the filters they meet. Partial credit, never pass/fail' },
  { key: 's_relationship',  label: 'Relationship', weight: 0.18, hint: 'Tier, warmth, whether they have replied, how many sources know them', adjusts: true },
  { key: 's_actionability', label: 'Actionable',   weight: 0.10, hint: 'Reachable, and how much is actually known about them', adjusts: true },
]

const clamp01 = (v: unknown) => Math.max(0, Math.min(1, Number(v ?? 0)))

/** The question term carrying the most is the honest one-line answer to "why is
 *  this one here". Relationship never headlines, because it cannot put anyone
 *  here on its own. */
function headlineFor(terms: Breakdown): string {
  if (clamp01(terms.s_semantic) + clamp01(terms.s_lexical) === 0) {
    return 'Ranked on who you know, not on the words you used'
  }
  let best = TERMS[0]
  let bestVal = -1
  for (const t of TERMS) {
    if (t.adjusts) continue
    const weighted = clamp01(terms[t.key]) * t.weight
    if (weighted > bestVal) { bestVal = weighted; best = t }
  }
  return `Mostly ${best.label.toLowerCase()}: ${best.hint.charAt(0).toLowerCase()}${best.hint.slice(1)}`
}

export function ScoreBreakdown({ score, terms, tone = 'default' }: {
  score: number
  terms: Breakdown
  tone?: 'default' | 'weak'
}) {
  const mult = Number(terms.venture_multiplier)
  const why: Why = {
    headline: headlineFor(terms),
    recorded: true,
    score,
    factors: TERMS.map(t => {
      const v = clamp01(terms[t.key])
      return { label: t.label, value: t.adjusts ? `${v.toFixed(2)} adjusts` : `${v.toFixed(2)} x${t.weight}`, strength: v }
    }),
    footnote: [
      'Relationship and actionability move the match by up to a third. They cannot lift someone who does not answer the question.',
      mult !== 1 && Number.isFinite(mult)
        ? `Venture fit multiplier x${mult.toFixed(2)}. Below 1.00 it demotes; it never inflates.`
        : null,
    ].filter(Boolean).join(' '),
  }

  return <WhyBadge why={why} label="person" align="end" tone={tone} />
}
