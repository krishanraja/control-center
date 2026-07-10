import { useMemo, useState } from 'react'
import { useContentV2 } from '../../hooks/useContentV2'
import { useRealtimeContentIdeas } from '../../hooks/useRealtimeContentIdeas'
import { ThisWeekRoom } from './ThisWeekRoom'
import { ShiftsRoom } from './ShiftsRoom'
import { FeedRoom } from './FeedRoom'
import { LibraryRoom } from './LibraryRoom'
import { MobileDecisionDeck } from './MobileDecisionDeck'

// The four-room Content tab (Content Engine v2, spec §5; mockup set 1).
// This Week is the only room with obligations. Shifts is the long-term memory.
// Feed is read-only ambience. Library is the tap-anytime bank.

export type RoomId = 'week' | 'shifts' | 'feed' | 'library'

const ROOMS: Array<{ id: RoomId; label: string }> = [
  { id: 'week', label: 'This Week' },
  { id: 'shifts', label: 'Shifts' },
  { id: 'feed', label: 'Feed' },
  { id: 'library', label: 'Library' },
]

export function ContentV2Tab({ variant }: { variant: 'desktop' | 'mobile' }) {
  const [room, setRoom] = useState<RoomId>('week')
  const v2 = useContentV2()
  const { ideas } = useRealtimeContentIdeas()

  const counts = useMemo(() => ({
    week: v2.decisions.length,
    shifts: v2.shifts.filter(s => ['proposed', 'active', 'fading'].includes(s.status)).length,
    library: v2.shifts.filter(s => s.status === 'library').length
      + ideas.filter(i => i.library_at).length,
  }), [v2.decisions, v2.shifts, ideas])

  return (
    <div className="flex flex-col gap-4 min-h-0 h-full">
      <nav className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 flex-shrink-0">
        {ROOMS.map(r => {
          const active = room === r.id
          const count = r.id === 'week' ? counts.week : r.id === 'shifts' ? counts.shifts : r.id === 'library' ? counts.library : null
          return (
            <button
              key={r.id}
              onClick={() => setRoom(r.id)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] whitespace-nowrap border transition-colors ${
                active ? 'btn-contrast border-white font-semibold' : 'border-white/10 text-white/65 hover:bg-white/[0.06]'
              }`}
            >
              {r.label}
              {count !== null && count > 0 ? (
                <span className="ml-1.5 text-[10.5px] tabular-nums rounded-full bg-white/10 px-1.5 py-0.5 align-middle">{count}</span>
              ) : null}
            </button>
          )
        })}
      </nav>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {room === 'week' ? (
          variant === 'mobile'
            ? <MobileDecisionDeck v2={v2} />
            : <ThisWeekRoom v2={v2} ideas={ideas} />
        ) : room === 'shifts' ? (
          <ShiftsRoom v2={v2} variant={variant} />
        ) : room === 'feed' ? (
          <FeedRoom ideas={ideas} />
        ) : (
          <LibraryRoom v2={v2} ideas={ideas} />
        )}
      </div>
    </div>
  )
}
