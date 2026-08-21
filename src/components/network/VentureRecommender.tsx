import { useState } from 'react'
import { Sparkles, ArrowRight } from 'lucide-react'
import { Eyebrow } from '../shared/Eyebrow'
import { VENTURES } from './NetworkFilters'

// "Who should I talk to for Mindmaker" — the push mode, next to the pull mode.
//
// Same scorer as search. The venture drives the multiplier and the intent
// becomes a soft role constraint, so someone with no role recorded but a 90
// venture fit still surfaces.
//
// Two rows, not a cross-product. The first version rendered every
// venture-and-intent pair as its own chip: four ventures times five intents is
// twenty chips, which on a 390px screen pushed the whole results list off the
// bottom and read as a wall. Nine chips and one verb say the same thing.

const INTENTS: Array<[string, string]> = [
  ['buyer', 'to sell to'],
  ['partner', 'to partner with'],
  ['introducer', 'for an intro'],
  ['guest', 'for the podcast'],
  ['investor', 'to raise from'],
]

function Chip({ on, onClick, testId, children }: {
  on: boolean
  onClick: () => void
  testId?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      data-testid={testId}
      className={`min-h-[30px] rounded-full border px-2.5 text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
        on ? 'border-violet-400/40 bg-violet-500/15 text-violet-100'
           : 'border-white/10 text-white/50 hover:border-white/20 hover:text-white/80'}`}
    >
      {children}
    </button>
  )
}

export function VentureRecommender({ onRecommend, loading, active }: {
  onRecommend: (venture: string, intent: string) => void
  loading: boolean
  active: { venture: string; intent: string } | null
}) {
  const [venture, setVenture] = useState<string | null>(active?.venture ?? null)
  const [intent, setIntent] = useState<string>(active?.intent ?? 'buyer')

  return (
    <div className="border-t border-white/[0.06] px-4 py-3" data-testid="network-recommender">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles size={12} className="text-violet-300/70" aria-hidden />
        <Eyebrow>Or let it pick</Eyebrow>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {VENTURES.map(([slug, label]) => (
          <Chip
            key={slug}
            testId={`network-recommend-venture-${slug}`}
            on={venture === slug}
            onClick={() => setVenture(venture === slug ? null : slug)}
          >
            {label}
          </Chip>
        ))}
      </div>

      {venture && (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {INTENTS.map(([id, verb]) => (
              <Chip key={id} testId={`network-recommend-intent-${id}`} on={intent === id} onClick={() => setIntent(id)}>
                {verb}
              </Chip>
            ))}
          </div>
          <button
            type="button"
            disabled={loading}
            data-testid="network-recommend-go"
            onClick={() => onRecommend(venture, intent)}
            className="aurora-btn mt-2.5 inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3.5 text-label font-semibold transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
          >
            Show me who
            <ArrowRight size={12} aria-hidden />
          </button>
        </>
      )}
    </div>
  )
}
