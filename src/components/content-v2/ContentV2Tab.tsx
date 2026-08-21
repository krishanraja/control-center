import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useContentV2 } from '../../hooks/useContentV2'
import { useRealtimeContentIdeas } from '../../hooks/useRealtimeContentIdeas'
import { LaneRoom } from './LaneRoom'
import { LibraryRoom } from './LibraryRoom'
import { ObligationStrip } from './ObligationStrip'
import { MobileDecisionDeck } from './MobileDecisionDeck'
import { SegmentedNav, type Segment } from '../shared/SegmentedNav'
import { StartFromResearch } from '../content/StartFromResearch'

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

export type RoomId = 'built' | 'paid' | 'library'
/** Mobile adds a Queue view (the decision deck) as a peer of the rooms. */
type ViewId = 'queue' | RoomId

const ROOMS: Array<{ id: RoomId; label: string }> = [
  { id: 'built', label: 'Built' },
  { id: 'paid', label: 'Paid' },
  { id: 'library', label: 'Library' },
]

export function ContentV2Tab({ variant }: { variant: 'desktop' | 'mobile' }) {
  const mobile = variant === 'mobile'
  const [room, setRoom] = useState<ViewId>(mobile ? 'queue' : 'built')
  const [starting, setStarting] = useState(false)
  const v2 = useContentV2()
  const { ideas } = useRealtimeContentIdeas()

  const counts = useMemo(() => {
    const live = ideas.filter(i => !i.library_at)
    const forLane = (lane: RoomId) => live.filter(i => laneOf(i.lane) === lane).length
    return {
      built: forLane('built'),
      paid: forLane('paid'),
      library: v2.shifts.filter(s => s.status === 'library').length
        + ideas.filter(i => i.library_at).length,
    }
  }, [v2.shifts, ideas])

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
          badge: v2.decisions.length ? (
            <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 align-middle text-micro tabular-nums">{v2.decisions.length}</span>
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

  return (
    <div className="flex flex-col gap-4 min-h-0 h-full">
      {/* Obligations on desktop stay above the rooms, because they are
          cross-format and must not be reachable only by navigating to them. */}
      {!mobile && <ObligationStrip v2={v2} />}

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

      {mobile && room === 'queue' ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <MobileDecisionDeck v2={v2} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {room === 'library'
            ? <LibraryRoom v2={v2} ideas={ideas} />
            : <LaneRoom lane={room === 'queue' ? 'built' : room} v2={v2} ideas={ideas} variant={variant} />}
        </div>
      )}

      {!mobile && <StartFromResearch open={starting} onClose={() => setStarting(false)} />}
    </div>
  )
}

// Stored lane -> format. Mirrors laneToVenture in api/_finalPass.ts and
// laneToCorpusChannel in api/_content.ts: map legacy values, never reject them.
// Returns null when the lane genuinely does not say, which the rooms surface as
// unclassified rather than guessing.
export function laneOf(lane?: string | null): RoomId | null {
  if (!lane) return null
  if (lane === 'builder_economy' || lane === 'builder_economy_ig') return 'built'
  if (lane === 'techonomic') return 'paid'
  return null
}
