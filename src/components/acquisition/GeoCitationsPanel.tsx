import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Globe } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * RETIRED FROM RENDER 2026-08-04: zara_signals has never held a single
 * signal_type='geo-citation' row, so this panel only ever drew its empty state,
 * and growth_geo_probes (the Signals section) is the real GEO surface. Kept on
 * disk in case the Zara sweep is ever wired and this read becomes true again.
 *
 * GEO Citations: is the product showing up in AI answers (ChatGPT,
 * Perplexity, AI Overviews)? Rows come from Zara's weekly geo-citation sweep
 * (zara_signals, signal_type='geo-citation'; raw_data.cited boolean).
 * Zero-marginal-cost visibility channel, no personal brand involved.
 */

interface GeoSignal {
  id: string
  venture: string | null
  description: string | null
  source_url: string | null
  surfaced_at: string | null
  created_at: string
  raw_data: { cited?: boolean; surface?: string; query?: string } | null
}

export function GeoCitationsPanel({ lane }: { lane?: string | null }) {
  const [rows, setRows] = useState<GeoSignal[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      let q = supabase
        .from('zara_signals')
        .select('id, venture, description, source_url, surfaced_at, created_at, raw_data')
        .eq('signal_type', 'geo-citation')
        .order('created_at', { ascending: false })
        .limit(30)
      if (lane) q = q.eq('venture', lane)
      const { data, error } = await q
      if (cancelled) return
      if (!error) setRows((data as GeoSignal[]) || [])
      setLoaded(true)
    }
    load()
    return () => { cancelled = true }
  }, [lane])

  const cited = rows.filter(r => r.raw_data?.cited === true).length

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <Globe size={13} className="text-cyan-400" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
          AI-answer citations
        </h2>
        {rows.length > 0 && (
          <span className="ml-auto text-[10px] tabular-nums">
            <span className={cited > 0 ? 'text-emerald-300' : 'text-white/35'}>{cited}</span>
            <span className="text-white/25"> / {rows.length} cited</span>
          </span>
        )}
      </header>

      {!loaded ? (
        <div className="px-4 py-5 text-center text-[12px] text-white/35">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-5 text-center text-[12px] text-white/35">
          No GEO sweep results yet — activate Zara's weekly geo-citation sweep
          and coverage of AI answers lands here.
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {rows.slice(0, 6).map(r => (
            <div key={r.id} className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.raw_data?.cited ? 'bg-emerald-400' : 'bg-white/20'}`} />
                <span className="text-[12px] text-white/80 truncate">
                  {r.raw_data?.query || r.description || '(query unknown)'}
                </span>
                <span className="ml-auto text-[10px] text-white/25 flex-shrink-0">
                  {r.raw_data?.surface || ''}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-white/30">
                <span className={r.raw_data?.cited ? 'text-emerald-300/80' : ''}>
                  {r.raw_data?.cited ? 'Cited' : 'Not cited'}
                </span>
                {r.venture && <span>· {r.venture}</span>}
                <span className="ml-auto">
                  {formatDistanceToNow(new Date(r.surfaced_at || r.created_at), { addSuffix: true })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
