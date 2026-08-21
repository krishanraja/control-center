import { useCallback, useEffect, useState } from 'react'
import { SearchX, AlertTriangle, MapPin } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useNetworkSearch, type NetworkResult } from '../../hooks/useNetworkSearch'
import { NetworkSearchBar } from './NetworkSearchBar'
import { NetworkFilters, EMPTY_FILTERS, type FilterState } from './NetworkFilters'
import { VentureRecommender } from './VentureRecommender'
import { NetworkResultRow } from './NetworkResultRow'
import { NetworkPersonSheet } from './NetworkPersonSheet'
import { SkeletonList } from '../shared/Skeleton'
import { useNetworkGeo, geoLabel } from '../../hooks/useNetworkGeo'
import { Working } from '../shared/Working'
import { AddPersonFromImage } from './AddPersonFromImage'

// The Network surface.
//
// Replaces a client-side substring match over `full_name / company / title /
// origin_campaign` on a capped 1,000-row page. That version could not see 449 of
// the 1,449 triaged contacts, let alone the other 8,000 people, and could not
// answer a question that was not a substring of somebody's job title.

export function NetworkTab({ narrow, onOpenPerson }: {
  narrow?: boolean
  /** Override where a tapped person goes. Unset, which is how both shells mount
   *  this, it opens the person sheet: until now the prop was never passed and a
   *  tap on a result did nothing at all. */
  onOpenPerson?: (r: NetworkResult) => void
}) {
  const s = useNetworkSearch()
  const geoFacets = useNetworkGeo()
  const [person, setPerson] = useState<NetworkResult | null>(null)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [lastQuestion, setLastQuestion] = useState('')
  const [recommendation, setRecommendation] = useState<{ venture: string; intent: string } | null>(null)

  const runSearch = useCallback((q: string, f: FilterState) => {
    setLastQuestion(q)
    setRecommendation(null)
    s.search(q, {
      venture: f.venture,
      // Filters go up in BOTH modes; `mode` says what they mean. They used to be
      // sent only in hard mode, which made every chip inert while the label
      // beneath it said it was ranking matches higher.
      roles: f.roles,
      tiers: f.tiers,
      countries: f.countries,
      mode: f.hard ? 'hard' : 'soft',
    })
  }, [s])

  // Re-run on filter change, but only once a question exists: firing on the
  // first chip click with no query would search for nothing.
  //
  // The dependency list is the filter VALUES, deliberately, not `filters` or
  // `runSearch`. Depending on the object identity would re-fire on every render
  // that rebuilds it, and depending on runSearch would re-fire whenever the
  // search hook's state changed, i.e. on the response to this very effect.
  const filterKey = `${filters.venture}|${filters.roles.join()}|${filters.tiers.join()}|${filters.countries.join()}|${filters.hard}`
  useEffect(() => {
    if (!lastQuestion) return
    runSearch(lastQuestion, filters)
  }, [filterKey])

  const onRecommend = (venture: string, intent: string) => {
    setLastQuestion('')
    setRecommendation({ venture, intent })
    // A recommendation obeys the geography that is on screen. "Who should I talk
    // to for Mindmaker" and "...in the UK" are the same question with a market
    // attached, and a lit chip that the recommender ignored would be a lie.
    s.recommend(venture, intent, {
      countries: filters.countries,
      mode: filters.hard ? 'hard' : 'soft',
    })
  }

  // Clearing puts the tab back to the state it opens in: no query, no results,
  // no filters, examples and the venture picker visible again. `s.reset` also
  // bumps the request sequence, so a search still in flight lands on a stale
  // sequence and is discarded rather than repopulating the list a second later.
  //
  // Filters reset with everything else on purpose. Leaving a tier chip lit over
  // an empty field is the same trap the old surface had: the next query comes
  // back quietly narrowed by something set two questions ago.
  const onClear = useCallback(() => {
    setLastQuestion('')
    setRecommendation(null)
    setFilters(EMPTY_FILTERS)
    setPerson(null)
    s.reset()
  }, [s])

  const hasRun = Boolean(s.restated || s.results.length || s.error)

  // ── The honesty line for geography ────────────────────────────────────────
  //
  // Geography is resolved for well under half the corpus and for about 5% of
  // tier 1, the people who have actually replied. So a country filter is not the
  // clean cut it looks like: it silently drops several thousand people whose
  // location was simply never recorded. Saying the number is the difference
  // between "you know nobody in the UK" and "we do not know where 6,000 of your
  // people are", and only one of those is true.
  const geoNames = s.geo.countries.map(c => geoLabel(c, geoFacets.countries.find(x => x.code === c)?.name))
  const geoLine = geoNames.length
    ? (s.geo.hard
        ? `${geoNames.join(', ')} only.${geoFacets.unknown
            ? ` ${geoFacets.unknown.toLocaleString('en-AU')} people have no location on file and cannot match.`
            : ''}`
        // Measured, not assumed. A soft geo constraint puts the named country
        // first and sinks people known to be elsewhere; what it does NOT do is
        // bury the ones whose location was never recorded, which is most of the
        // network and almost all of tier 1. That distinction is the whole
        // difference between this and the hard filter, so it is what the line
        // says.
        : `Ranked for ${geoNames.join(', ')}, not limited to it. People with no location on file still rank.`)
    : null

  return (
    <div className={`flex h-full flex-col overflow-hidden ${narrow ? 'pb-[calc(env(safe-area-inset-bottom,0px)+120px)]' : ''}`}>
      <div className="shrink-0">
        <NetworkSearchBar
          onSearch={q => runSearch(q, filters)}
          onVoice={audio => s.searchByVoice(audio, {
            countries: filters.countries,
            mode: filters.hard ? 'hard' : 'soft',
          })}
          onClear={onClear}
          loading={s.loading}
          restated={s.restated}
          transcript={s.transcript}
          hasResults={s.results.length > 0 || Boolean(recommendation)}
        />
        <NetworkFilters value={filters} onChange={setFilters} collapsible={narrow} />
        {/* Adding a person lives next to searching for one because they are the
            same job seen from two sides: you search this tab, fail to find
            somebody, and the next thing you want is to put them in. Desktop
            only: on a phone the + create sheet is the one create path, so an
            extra right-aligned button here was chrome the thumb never asked
            for. (Before either existed, the v2 surface was read-only.) */}
        {!narrow && (
          <div className="flex justify-end px-4 pb-1">
            <AddPersonFromImage onAdded={() => { if (lastQuestion) runSearch(lastQuestion, filters) }} />
          </div>
        )}
        {!hasRun && <VentureRecommender onRecommend={onRecommend} loading={s.loading} active={recommendation} />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {s.error && (
          <Card variant="outline" className="mx-4 mt-3 border-rose-400/25 bg-rose-500/[0.06] p-3">
            <p className="text-body text-rose-200">{s.error}</p>
          </Card>
        )}

        {s.loading && (
          <div className="px-4 pt-3">
            <p className="pb-2 text-label text-white/35">Searching 10,670 people.</p>
            <SkeletonList rows={5} />
          </div>
        )}

        {/* Weak is not empty. The scorer still returns the strongest people it
            has; they simply do not answer what was asked. Saying that plainly
            beats an empty state, which would imply the network holds nobody. */}
        {!s.loading && s.weak && s.results.length > 0 && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-card border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2.5">
            <SearchX size={14} className="mt-0.5 shrink-0 text-amber-200" aria-hidden />
            <p className="text-label leading-relaxed text-amber-100/85">
              Nothing in your network matches this closely. These are the strongest people you know, ranked by relationship rather than by the question.
            </p>
          </div>
        )}

        {!s.loading && s.degraded.length > 0 && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-card border border-white/[0.08] px-3 py-2 text-label text-white/45">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
            <span>Ranked with reduced signal ({s.degraded.join(', ')}). Results are still real, just less precisely ordered.</span>
          </div>
        )}

        {!s.loading && hasRun && geoLine && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-card border border-white/[0.08] bg-white/[0.02] px-3 py-2">
            <MapPin size={12} className="mt-0.5 shrink-0 text-white/35" aria-hidden />
            <p className="text-label leading-relaxed text-white/50">{geoLine}</p>
          </div>
        )}

        {!s.loading && s.results.length > 0 && (
          <div className="mt-3">
            {/* The ranked list renders as soon as the scorer answers. The
                per-person reasons arrive in a second request, so this line is
                the honest account of what is still happening rather than a
                spinner over results that are already usable. */}
            {s.explaining && (
              <p className="px-4 pb-2 text-label text-white/35">
                Ranked. Working out why each one matches.
              </p>
            )}
            {s.results.map(r => (
              <NetworkResultRow key={r.contact_id} r={r} onOpen={onOpenPerson || setPerson} weak={s.weak} />
            ))}
          </div>
        )}

        {!s.loading && !s.error && hasRun && s.results.length === 0 && (
          // Reachable only through a hard filter. The copy names the cause,
          // because "no results" with no explanation is the failure this whole
          // feature was built to remove.
          <div className="px-4 py-10 text-center">
            <p className="text-body text-white/60">No one matches every hard filter.</p>
            {filters.countries.length > 0 && geoFacets.unknown > 0 && (
              // Geography is the filter most likely to have caused this and the
              // least likely to mean what it looks like, so it gets named rather
              // than left for the operator to work out.
              <p className="mx-auto mt-1.5 max-w-sm text-label leading-relaxed text-white/40">
                {geoFacets.unknown.toLocaleString('en-AU')} of your {geoFacets.total.toLocaleString('en-AU')} people
                have no location on file, so a country filter cannot reach them.
              </p>
            )}
            <button
              type="button"
              onClick={() => setFilters({ ...filters, hard: false })}
              className="mt-2 text-label text-violet-200 underline underline-offset-2"
            >
              Switch back to soft filters
            </button>
          </div>
        )}

        {!hasRun && !s.loading && (
          <div className="px-4 py-10 text-center">
            <p className="text-body text-white/45">Ask a question, or pick a venture above.</p>
            <p className="mt-1 text-label text-white/25">10,670 people. Type it how you would say it.</p>
          </div>
        )}
      </div>

      {!onOpenPerson && <NetworkPersonSheet person={person} onClose={() => setPerson(null)} />}

      {s.loading && narrow && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
          <span className="surface inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-label text-white/70">
            <Working size={12} /> Searching
          </span>
        </div>
      )}
    </div>
  )
}
