import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import type { ScoreBreakdown as Breakdown } from '../../hooks/useNetworkSearch'

// The score, and why it is that number.
//
// A ranked list whose ordering cannot be interrogated is a list you either
// trust blindly or ignore. Five bars is the whole explanation: which signal put
// this person here, and which one is carrying nothing.

const TERMS: Array<{ key: keyof Breakdown; label: string; weight: number; hint: string }> = [
  { key: 's_semantic',      label: 'Meaning',      weight: 0.34, hint: 'How close their profile reads to what you asked for' },
  { key: 's_lexical',       label: 'Keywords',     weight: 0.16, hint: 'Literal terms matched, weighted by how much of the query they cover' },
  { key: 's_constraint',    label: 'Constraints',  weight: 0.22, hint: 'Share of the filters they meet. Partial credit, never pass/fail' },
  { key: 's_relationship',  label: 'Relationship', weight: 0.18, hint: 'Tier, warmth, whether they have replied, how many sources know them' },
  { key: 's_actionability', label: 'Actionable',   weight: 0.10, hint: 'Reachable, and how much is actually known about them' },
]

export function ScoreBreakdown({ score, terms, tone = 'default' }: {
  score: number
  terms: Breakdown
  tone?: 'default' | 'weak'
}) {
  const ring = tone === 'weak' ? 'border-white/12 text-white/45' : score >= 75
    ? 'border-violet-400/45 text-violet-100'
    : score >= 50 ? 'border-white/20 text-white/85' : 'border-white/12 text-white/55'

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Match score ${Math.round(score)} of 100. Open the breakdown.`}
        className={`shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full border text-[13px] font-semibold tabular-nums transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${ring}`}
      >
        {Math.round(score)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Why this rank</span>
          <span className="text-[13px] font-semibold tabular-nums text-white">{score.toFixed(1)}</span>
        </div>
        <div className="space-y-2">
          {TERMS.map(t => {
            const v = Math.max(0, Math.min(1, Number(terms[t.key] ?? 0)))
            return (
              <div key={t.key} title={t.hint}>
                <div className="flex items-baseline justify-between text-[11px]">
                  <span className="text-white/70">{t.label}</span>
                  <span className="tabular-nums text-white/40">
                    {v.toFixed(2)} <span className="text-white/25">x{t.weight}</span>
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className="h-full rounded-full bg-violet-400/70 transition-[width] duration-300 ease-out-soft"
                    style={{ width: `${v * 100}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        {terms.venture_multiplier !== 1 && (
          <p className="mt-2.5 border-t border-white/[0.07] pt-2 text-[11px] text-white/45">
            Venture fit multiplier <span className="tabular-nums text-white/70">x{Number(terms.venture_multiplier).toFixed(2)}</span>.
            Below 1.00 it demotes; it never inflates.
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
