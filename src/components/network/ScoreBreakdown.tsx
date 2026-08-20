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

const TERMS: Array<{ key: keyof Breakdown; label: string; weight: number; hint: string }> = [
  { key: 's_semantic',      label: 'Meaning',      weight: 0.34, hint: 'How close their profile reads to what you asked for' },
  { key: 's_lexical',       label: 'Keywords',     weight: 0.16, hint: 'Literal terms matched, weighted by how much of the query they cover' },
  { key: 's_constraint',    label: 'Constraints',  weight: 0.22, hint: 'Share of the filters they meet. Partial credit, never pass/fail' },
  { key: 's_relationship',  label: 'Relationship', weight: 0.18, hint: 'Tier, warmth, whether they have replied, how many sources know them' },
  { key: 's_actionability', label: 'Actionable',   weight: 0.10, hint: 'Reachable, and how much is actually known about them' },
]

/** The dominant term is the honest one-line answer to "why is this one here". */
function headlineFor(terms: Breakdown): string {
  let best = TERMS[0]
  let bestVal = -1
  for (const t of TERMS) {
    const weighted = Math.max(0, Math.min(1, Number(terms[t.key] ?? 0))) * t.weight
    if (weighted > bestVal) { bestVal = weighted; best = t }
  }
  if (bestVal <= 0) return 'Ranked, but no signal is carrying this one'
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
      const v = Math.max(0, Math.min(1, Number(terms[t.key] ?? 0)))
      return { label: t.label, value: `${v.toFixed(2)} x${t.weight}`, strength: v }
    }),
    footnote: mult !== 1 && Number.isFinite(mult)
      ? `Venture fit multiplier x${mult.toFixed(2)}. Below 1.00 it demotes; it never inflates.`
      : null,
  }

  return <WhyBadge why={why} label="person" align="end" tone={tone} />
}
