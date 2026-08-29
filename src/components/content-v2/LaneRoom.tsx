import { useMemo } from 'react'
import type { useContentV2 } from '../../hooks/useContentV2'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { ShiftsRoom } from './ShiftsRoom'
import { SurfacedCards } from './SurfacedCards'
import { FeedRoom } from './FeedRoom'
import { laneOf, type RoomId } from './ContentV2Tab'
import { Eyebrow } from '../shared/Eyebrow'

// One format, everything about it in one column.
//
// Shifts used to be a room beside the feed. That made the detector answer one
// unscoped question and then filtered the answer twice. Inside a format it has
// a thesis: Built asks how AI decisions actually get made, Paid asks how AI
// actually gets monetized, and a signal that does not move either is noise.

const COPY: Record<Exclude<RoomId, 'library'>, { title: string; question: string }> = {
  built: {
    title: 'Built',
    question: 'Stories about how things actually get built, including the parts that broke.',
  },
  paid: {
    title: 'Paid',
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

  const { mine, unclassified } = useMemo(() => {
    const live = ideas.filter(i => !i.library_at)
    return {
      mine: live.filter(i => laneOf(i.lane) === lane),
      unclassified: live.filter(i => laneOf(i.lane) === null),
    }
  }, [ideas, lane])

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <header>
        <h2 className="text-ui font-semibold text-white/90">{copy.title}</h2>
        <p className="text-label text-white/50 mt-0.5">{copy.question}</p>
      </header>

      {/* What the engine actually chose this week, above the register it chose
          from. This is the surface the whole rewrite exists to produce, and it
          rendered nowhere until 26 Aug. */}
      <SurfacedCards cards={v2.arcCards} shifts={v2.shifts} lane={lane} />

      <section>
        <h3 className="mb-2"><Eyebrow>Shifts in {copy.title.toLowerCase()}</Eyebrow></h3>
        <ShiftsRoom v2={v2} variant={variant} lane={lane} />
      </section>

      <section>
        <h3 className="mb-2"><Eyebrow>Evidence</Eyebrow></h3>
        <FeedRoom ideas={mine} />
      </section>

      {/* The lane axis is newer than most of the corpus. Cleo | Content Lane
          Sourcing is what assigns a lane, and it was dead from 2026-07-26 to
          2026-08-12, so ideas gathered in between have none. Surfacing them as
          unclassified is the honest move: hiding them would make a full tab
          look empty, and defaulting them into a lane would invent a judgement
          the detector never made. This section disappears on its own as Cleo
          lanes new work. */}
      {unclassified.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5">
            <Eyebrow>Not yet sorted</Eyebrow>
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-micro tabular-nums">
              {unclassified.length}
            </span>
          </h3>
          <p className="text-label text-white/45 mb-2">
            Collected while the sorter was down. These belong in Built or Paid,
            they just have not been sorted yet.
          </p>
          <FeedRoom ideas={unclassified} />
        </section>
      )}
    </div>
  )
}
