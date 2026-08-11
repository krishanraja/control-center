import { useCallback, useEffect, useState } from 'react'
import { Loader2, SearchX, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useNetworkSearch, type NetworkResult } from '../../hooks/useNetworkSearch'
import { NetworkSearchBar } from './NetworkSearchBar'
import { NetworkFilters, EMPTY_FILTERS, type FilterState } from './NetworkFilters'
import { VentureRecommender } from './VentureRecommender'
import { NetworkResultRow } from './NetworkResultRow'
import { SkeletonList } from '../shared/Skeleton'

// The Network surface.
//
// Replaces a client-side substring match over `full_name / company / title /
// origin_campaign` on a capped 1,000-row page. That version could not see 449 of
// the 1,449 triaged contacts, let alone the other 8,000 people, and could not
// answer a question that was not a substring of somebody's job title.

export function NetworkTab({ narrow, onOpenPerson }: {
  narrow?: boolean
  onOpenPerson?: (r: NetworkResult) => void
}) {
  const s = useNetworkSearch()
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [lastQuestion, setLastQuestion] = useState('')
  const [recommendation, setRecommendation] = useState<{ venture: string; intent: string } | null>(null)

  const runSearch = useCallback((q: string, f: FilterState) => {
    setLastQuestion(q)
    setRecommendation(null)
    s.search(q, {
      venture: f.venture,
      // Hard mode is the ONLY path here that can return nothing, so it is the
      // only one that sends filters as filters. Soft mode leaves them to the
      // scorer, which trades them off against everything else.
      roles: f.hard ? f.roles : undefined,
      tiers: f.hard ? f.tiers : undefined,
    })
  }, [s])

  // Re-run on filter change, but only once a question exists: firing on the
  // first chip click with no query would search for nothing.
  //
  // The dependency list is the filter VALUES, deliberately, not `filters` or
  // `runSearch`. Depending on the object identity would re-fire on every render
  // that rebuilds it, and depending on runSearch would re-fire whenever the
  // search hook's state changed, i.e. on the response to this very effect.
  const filterKey = `${filters.venture}|${filters.roles.join()}|${filters.tiers.join()}|${filters.hard}`
  useEffect(() => {
    if (!lastQuestion) return
    runSearch(lastQuestion, filters)
  }, [filterKey])

  const onRecommend = (venture: string, intent: string) => {
    setLastQuestion('')
    setRecommendation({ venture, intent })
    s.recommend(venture, intent)
  }

  const hasRun = Boolean(s.restated || s.results.length || s.error)

  return (
    <div className={`flex h-full flex-col overflow-hidden ${narrow ? 'pb-[calc(env(safe-area-inset-bottom,0px)+120px)]' : ''}`}>
      <div className="shrink-0">
        <NetworkSearchBar
          onSearch={q => runSearch(q, filters)}
          onVoice={s.searchByVoice}
          loading={s.loading}
          restated={s.restated}
          transcript={s.transcript}
        />
        <NetworkFilters value={filters} onChange={setFilters} collapsible={narrow} />
        {!hasRun && <VentureRecommender onRecommend={onRecommend} loading={s.loading} active={recommendation} />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {s.error && (
          <Card variant="outline" className="mx-4 mt-3 border-rose-400/25 bg-rose-500/[0.06] p-3">
            <p className="text-[13px] text-rose-200">{s.error}</p>
          </Card>
        )}

        {s.loading && <div className="px-4 pt-3"><SkeletonList rows={6} /></div>}

        {/* Weak is not empty. The scorer still returns the strongest people it
            has; they simply do not answer what was asked. Saying that plainly
            beats an empty state, which would imply the network holds nobody. */}
        {!s.loading && s.weak && s.results.length > 0 && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-card border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2.5">
            <SearchX size={14} className="mt-0.5 shrink-0 text-amber-200" aria-hidden />
            <p className="text-[12.5px] leading-relaxed text-amber-100/85">
              Nothing in your network matches this closely. These are the strongest people you know, ranked by relationship rather than by the question.
            </p>
          </div>
        )}

        {!s.loading && s.degraded.length > 0 && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-card border border-white/[0.08] px-3 py-2 text-[11.5px] text-white/45">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
            <span>Ranked with reduced signal ({s.degraded.join(', ')}). Results are still real, just less precisely ordered.</span>
          </div>
        )}

        {!s.loading && s.results.length > 0 && (
          <div className="mt-3">
            {s.results.map(r => (
              <NetworkResultRow key={r.contact_id} r={r} onOpen={onOpenPerson} weak={s.weak} />
            ))}
          </div>
        )}

        {!s.loading && !s.error && hasRun && s.results.length === 0 && (
          // Reachable only through a hard filter. The copy names the cause,
          // because "no results" with no explanation is the failure this whole
          // feature was built to remove.
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] text-white/60">No one matches every hard filter.</p>
            <button
              type="button"
              onClick={() => setFilters({ ...filters, hard: false })}
              className="mt-2 text-[12px] text-violet-200 underline underline-offset-2"
            >
              Switch back to soft filters
            </button>
          </div>
        )}

        {!hasRun && !s.loading && (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] text-white/45">Ask a question, or pick a venture above.</p>
            <p className="mt-1 text-[12px] text-white/25">10,670 people. Type it how you would say it.</p>
          </div>
        )}
      </div>

      {s.loading && narrow && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
          <span className="surface inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] text-white/70">
            <Loader2 size={12} className="animate-spin" /> Searching
          </span>
        </div>
      )}
    </div>
  )
}
