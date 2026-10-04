import { Search, ArrowUp, ArrowDown } from '@/lib/icons'
import { SkeletonList } from '../shared/Skeleton'
import { useDeferredPending } from '../shared/useDeferredPending'
import { useSeoRank } from '../../hooks/useSeoRank'
import { ventureLabel } from '../../lib/ventureOptions'

/**
 * SEO rank: where the product ranks on Google for its ICP keywords, and the
 * search volume behind each. Rows come from Maya's weekly SEO rank sweep
 * (maya_striking_distance: Serper positions + DataForSEO volume). Priority
 * surfaces the biggest gaps (high volume, not ranking) at the top. Owned-domain
 * ranking only, no personal brand involved.
 *
 * Read through GET /api/growth/seo-rank (useSeoRank), never the anon client:
 * the table has RLS on and no policy, so the anon read returned zero rows and
 * this panel said "no results" over 74 real ones. The route coerces the
 * numbers (PostgREST sends numeric as text, and "10" < "9" turned the movement
 * arrow the wrong way), keeps the newest check per keyword, and sorts priority
 * first (unscored last), then volume. Names come from ventureLabel, which
 * already resolves the lane slugs this table is keyed on, so there is no
 * private label map here any more.
 */

function fmtVolume(v: number | null): string {
  if (v == null) return 'no data'
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k/mo`
  return `${v}/mo`
}

const VISIBLE_ROWS = 8

export function SeoRankPanel({ lane }: { lane?: string | null }) {
  const { rows, loaded, error } = useSeoRank(lane)
  // Reserve the rows immediately, shimmer only once the wait has earned it.
  const waiting = useDeferredPending(!loaded)

  const ranking = rows.filter(r => r.position != null).length

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <Search size={13} className="text-cyan-400" />
        <h2 className="text-micro font-semibold uppercase tracking-[0.14em] text-ink-faint">
          SEO rank
        </h2>
        {rows.length > 0 && (
          <span className="ml-auto text-micro tabular-nums">
            <span className={ranking > 0 ? 'text-emerald-300' : 'text-ink-faint'}>{ranking}</span>
            <span className="text-ink-faint/50"> / {rows.length} ranking</span>
          </span>
        )}
      </header>

      {!loaded ? (
        <SkeletonList rows={4} card={false} quiet={!waiting} />
      ) : rows.length === 0 ? (
        <div className="px-4 py-5 text-center text-label text-ink-faint">
          {error
            ? 'Could not read the Google rank check. Try again in a minute.'
            : "No rank sweep results yet. Maya's weekly SEO rank sweep lands owned Google positions and keyword volume here."}
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {rows.slice(0, VISIBLE_ROWS).map(r => {
            const pos = r.position
            const prev = r.previous_position
            const moved = pos != null && prev != null && pos !== prev
            // Lower position number is better, so a drop in number is an improvement.
            const improved = moved && (pos as number) < (prev as number)
            return (
              <div key={r.id} className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pos != null ? 'bg-emerald-400' : 'bg-white/20'}`} />
                  <span className="text-label text-ink-muted truncate">{r.keyword}</span>
                  <span className="ml-auto flex-shrink-0 text-micro tabular-nums">
                    {pos != null ? (
                      <span className="text-emerald-300 inline-flex items-center gap-0.5">
                        #{pos}
                        {moved && (improved
                          ? <ArrowUp size={10} className="text-emerald-400" />
                          : <ArrowDown size={10} className="text-amber-400" />)}
                      </span>
                    ) : (
                      <span className="text-ink-faint">not ranking</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-micro text-ink-faint">
                  <span className="text-ink-faint">{ventureLabel(r.product)}</span>
                  <span>{fmtVolume(r.monthly_searches)}</span>
                  <span className="ml-auto text-ink-faint/50">priority {r.priority ?? 0}</span>
                </div>
              </div>
            )
          })}
          {rows.length > VISIBLE_ROWS && (
            <p className="px-4 py-2 text-micro text-ink-faint/50">
              {rows.length - VISIBLE_ROWS} more keywords in the sweep, below these on priority.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
