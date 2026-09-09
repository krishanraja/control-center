import { useMemo, useState } from 'react'
import { Layers } from '@/lib/icons'
import type { useContentV2 } from '../../hooks/useContentV2'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { ShiftsRoom } from './ShiftsRoom'
import { SurfacedCards } from './SurfacedCards'
import { routeOf, type RoomId } from './ContentV2Tab'
import { Eyebrow } from '../shared/Eyebrow'
import { SeriesIdentity } from '../shared/MindmakeIdentity'
import { publicSeriesIdentity } from '../../lib/publicSeries'
import { EditorialOpportunityList } from './EditorialOpportunityList'
import { InProgress } from './InProgress'
import { SupplyDrawer } from './SupplyDrawer'
import { isActiveIdea } from '../../lib/contentEngine'
import { shiftIsOnBeat } from '../../lib/contentV2'

// One format, everything about it in one column, in the order you act on it.
//
//   1. Ideas ready to shape: what the editorial radar judged worth a look.
//   2. In progress: the pieces already moving, by state.
//   3. Also here: what the engine surfaced this week and the shifts it tracks,
//      folded shut until you want them. They are context, not obligations.
//   4. Supply: the seed rail, the feed and the unsorted pile, in a drawer.
//
// "Do this next" used to lead this list and has moved up to the tab, because it
// reads the whole active pile rather than one lane's. Inside a lane it was
// dead weight that never rendered: on 2026-09-09 every live idea was unrouted,
// so both lanes were empty and the one component that hands Krish a button to
// press never appeared on the page at all.
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
  lane, v2, ideas, variant, loading,
}: {
  lane: Exclude<RoomId, 'library'>
  v2: ReturnType<typeof useContentV2>
  ideas: ContentIdeaRow[]
  variant: 'desktop' | 'mobile'
  /** True while the idea pile is still being fetched. An empty-state that
   *  renders during the first load states something false and then corrects
   *  itself, which reads as a broken screen rather than a loading one. */
  loading?: boolean
}) {
  const copy = COPY[lane]
  const series = publicSeriesIdentity(lane)
  const mobile = variant === 'mobile'
  const [supplyOpen, setSupplyOpen] = useState(false)

  const { mine, active, derived, unclassified } = useMemo(() => {
    const live = ideas.filter(i => !i.library_at)
    const mine = live.filter(i => routeOf(i).route === lane)
    const active = mine.filter(isActiveIdea)
    return {
      mine,
      active,
      derived: active.filter(i => routeOf(i).derived).length,
      // Still unrouted after the router had its say: the ones it refused by
      // name and the ones it honestly could not call. Both belong in Supply,
      // neither belongs in a format room.
      unclassified: live.filter(i => routeOf(i).route === null),
    }
  }, [ideas, lane])

  const surfacedCount = useMemo(() => {
    const laneOfShift = new Map(v2.shifts.map(s => [s.id, s.lane]))
    return v2.arcCards.filter(c => c.surfaced && (laneOfShift.get(c.shift_id) ?? null) === lane).length
  }, [v2.arcCards, v2.shifts, lane])
  // On-beat only, and lane-scoped. This line used to read "31 shifts tracked"
  // by counting every non-retired arc including the ones filed under the
  // retired governance / security / proof vocabulary, and by counting every
  // unlaned arc in BOTH rooms. A number Krish cannot reconcile with what the
  // room shows him is worse than no number.
  const shiftCount = useMemo(
    () => v2.shifts
      .filter(shiftIsOnBeat)
      .filter(s => s.lane === lane || s.lane == null)
      .filter(s => !['retired', 'library'].includes(s.status)).length,
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
          {/* Say when a card is here because the router guessed, not because
              anyone decided. Silence here is how a guess hardens into a fact. */}
          {derived > 0 && (
            <p className="text-micro text-white/40 mt-1 tabular-nums" data-testid={`content-derived-${lane}`}>
              {derived} of {active.length} sorted here by topic, not by a decision you made. Open one to settle it.
            </p>
          )}
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

      <EditorialOpportunityList ideas={ideas} seriesKey={lane} />

      <InProgress ideas={active} testIdPrefix={`content-${lane}`} />

      {/* An empty format is a real state and it needs to say WHY it is empty and
          what to do about it. It used to render the series banner, two silent
          nulls and a folded disclosure, which is how the room came to be a
          screen of nothing under a logo. The distinction that matters: nothing
          routed here is a different problem from nothing anywhere, and on
          2026-09-09 it was the first one, with 104 live ideas carrying no
          lane_slot and reachable only from a drawer behind a button. */}
      {active.length === 0 && !loading && (
        <div
          className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-4"
          data-testid={`content-lane-empty-${lane}`}
        >
          <p className="text-body text-white/70">
            Nothing is routed to {series.label} yet.
          </p>
          {unclassified.length > 0 ? (
            <>
              <p className="text-label text-white/45 mt-1 leading-relaxed">
                {unclassified.length} live idea{unclassified.length === 1 ? '' : 's'} {unclassified.length === 1 ? 'is' : 'are'} waiting
                for a format. Until one is routed, this room has nothing to show
                and the count above it is honest at zero.
              </p>
              {!mobile && (
                <button
                  type="button"
                  onClick={() => setSupplyOpen(true)}
                  data-testid={`content-lane-empty-supply-${lane}`}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-label font-semibold text-white/80 hover:bg-white/[0.08]"
                >
                  <Layers size={12} /> Sort the {unclassified.length} unrouted
                </button>
              )}
            </>
          ) : (
            <p className="text-label text-white/45 mt-1 leading-relaxed">
              Nothing is in flight anywhere either. Start from something you
              already have rather than waiting for the Friday sweep.
            </p>
          )}
        </div>
      )}

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
