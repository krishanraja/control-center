import { useEffect, useMemo, useState } from 'react'
import { Sparkles } from '@/lib/icons'
import { useContentV2 } from '../../hooks/useContentV2'
import { useRealtimeContentIdeas } from '../../hooks/useRealtimeContentIdeas'
import { LaneRoom } from './LaneRoom'
import { LibraryRoom } from './LibraryRoom'
import { SundayList } from './SundayList'
import { DecideCard } from './DecideCard'
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
import { SUBCHANNELS, resolveFormat } from '../../lib/formats'
import { routeIdea } from '../../lib/contentRouting'
import { ladderVerdict } from '../../lib/ladder'
import { useMediaQuery } from '../shared/motion'

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

/** A live venture_formats slug, or the Library.
 *
 *  Until 2026-09-20 this was `'built' | 'paid' | 'library'`, hardcoded, and the
 *  rooms were labelled from the retired wordmarks. The publication was ruled to
 *  three subchannels on 2026-09-17 and the dashboard still opened on "Built
 *  With AI" and "The Money of AI" three days later, because the four lists that
 *  moved to src/lib/formats.ts were the ones the machine WRITES with and this
 *  is the one Krish READS. The taxonomy guard went green over it, because it
 *  reads four files and this was not one of them. Both are fixed. */
export type RoomId = string
/** Mobile adds a Queue view (the decision deck) as a peer of the rooms. */
type ViewId = 'queue' | RoomId

const ROOMS: Array<{ id: RoomId; label: string }> = [
  // Decide leads, because it is the work. The subchannel rooms are browsing:
  // the router assigns a subchannel now, which makes it an attribute rather
  // than a destination, and organising the tab by destination meant visiting
  // three places to answer one question.
  { id: 'decide', label: 'To decide' },
  ...SUBCHANNELS.map(f => ({ id: f.slug, label: f.label })),
  // Before the Library, because this is work and the Library is reference.
  // Named for what it holds rather than when it is read: "Sunday" is when
  // Krish looks at it, which is not something a nav label should assert on
  // his behalf.
  { id: 'weak', label: 'Not lifted' },
  { id: 'library', label: 'Library' },
]
const ROOM_SLUGS = SUBCHANNELS.map(f => f.slug)

