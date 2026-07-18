import { useEffect, useState } from 'react'
import { Search, ArrowUp, ArrowDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * SEO rank — where the product ranks on Google for its ICP keywords, and the
 * search volume behind each. Rows come from Maya's weekly SEO rank sweep
 * (maya_striking_distance: Serper positions + DataForSEO volume). Priority
 * surfaces the biggest gaps (high volume, not ranking) at the top. Owned-domain
 * ranking only — no personal brand involved.
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

function fmtVolume(v: number | null): string {
  if (v == null) return 'no data'
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k/mo`
  return `${v}/mo`
}

export function SeoRankPanel({ lane }: { lane?: string | null }) {
  const [rows, setRows] = useState<RankRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      let q = supabase
        .from('maya_striking_distance')
        .select('id, product, query, current_position, previous_position, search_volume, priority, last_checked_at')
        .order('priority', { ascending: false })
        .limit(40)
      if (lane) q = q.eq('product', lane)
      const { data, error } = await q
      if (cancelled) return
      if (!error) setRows((data as RankRow[]) || [])
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
        <div className="px-4 py-5 text-center text-[12px] text-white/35">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-5 text-center text-[12px] text-white/35">
          No rank sweep results yet — Maya's weekly SEO rank sweep lands owned
          Google positions and keyword volume here.
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {rows.slice(0, 8).map(r => {
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
                  <span>{fmtVolume(r.search_volume)}</span>
                  <span className="ml-auto text-white/25">priority {r.priority ?? 0}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
