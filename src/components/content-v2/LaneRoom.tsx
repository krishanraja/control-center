import { useMemo, useState } from 'react'
import { Layers } from '@/lib/icons'
import type { useContentV2 } from '../../hooks/useContentV2'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { ShiftsRoom } from './ShiftsRoom'
import { SurfacedCards } from './SurfacedCards'
import { laneOf, type RoomId } from './ContentV2Tab'
import { Eyebrow } from '../shared/Eyebrow'
import { SeriesIdentity } from '../shared/MindmakeIdentity'
import { publicSeriesIdentity } from '../../lib/publicSeries'
import { EditorialOpportunityList } from './EditorialOpportunityList'
import { NextBestActionHero } from '../content/NextBestActionHero'
import { InProgress } from './InProgress'
import { SupplyDrawer } from './SupplyDrawer'
import { isActiveIdea } from '../../lib/contentEngine'

// One format, everything about it in one column, in the order you act on it.
//
//   1. Next: the one thing to do now, with its button.
//   2. Ideas ready to shape: what the editorial radar judged worth a look.
//   3. In progress: the pieces already moving, by state.
//   4. Also here: what the engine surfaced this week and the shifts it tracks,
//      folded shut until you want them. They are context, not obligations.
//   5. Supply: the seed rail, the feed and the unsorted pile, in a drawer.
//
// Shifts used to be a room beside the feed. Inside a format they have a thesis:
// Built asks how things actually get built, Paid asks how they actually make
// money, and a signal that moves neither is noise.

const COPY: Record<Exclude<RoomId, 'library'>, { question: string }> = {
  built: {
    question: 'Stories about how things actually get built, including the parts that broke.',
  },
  paid: {
    question: 'Stories about how things actually make money: who pays, and for what.',
  },
}

export function LaneRoom({
  lane, v2, ideas, variant,
}: {
  lane: Exclude<RoomId, 'library'>
  v2: ReturnType<typeof useContentV2>
  ideas: ContentIdeaRow[]
  variant: 'desktop' | 'mobile'
}) {
  const copy = COPY[lane]
  const series = publicSeriesIdentity(lane)
  const mobile = variant === 'mobile'
  const [supplyOpen, setSupplyOpen] = useState(false)

  const { mine, active, unclassified } = useMemo(() => {
    const live = ideas.filter(i => !i.library_at)
    const mine = live.filter(i => laneOf(i.lane, i.lane_slot) === lane)
    return {
      mine,
      active: mine.filter(isActiveIdea),
      unclassified: live.filter(i => laneOf(i.lane, i.lane_slot) === null),
    }
  }, [ideas, lane])

  const surfacedCount = useMemo(() => {
    const laneOfShift = new Map(v2.shifts.map(s => [s.id, s.lane]))
    return v2.arcCards.filter(c => c.surfaced && (laneOfShift.get(c.shift_id) ?? null) === lane).length
  }, [v2.arcCards, v2.shifts, lane])
  const shiftCount = useMemo(
    () => v2.shifts.filter(s => s.lane === lane || s.lane == null).filter(s => !['retired', 'library'].includes(s.status)).length,
    [v2.shifts, lane],
  )

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2>
            <SeriesIdentity series={lane} />
          </h2>
          <p className="text-label text-white/50 mt-0.5">{copy.question}</p>
        </div>
        {!mobile && (
          <button
            type="button"
            onClick={() => setSupplyOpen(true)}
            data-testid={`content-supply-${lane}`}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-label font-semibold text-white/70 hover:bg-white/[0.07] hover:text-white/90"
          >
            <Layers size={12} /> Supply
          </button>
        )}
      </header>

      {/* The one action that comes to you, so you never scan a list to decide. */}
      {active.length > 0 && <NextBestActionHero ideas={active} narrow={mobile} />}

      <EditorialOpportunityList ideas={ideas} seriesKey={lane} />

      <InProgress ideas={active} testIdPrefix={`content-${lane}`} />

      {/* Context, folded shut. What the engine chose this week and the register
          it chose from. Neither needs you; both are worth a look on a slow day. */}
      <details className="group rounded-xl border border-white/[0.06] bg-white/[0.01]" data-testid={`content-also-here-${lane}`}>
        <summary className="flex cursor-pointer list-none items-baseline gap-2 px-3 py-2.5">
          <Eyebrow>Also here</Eyebrow>
          <span className="text-micro text-white/40 tabular-nums">
            {surfacedCount} surfaced this week, {shiftCount} shift{shiftCount === 1 ? '' : 's'} tracked
          </span>
          <span className="ml-auto text-micro text-white/35 group-open:hidden">Show</span>
          <span className="ml-auto hidden text-micro text-white/35 group-open:inline">Hide</span>
        </summary>
        <div className="flex flex-col gap-5 px-3 pb-3">
          <SurfacedCards cards={v2.arcCards} shifts={v2.shifts} lane={lane} />
          <section>
            <h3 className="mb-2"><Eyebrow>Shifts for {series.label}</Eyebrow></h3>
            <ShiftsRoom v2={v2} variant={variant} lane={lane} />
          </section>
        </div>
      </details>

      {!mobile && (
        <SupplyDrawer open={supplyOpen} onClose={() => setSupplyOpen(false)} mine={mine} unclassified={unclassified} />
      )}
    </div>
  )
}
