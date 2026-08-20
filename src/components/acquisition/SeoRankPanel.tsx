import { useEffect, useState } from 'react'
import { Search, ArrowUp, ArrowDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { SkeletonList } from '../shared/Skeleton'
import { useDeferredPending } from '../shared/useDeferredPending'

/**
 * SEO rank: where the product ranks on Google for its ICP keywords, and the
 * search volume behind each. Rows come from Maya's weekly SEO rank sweep
 * (maya_striking_distance: Serper positions + DataForSEO volume). Priority
 * surfaces the biggest gaps (high volume, not ranking) at the top. Owned-domain
 * ranking only, no personal brand involved.
 */

interface RankRow {
  id: string
  product: string
  query: string
  current_position: number | null
  previous_position: number | null
  search_volume: number | null
  priority: number | null
  last_checked_at: string | null
}

/**
 * PostgREST serialises Postgres `numeric` as a JSON string, so position, volume
 * and priority all arrive as text. Left as-is, "10" < "9" is true and the
 * movement arrow points the wrong way. Coerce once, on the way in.
 */
function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normalise(raw: RankRow[]): RankRow[] {
  return raw.map(r => ({
    ...r,
    current_position: num(r.current_position),
    previous_position: num(r.previous_position),
    search_volume: num(r.search_volume),
    priority: num(r.priority),
  }))
}

function fmtVolume(v: number | null): string {
  if (v == null) return 'no data'
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k/mo`
  return `${v}/mo`
}

/**
 * maya_striking_distance.product carries the ACQUISITION lane slug, not the
 * growth product_slug, so this panel keeps its own label map rather than
 * borrowing PRODUCT_LABEL from lib/growth (different key space, different set).
 * On the Signals section the panel runs unfiltered across lanes, so each row has
 * to say which product it belongs to.
 */
const LANE_LABEL: Record<string, string> = {
  mm_ctrl: 'mm-ctrl',
  fractionl_circle: 'Fractionl Circle',
  fractionl_pulse: 'Fractionl Pulse',
  full_time: 'Full Time',
  legibility: 'Legibility',
}

function laneLabel(slug: string): string {
  return LANE_LABEL[slug] || slug.replace(/_/g, ' ')
}

const VISIBLE_ROWS = 8

export function SeoRankPanel({ lane }: { lane?: string | null }) {
  const [rows, setRows] = useState<RankRow[]>([])
  const [loaded, setLoaded] = useState(false)
  // Reserve the rows immediately, shimmer only once the wait has earned it.
  const waiting = useDeferredPending(!loaded)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      // nullsFirst:false matters. Postgres sorts DESC as NULLS FIRST, and only
      // 10 of the 41 rows carry a priority, so without it the panel led with
      // unscored brand-name keywords and buried the actual striking-distance
      // targets. Volume breaks ties so the biggest gaps rise inside a band.
      let q = supabase
        .from('maya_striking_distance')
        .select('id, product, query, current_position, previous_position, search_volume, priority, last_checked_at')
        .order('priority', { ascending: false, nullsFirst: false })
        .order('search_volume', { ascending: false, nullsFirst: false })
        .limit(40)
      if (lane) q = q.eq('product', lane)
      const { data, error } = await q
      if (cancelled) return
      if (!error) setRows(normalise((data as RankRow[]) || []))
      setLoaded(true)
    }
    load()
    return () => { cancelled = true }
  }, [lane])

  const ranking = rows.filter(r => r.current_position != null).length

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <Search size={13} className="text-cyan-400" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
          SEO rank
        </h2>
        {rows.length > 0 && (
          <span className="ml-auto text-[10px] tabular-nums">
            <span className={ranking > 0 ? 'text-emerald-300' : 'text-white/35'}>{ranking}</span>
            <span className="text-white/25"> / {rows.length} ranking</span>
          </span>
        )}
      </header>

      {!loaded ? (
        <SkeletonList rows={4} card={false} quiet={!waiting} />
      ) : rows.length === 0 ? (
        <div className="px-4 py-5 text-center text-[12px] text-white/35">
          No rank sweep results yet — Maya's weekly SEO rank sweep lands owned
          Google positions and keyword volume here.
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {rows.slice(0, VISIBLE_ROWS).map(r => {
            const pos = r.current_position
            const prev = r.previous_position
            const moved = pos != null && prev != null && pos !== prev
            // Lower position number is better, so a drop in number is an improvement.
            const improved = moved && (pos as number) < (prev as number)
            return (
              <div key={r.id} className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pos != null ? 'bg-emerald-400' : 'bg-white/20'}`} />
                  <span className="text-[12px] text-white/80 truncate">{r.query}</span>
                  <span className="ml-auto flex-shrink-0 text-[11px] tabular-nums">
                    {pos != null ? (
                      <span className="text-emerald-300 inline-flex items-center gap-0.5">
                        #{pos}
                        {moved && (improved
                          ? <ArrowUp size={10} className="text-emerald-400" />
                          : <ArrowDown size={10} className="text-amber-400" />)}
                      </span>
                    ) : (
                      <span className="text-white/30">not ranking</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-white/30">
                  <span className="text-white/40">{laneLabel(r.product)}</span>
                  <span>{fmtVolume(r.search_volume)}</span>
                  <span className="ml-auto text-white/25">priority {r.priority ?? 0}</span>
                </div>
              </div>
            )
          })}
          {rows.length > VISIBLE_ROWS && (
            <p className="px-4 py-2 text-[10px] text-white/25">
              {rows.length - VISIBLE_ROWS} more keywords in the sweep, below these on priority.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
