import { useMemo, useState } from 'react'
import { Sparkles } from '@/lib/icons'
import { useContentV2 } from '../../hooks/useContentV2'
import { useRealtimeContentIdeas } from '../../hooks/useRealtimeContentIdeas'
import { LaneRoom } from './LaneRoom'
import { LibraryRoom } from './LibraryRoom'
import { ObligationStrip } from './ObligationStrip'
import { MobileDecisionDeck } from './MobileDecisionDeck'
import { SegmentedNav, type Segment } from '../shared/SegmentedNav'
import { StartFromResearch } from '../content/StartFromResearch'
import { useVideoStudioReviews } from '../../hooks/useVideoStudioReviews'
import { videoEngineEnabled } from '../../lib/videoStudio'
import { publicSeriesLabel } from '../../lib/publicSeries'
import { useContentTriage } from '../../hooks/useContentTriage'
import { BOTTOM_NAV_PAD } from '../mobile/primitives'
import { NextBestActionHero } from '../content/NextBestActionHero'
import { isActiveIdea } from '../../lib/contentEngine'
import { routeIdea } from '../../lib/contentRouting'

// The Content tab, organised around what Mindmaker Live actually publishes.
//
// It used to be four rooms (This Week / Shifts / Feed / Library). "This Week"
// is retired: it promised a weekly horizon the data never kept. 274 of 323
// ideas had no expiry at all, so the room was a fresh-sounding label over
// everything since May. Now that the purge works, obligations no longer need a
// room of their own — they are always visible in a strip above the rooms, which
// is better anyway, since an obligation you have to navigate to is one you can
// forget.
//
// The rooms are the two formats (Krish, 2026-08-06: venture is what I am
// working on, FORMAT is what shape this is, channel is where it goes). Built is
// how a thing was actually built; Paid is how it actually makes money. Shifts
// and the feed live INSIDE a format rather than beside it, so the shift
// detector has a thesis to measure against.
//
// One surface, lane-first. Deliberately NOT two peer modes over one table:
// that is the pattern that produced two goal editors and four focus subsystems.
// The retired triage surface that used to sit behind a build flag is gone; its
// jobs live here now: the phone deck clears the upstream pile, the desk lane
// shows the pieces in flight, and the Library holds the calendar and backburner.
//
// ── Why the desk is one scroller (2026-09-09) ────────────────────────────
//
// It used to be two. An obligation strip pinned at `shrink-0 max-h-[38vh]
// overflow-y-auto`, then the room at `flex-1 min-h-0 overflow-y-auto`, both
// inside a fixed `h-full` column. That allocates space by decree rather than by
// content, so the two halves fight and both lose: five proposals overflowed the
// 38vh cap and the strip guillotined the third one mid-sentence, while the room
// below took the remainder and had nothing to put in it. Neither box could ever
// borrow from the other, so no amount of content made either one right.
//
// The earlier note below this admits the trade honestly: capping the strip was
// a fix for the strip pushing the room off screen. It swapped "room crushed to
// zero" for "strip guillotined AND room starved".
//
// So: one scroller, content-sized, no caps. And the order inverts. The tab used
// to open with the machine asking five questions and Krish's own work nowhere
// on the page. Now the first thing rendered is the one action to take, the room
// is next, and the machine's questions sit at the bottom under "Also waiting",
// because a proposal is something to consult, not an obligation that outranks
// the six pieces sitting in review.

export type RoomId = 'built' | 'paid' | 'library'
/** Mobile adds a Queue view (the decision deck) as a peer of the rooms. */
type ViewId = 'queue' | RoomId

const ROOMS: Array<{ id: RoomId; label: string }> = [
  { id: 'built', label: publicSeriesLabel('built') },
  { id: 'paid', label: publicSeriesLabel('paid') },
  { id: 'library', label: 'Library' },
]

