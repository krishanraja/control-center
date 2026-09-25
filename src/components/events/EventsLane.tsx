import { useMemo } from 'react'
import { StatusLane, EmptyLanes } from '../desktop/StatusLane'
import { EventCard } from './EventCard'
import { HomeCityToggle } from './HomeCityToggle'
import { useEvents, type RankedEvent } from '../../hooks/useEvents'
import { cityLabel } from '../../lib/homeCity'
import { relativeTimeOr } from '../../lib/ageHelpers'

/**
 * The attend lane: rooms worth being in, the city he is in first.
 *
 * Grouped by ACTIONABILITY rather than by status, which is the one structural
 * choice worth explaining. Every other board here groups by a workflow status
 * because the question is "where has this got to". For events the question is
 * "can I actually be there", and that is a function of where he is standing this
 * week, not of anything stored on the row.
 *
 * Away cities are a lane, never a filter. Archiving is only ever for the dead;
 * an away-city event is unactionable and becomes live the moment a trip is
 * booked. Hiding it here would rebuild in TypeScript the mistake that destroyed
 * 26 New York rows in SQL.
 */

const LANES: { key: RankedEvent['actionability']; title: string; description: string }[] = [
  { key: 'home', title: 'Where you are', description: 'Rooms you can walk into this month.' },
  { key: 'away, named attendee', title: 'Away, worth the trip', description: 'Someone confirmed in the room makes this one worth the flight.' },
  { key: 'away, bookable', title: 'Away, far enough out to book', description: 'More than three weeks away, so a trip is still cheap to arrange.' },
  { key: 'away, needs a trip', title: 'Away, needs a trip', description: 'Kept because a booked trip makes these live, not because they are ready.' },
]

export function EventsLane({ onOpen }: { onOpen?: (id: string) => void }) {
  const { events, home, city, loading, error, unscoredCount } = useEvents()

  const grouped = useMemo(() => {
    const by = new Map<string, RankedEvent[]>()
    for (const l of LANES) by.set(l.key, [])
    for (const e of events) by.get(e.actionability)?.push(e)
    return by
  }, [events])

  const emptyNames = LANES.filter(l => (grouped.get(l.key) || []).length === 0).map(l => l.title)
  const freshest = events.reduce<string | null>(
    (acc, e) => (!acc || (e.created_at > acc) ? e.created_at : acc),
    null,
  )

  return (
    <div className="space-y-3" data-testid="events-lane">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div data-testid="events-summary" data-home={home.length} data-total={events.length}>
          <p className="text-ui text-ink">
            <span className="font-semibold tabular-nums">{home.length}</span>
            {' '}in {cityLabel(city)}
            {events.length > home.length && (
              <span className="text-ink-faint">
                {' '}· {events.length - home.length} elsewhere
              </span>
            )}
          </p>
          {/* Freshness is stated, not implied. The whole reason this lane was
              rebuilt is that it went fifteen days without a new row and nothing
              on screen said so. */}
          <p className="text-micro text-ink-faint mt-0.5">
            Newest found {relativeTimeOr(freshest, 'never')}
            {unscoredCount > 0 && ` · ${unscoredCount} not judged yet`}
          </p>
        </div>
        <HomeCityToggle />
      </div>

      {loading && events.length === 0 && (
        <p className="text-micro text-ink-muted">Reading the rooms.</p>
      )}

      {/* A failed refresh over rows we already have is STALE, not broken, and the
          two need different words: the reader can still act on what is here. */}
      {error && events.length > 0 && (
        <p className="text-micro text-amber-300">
          These are the last rooms we read. The refresh just failed, so something
          new may be missing.
        </p>
      )}
      {error && events.length === 0 && (
        <p className="text-micro text-rose-300">
          Could not read the lane: {error}
        </p>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="text-ui text-ink">No events with a verified date.</p>
          <p className="text-micro text-ink-muted mt-1 leading-snug">
            A room with an unverified date is never shown here, because a wrong date
            costs you an evening. The nightly sweep looks for new ones.
          </p>
        </div>
      )}

      {LANES.map(l => (
        <StatusLane<RankedEvent>
          key={l.key}
          status={l.key}
          title={l.title}
          description={l.description}
          items={grouped.get(l.key) || []}
          keyOf={e => e.id}
          renderItem={e => <EventCard event={e} onOpen={onOpen} />}
          defaultCollapsed={l.key === 'away, needs a trip'}
        />
      ))}

      {events.length > 0 && emptyNames.length > 0 && <EmptyLanes names={emptyNames} />}
    </div>
  )
}
