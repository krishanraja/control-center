import React, { useMemo, useState } from 'react'
import { useGrowth } from '../../hooks/useGrowth'
import { BATCH_MAX, mondayOf } from '../../lib/growth'
import { TouchpointMap } from './TouchpointMap'
import { CreativeBoard } from './CreativeBoard'
import { CouncilFeed } from './CouncilFeed'
import { GeoProbes } from './GeoProbes'

/**
 * The Growth map tab: the strategy layer under the Growth acquisition deck.
 *
 * Four sections over one spine: the touchpoint map is the spine (where the ICP
 * already is), the creative board is what gets made for it, the council is the
 * weekly kill or double-down call, and the GEO probes are the evidence that the
 * answer engines have noticed us. The `acquisition` tab stays the execution
 * deck (lanes, send approvals, autonomy ladder); this is where the map that
 * feeds it gets kept honest.
 *
 * Same shape as the Content tab: a pill nav over one scrolling body, sections
 * are code-split with the tab, reads come from Supabase on the anon key and
 * every write goes through /api/growth/*.
 */

export type GrowthSectionId = 'map' | 'creative' | 'council' | 'geo'

const SECTIONS: Array<{ id: GrowthSectionId; label: string }> = [
  { id: 'map', label: 'Touchpoint map' },
  { id: 'creative', label: 'Creative' },
  { id: 'council', label: 'Council' },
  { id: 'geo', label: 'GEO' },
]

export function GrowthTab({ variant }: { variant: 'desktop' | 'mobile' }) {
  const [section, setSection] = useState<GrowthSectionId>('map')
  const g = useGrowth()

  const counts = useMemo(() => {
    const week = mondayOf(new Date())
    return {
      map: g.touchpoints.filter(t => t.assumption_flag).length,
      creative: g.cards.filter(c => c.stage !== 'dropped' && c.batch_week === week).length,
      council: g.reviews.filter(r => !r.krish_decision).length,
      geo: g.probes.length,
    }
  }, [g.touchpoints, g.cards, g.reviews, g.probes])

  const overCap = counts.creative > BATCH_MAX

  return (
    <div className="flex flex-col gap-3 min-h-0 h-full">
      <div className="flex-shrink-0">
        <h1 className="text-xl md:text-2xl xl:text-[26px] font-semibold text-white tracking-tight">Growth map</h1>
        <p className="text-xs md:text-[13px] text-white/50 mt-0.5">
          {g.loading
            ? 'Reading the map...'
            : `${g.touchpoints.length} touchpoints mapped · ${counts.map} open questions · ${counts.creative} in this week's batch · ${counts.council} council calls waiting`}
        </p>
        {g.error && <p className="text-[11.5px] text-rose-300 mt-1">Could not read growth data: {g.error}</p>}
      </div>

      <nav className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 flex-shrink-0">
        {SECTIONS.map(s => {
          const active = section === s.id
          const count = counts[s.id]
          const alarm = s.id === 'creative' && overCap
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] whitespace-nowrap border transition-colors ${
                active ? 'btn-contrast border-white font-semibold' : 'border-white/10 text-white/65 hover:bg-white/[0.06]'
              }`}
            >
              {s.label}
              {count > 0 ? (
                <span className={`ml-1.5 text-[10.5px] tabular-nums rounded-full px-1.5 py-0.5 align-middle ${
                  alarm ? 'bg-rose-500/25 text-rose-200' : 'bg-white/10'
                }`}>
                  {count}
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {section === 'map' ? (
          <TouchpointMap g={g} variant={variant} />
        ) : section === 'creative' ? (
          <CreativeBoard g={g} variant={variant} />
        ) : section === 'council' ? (
          <CouncilFeed g={g} />
        ) : (
          <GeoProbes g={g} />
        )}
      </div>
    </div>
  )
}