export function ContentV2Tab({ variant }: { variant: 'desktop' | 'mobile' }) {
  const mobile = variant === 'mobile'
  const [room, setRoom] = useState<ViewId>(mobile ? 'queue' : 'built')
  const [starting, setStarting] = useState(false)
  const v2 = useContentV2()
  // Both viewports read the video queue: the phone decides from the deck, the
  // desk from the obligation strip. Desktop used to have no way in at all.
  const videoQueue = useVideoStudioReviews(videoEngineEnabled())
  const { ideas, loading: ideasLoading } = useRealtimeContentIdeas()
  const triage = useContentTriage()
  // The phone deck clears the upstream pile: raw seeds and research, one card
  // at a time. Drafts and gates stay on the desk where they get real attention.
  const upstream = useMemo(
    () => triage.deck.filter(i => i.state === 'seeded' || i.state === 'researching'),
    [triage.deck],
  )

  // Live means live. The badge used to filter only on `library_at`, while every
  // room filtered on `isActiveIdea`, which also drops buried cards. On
  // 2026-09-09 that gap read "Built With AI 4" and "The Money of AI 5" over two
  // empty rooms: all nine were buried drafts. A count you cannot click through
  // to is worse than no count, so both sides use the same predicate now.
  const liveIdeas = useMemo(() => ideas.filter(i => !i.library_at && isActiveIdea(i)), [ideas])

  const counts = useMemo(() => {
    const forLane = (lane: RoomId) => liveIdeas.filter(i => routeOf(i).route === lane).length
    return {
      built: forLane('built'),
      paid: forLane('paid'),
      library: v2.shifts.filter(s => s.status === 'library').length
        + ideas.filter(i => i.library_at).length,
    }
  }, [v2.shifts, ideas, liveIdeas])

  // Mobile leads with the Queue (the finite decision deck), then the three
  // rooms as peers. The deck used to render ABOVE the rooms while claiming
  // h-full, which crushed the rooms' flex-1 panel to exactly 0px: the
  // Built / Paid / Library chips re-rendered a panel nobody could see, so the
  // chips read as dead. Peers, not stacked: one view owns the stage at a time.
  const segments: Array<Segment<ViewId>> = [
    ...(mobile
      ? [{
          id: 'queue' as ViewId,
          label: 'Queue',
            badge: v2.decisions.length + videoQueue.reviews.length + upstream.length ? (
              <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 align-middle text-micro tabular-nums">{v2.decisions.length + videoQueue.reviews.length + upstream.length}</span>
          ) : undefined,
        }]
      : []),
    ...ROOMS.map((r): Segment<ViewId> => {
      const count = counts[r.id]
      return {
        id: r.id,
        label: r.label,
        badge: count ? (
          <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 align-middle text-micro tabular-nums">{count}</span>
        ) : undefined,
      }
    }),
  ]

  const nav = (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <SegmentedNav<ViewId>
            segments={segments}
            value={room}
            onChange={setRoom}
            label="Content views"
            variant="pill"
            testIdPrefix="content-room"
          />
        </div>
        {/* The only way into the engine that starts from something YOU have.
            On a phone this lives in the + create sheet instead of a second
            inline button; the desk keeps the pill. */}
        {!mobile && (
          <button
            type="button"
            onClick={() => setStarting(true)}
            data-testid="content-start-research"
            className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-label font-semibold text-violet-200 hover:bg-violet-500/20"
          >
            <Sparkles size={12} /> Start from research
          </button>
        )}
      </div>
  )

  return (
    <div className="flex flex-col gap-4 min-h-0 h-full">
      {mobile && room === 'queue' ? (
        // The deck is a fixed stage, not a scroller, so the nav clearance is
        // padding on the stage itself: the thumb-zone buttons sit above the
        // fixed BottomNav instead of under it.
        <>
          {nav}
          <div className={`flex-1 min-h-0 flex flex-col ${BOTTOM_NAV_PAD}`}>
            <MobileDecisionDeck
              v2={v2}
              videoReviews={videoQueue.reviews}
              videoLoading={videoQueue.loading}
              videoQueueError={Boolean(videoQueue.error)}
              triage={triage}
              upstream={upstream}
            />
          </div>
        </>
      ) : (
        // ONE scroller for the whole desk. Everything inside is sized by its
        // content: nothing claims a share of the viewport it has not earned.
        <div data-testid="content-room-scroll" className={`flex-1 min-h-0 overflow-y-auto ${mobile ? BOTTOM_NAV_PAD : ''}`}>
          <div className="flex flex-col gap-5 max-w-3xl">
            {/* 1. The action. The hero reads the WHOLE active pile, which is
                what its own docstring always said it did, so it belongs here
                and not inside a lane. Inside a lane it was invisible: every
                live idea on 2026-09-09 was unrouted, so both lanes were empty
                and the one component that hands Krish a button never rendered. */}
            {/* Held back until the pile has actually loaded. The hero concludes
                "You're clear" from an empty array, so during the first fetch it
                rendered that verdict directly above the obligation strip's
                "Checking what needs you" spinner: two contradictory answers to
                the same question, and a false one on top. */}
            {!mobile && !ideasLoading && <NextBestActionHero ideas={liveIdeas} />}

            {/* 2. Anything genuinely broken or already assembled. One line each,
                and nothing at all when there is nothing. */}
            {!mobile && <ObligationStrip v2={v2} videoReviews={videoQueue.reviews} section="urgent" />}

            {/* 3. Navigation, in a stable place under two bounded blocks. */}
            {nav}

            {/* 4. The work. */}
            {room === 'library'
              ? <LibraryRoom v2={v2} ideas={ideas} variant={variant} />
              : <LaneRoom lane={room === 'queue' ? 'built' : room} v2={v2} ideas={ideas} variant={variant} loading={ideasLoading} />}

            {/* 5. The machine's open questions, last, because a proposal is
                something to consult and never outranks a piece in review. */}
            {!mobile && <ObligationStrip v2={v2} videoReviews={videoQueue.reviews} section="proposals" />}
          </div>
        </div>
      )}

      {!mobile && <StartFromResearch open={starting} onClose={() => setStarting(false)} />}
    </div>
  )
}