export function ContentV2Tab({ variant }: { variant: 'desktop' | 'mobile' }) {
  const mobile = variant === 'mobile'
  // Same 1400px threshold Home and Focus use. Picked in JS, not with a
  // `min-[1400px]:hidden` pair, so the obligation strips exist once in the DOM
  // rather than twice under the same test ids.
  const wideDesk = useMediaQuery('(min-width: 1400px)') && !mobile
  // A stage needs height as well as width. 760px is the shortest viewport that
  // fits the chrome (hero, tabs, series header, the folds) plus two idea cards
  // with the sidebar's own rail beside it; under that, paging to one card at a
  // time is worse than letting the page scroll, so it scrolls.
  const tallEnough = useMediaQuery('(min-height: 760px)')
  const deskStage = wideDesk && tallEnough
  const [room, setRoom] = useState<ViewId>(mobile ? 'queue' : 'decide')
  // Whether Krish has picked a room himself. Until he has, the landing room is
  // the machine's guess and may be corrected once the counts arrive; after he
  // has, it is a decision and nothing moves it.
  const [roomPicked, setRoomPicked] = useState(false)
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

  // ── The decide queue ───────────────────────────────────────────────────
  //
  // What the ladder escalated: judged, not weak, not already ready. Those are
  // the pieces it tried to lift and could not finish without him, which is the
  // only pile that genuinely needs a human.
  //
  // `settled` is a local list of ids he has just decided, held because the
  // decision is recorded in content_edit_events and the idea row itself does
  // not change in the same tick. Without it the card he just settled would be
  // handed straight back to him, which reads as the press having failed.
  const [settled, setSettled] = useState<string[]>([])
  const toDecide = useMemo(() => {
    const seen = new Set(settled)
    return ideas
      .filter(i => !seen.has(i.id) && !i.buried_at && !i.library_at)
      .map(i => ({ row: i, v: ladderVerdict(i) }))
      .filter(({ v }) => v?.band === 'repairable')
      .sort((a, b) => (b.v!.score ?? 0) - (a.v!.score ?? 0))
      .map(({ row }) => row)
  }, [ideas, settled])

  // Live means live. The badge used to filter only on `library_at`, while every
  // room filtered on `isActiveIdea`, which also drops buried cards. On
  // 2026-09-09 that gap read "Built With AI 4" and "The Money of AI 5" over two
  // empty rooms: all nine were buried drafts. A count you cannot click through
  // to is worse than no count, so both sides use the same predicate now.
  const liveIdeas = useMemo(() => ideas.filter(i => !i.library_at && isActiveIdea(i)), [ideas])

  const counts = useMemo(() => {
    const forLane = (lane: RoomId) => liveIdeas.filter(i => routeOf(i).route === lane).length
    const perRoom: Record<string, number> = {}
    for (const slug of ROOM_SLUGS) perRoom[slug] = forLane(slug)
    perRoom.library = v2.shifts.filter(s => s.status === 'library').length
      + ideas.filter(i => i.library_at).length
    perRoom.decide = toDecide.length
    // Counted from the same predicate the room renders, for the reason the
    // 2026-09-09 note below records: a badge reading 4 over an empty room is
    // worse than no badge.
    perRoom.weak = ideas.filter(i => !i.buried_at && ladderVerdict(i)?.band === 'weak').length
    return perRoom
  }, [v2.shifts, ideas, liveIdeas, toDecide])

  // Land on a room that has work in it.
  //
  // ROOM_SLUGS is in venture_formats sort order, so the tab opens on the hero
  // format. mind.the.gap is the hero and deliberately has no routing rules,
  // because it is a shape rather than a vocabulary and the router would only be
  // guessing. The result on 2026-09-20 was a tab that opened on 2 cards with
  // dozens sitting in the two rooms beside it.
  //
  // Only ever runs before Krish has touched the switcher, and only when the
  // room he would land on is genuinely empty, so a deliberate visit to a quiet
  // room is never overridden. Ruling (Krish, 2026-09-20).
  useEffect(() => {
    if (roomPicked || mobile) return
    if (ideasLoading) return
    if (counts[room as string]) return
    const firstWithWork = ROOM_SLUGS.find(slug => counts[slug])
    if (firstWithWork && firstWithWork !== room) setRoom(firstWithWork)
  }, [counts, room, roomPicked, mobile, ideasLoading])

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
            onChange={next => { setRoomPicked(true); setRoom(next) }}
            label="Content views"
            variant="pill"
            testIdPrefix="content-room"
            // Seven rooms wrapped to five rows on a 360px phone once the
            // subchannels took their final names on 2026-09-25: the tabs took
            // 251px of a 640px screen and pushed the queue's last button 34px
            // under the bottom nav. Narrower chips in label type wrap to four
            // rows (199px) with every name in full; the names are final and
            // are never shortened. The phone shell renders at 1.2x, so 37px
            // lands at 44px, the touch-target floor.
            className={mobile ? '[&>button]:py-1 [&>button]:min-h-[37px] [&>button]:px-2.5 [&>button]:text-label' : undefined}
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
        // A desk is a stage, not a scroller (Krish, 2026-09-17: "i want a no
        // scroll experience"). Above the desk breakpoint nothing here scrolls:
        // the chrome is fixed, the room in the middle takes what is left, and
        // the work inside it is paged to the height it was actually given.
        //
        // Below that breakpoint — a narrow desktop window, or a phone — it is
        // still one scroller, because a 900px-tall stage with a 320px column
        // in it is a worse answer than scrolling. `deskStage` is the switch.
        <div
          data-testid="content-room-scroll"
          className={deskStage
            ? 'flex-1 min-h-0 overflow-hidden'
            : `flex-1 min-h-0 overflow-y-auto ${mobile ? BOTTOM_NAV_PAD : ''}`}
        >
          {/* Above 1400px the two obligation strips move into a rail beside the
              work instead of sitting above and below it. Measured 2026-09-17:
              the desk column is capped at 768px, which left 912px unused at
              1920 while the proposals strip sat below the whole pile, off the
              bottom of the screen on any real queue.

              The ordering rule it shipped with still holds — a proposal is
              something to consult and never outranks a piece in review — and
              the rail states it more clearly than the stack did. Subordinate is
              a narrow column at the side, read after the work; it was never the
              same thing as "further down". */}
          <div className={wideDesk ? `flex gap-8 ${deskStage ? 'h-full min-h-0 items-stretch' : 'items-start'}` : ''}>
            {/* No max width on a stage. The 768px cap is a reading measure,
                right for a scrolling column of prose and wrong here: at 1920
                it left 535px of empty desk beside a 320px rail, which is the
                hole the layout probe now fails on. The cards inside pick a
                column count from the width they are handed. */}
            <div className={`flex flex-col gap-5 ${wideDesk ? 'min-w-0 flex-1' : 'max-w-3xl'} ${deskStage ? 'min-h-0' : 'max-w-3xl'}`}>
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
              {!mobile && !ideasLoading && (
                <div className={deskStage ? 'shrink-0' : undefined}><NextBestActionHero ideas={liveIdeas} /></div>
              )}

              {/* 2. Anything genuinely broken or already assembled. One line each,
                  and nothing at all when there is nothing. Stacked only; on a
                  wide desk it is in the rail, rendered once. */}
              {!mobile && !wideDesk && <ObligationStrip v2={v2} videoReviews={videoQueue.reviews} section="urgent" />}

              {/* 3. Navigation, in a stable place under two bounded blocks. */}
              {deskStage ? <div className="shrink-0">{nav}</div> : nav}

              {/* 4. The work. */}
              {/* The Library is a reference surface — a calendar and a
                  backburner — and it is read by browsing, so it keeps its own
                  scroll even on a stage. Paging a calendar would be silly. */}
              {room === 'decide'
                ? (
                  <div className={deskStage ? 'min-h-0 flex-1' : undefined} data-testid="decide-room">
                    {toDecide.length ? (
                      <DecideCard
                        key={toDecide[0]!.id}
                        idea={toDecide[0]!}
                        variant={variant}
                        onSettled={() => setSettled(s => [...s, toDecide[0]!.id])}
                      />
                    ) : (
                      <div className="py-10 text-center">
                        <p className="text-body text-ink-muted">Nothing waiting on you.</p>
                        <p className="mt-1 text-label text-ink-faint">Everything judged is either ready to write or on the Not lifted list.</p>
                      </div>
                    )}
                  </div>
                )
                : room === 'weak'
                ? (
                  <div className={deskStage ? 'min-h-0 flex-1 overflow-y-auto' : undefined}>
                    <SundayList ideas={ideas} variant={variant} />
                  </div>
                )
                : room === 'library'
                ? (
                  <div className={deskStage ? 'min-h-0 flex-1 overflow-y-auto' : undefined}>
                    <LibraryRoom v2={v2} ideas={ideas} variant={variant} />
                  </div>
                )
                : (
                  <div className={deskStage ? 'flex min-h-0 flex-1 flex-col' : undefined}>
                    {/* 'queue' is a mobile view, not a room, and the mobile
                        branch above already owns it, so this fallback is only
                        reached if that ever stops being true. It used to read
                        'built', a slug retired on 2026-09-17 that survives
                        only as a read-side alias, so the fallback resolved to
                        under.the.hood: the 0.5-a-week standing format rather
                        than the hero. ROOM_SLUGS is in venture_formats sort
                        order, so [0] is whatever the hero is today. */}
                    <LaneRoom lane={room === 'queue' ? (ROOM_SLUGS[0] ?? 'general') : room} v2={v2} ideas={ideas} variant={variant} loading={ideasLoading} fit={deskStage} />
                  </div>
                )}

              {/* 5. The machine's open questions, last. In the rail on a wide desk. */}
              {!mobile && !wideDesk && <ObligationStrip v2={v2} videoReviews={videoQueue.reviews} section="proposals" />}
            </div>

            {!mobile && wideDesk && (
              <aside data-testid="content-rail" className={`w-[320px] shrink-0 flex flex-col gap-4 ${deskStage ? 'min-h-0 overflow-hidden' : ''}`}>
                <ObligationStrip v2={v2} videoReviews={videoQueue.reviews} section="urgent" dense />
                <ObligationStrip v2={v2} videoReviews={videoQueue.reviews} section="proposals" dense />
              </aside>
            )}
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
  // The slot is the format when there is one. resolveFormat carries the whole
  // rename ledger, so `built_with_ai`, `built`, `money_of_ai` and `paid` all
  // land on their live subchannel without a second alias map living here.
  if (lane === 'publication') {
    const f = resolveFormat(slot)
    return f && f.kind === 'subchannel' ? f.slug : null
  }
  // A retired VENTURE name in the lane column, from before lane carried the
  // venture and slot carried the format. These resolve through the same ledger;
  // anything landing on the holding lane is not a room.
  const viaLane = resolveFormat(lane)
  return viaLane && viaLane.kind === 'subchannel' ? viaLane.slug : null
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
