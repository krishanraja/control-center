import { Sparkles } from 'lucide-react'
import { VENTURES } from './NetworkFilters'

// "Who should I talk to for Mindmaker" — the push mode, next to the pull mode.
//
// Same scorer as search. The venture drives the multiplier and the intent
// becomes a soft role constraint, so someone with no role recorded but a 90
// venture fit still surfaces.

const INTENTS: Array<[string, string]> = [
  ['buyer', 'to sell to'],
  ['partner', 'to partner with'],
  ['introducer', 'for an intro'],
  ['guest', 'for the podcast'],
  ['investor', 'to raise from'],
]

export function VentureRecommender({ onRecommend, loading, active }: {
  onRecommend: (venture: string, intent: string) => void
  loading: boolean
  active: { venture: string; intent: string } | null
}) {
  return (
    <div className="border-t border-white/[0.06] px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles size={12} className="text-violet-300/70" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
          Or let it pick
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {VENTURES.map(([slug, label]) =>
          INTENTS.map(([intent, verb]) => {
            const on = active?.venture === slug && active?.intent === intent
            return (
              <button
                key={`${slug}:${intent}`}
                type="button"
                disabled={loading}
                onClick={() => onRecommend(slug, intent)}
                className={`min-h-[30px] rounded-full border px-2.5 text-[11.5px] transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
                  on ? 'border-violet-400/40 bg-violet-500/15 text-violet-100'
                     : 'border-white/10 text-white/45 hover:border-white/20 hover:text-white/80'}`}
              >
                <span className="font-semibold">{label}</span>
                <span className="text-white/35"> {verb}</span>
              </button>
            )
          }),
        )}
      </div>
    </div>
  )
}