// Stored lane -> format. Mirrors laneToVenture in api/_finalPass.ts and
// laneToCorpusChannel in api/_content.ts: map legacy values, never reject them.
// Returns null when the lane genuinely does not say.
export function laneOf(lane?: string | null, slot?: string | null): RoomId | null {
  if (!lane) return null
  if (lane === 'publication') {
    if (slot === 'built_with_ai' || slot === 'built') return 'built'
    if (slot === 'money_of_ai' || slot === 'paid') return 'paid'
    return null
  }
  if (lane === 'builder_economy' || lane === 'builder_economy_ig') return 'built'
  if (lane === 'techonomic' || lane === 'mindmake' || lane === 'mymu' || lane === 'makeyourmindup') return 'paid'
  return null
}

/**
 * Where an idea belongs, stored route first and the router only as a fallback.
 *
 * The stored `lane_slot` is a decision somebody made and it always wins. The
 * router fills the silence: on 2026-09-09 every one of 119 live ideas had no
 * slot, so `laneOf` returned null for all of them, both rooms rendered empty,
 * and the entire pile was reachable only from a drawer behind a button.
 *
 * `derived` is returned rather than hidden because a guess that looks like a
 * decision is how a corpus quietly becomes wrong. The surface marks derived
 * cards, and nothing here writes to the row: routing by use is reversible,
 * routing by backfill is not.
 */
export function routeOf(idea: { lane?: string | null; lane_slot?: string | null; idea?: string | null; body?: string | null; meta?: Record<string, unknown> | null }): {
  route: RoomId | null
  derived: boolean
  reason: string | null
} {
  const stored = laneOf(idea.lane, idea.lane_slot)
  if (stored) return { route: stored, derived: false, reason: null }
  const verdict = routeIdea(idea)
  return { route: verdict.route, derived: verdict.route != null, reason: verdict.reason }
}
