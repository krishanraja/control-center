import { SegmentedNav } from '../shared/SegmentedNav'
import { CITIES, useHomeCity, type HomeCity } from '../../lib/homeCity'

/**
 * Which city the attend lane is filtered to.
 *
 * On shared/SegmentedNav with a testIdPrefix, per the house rule: a spec must
 * never have to click a word, or the next copy change takes the suite out.
 *
 * Sydney carries a dot, because it is temporary and fires on a button press only
 * (architecture doc §3). It is a real choice and never a resting state: nothing
 * scheduled sources for it, and no cold start falls back to it.
 */
export function HomeCityToggle({ className }: { className?: string }) {
  const { city, setCity, inferred } = useHomeCity()

  const segments = CITIES.map(c => ({
    id: c.id,
    label: c.label,
    badge: c.temporary ? <span aria-hidden className="text-ink-faint">·</span> : undefined,
  }))

  return (
    <div className={className}>
      <SegmentedNav<HomeCity>
        segments={segments}
        value={city}
        onChange={setCity}
        label="Which city you are in"
        variant="pill"
        testIdPrefix="events-city"
      />
      {inferred && (
        // Said out loud rather than assumed. The city was guessed from the
        // timezone because he has never chosen one, and a guessed filter that
        // looks chosen is how the old lane got away with being wrong.
        <p className="text-micro text-ink-faint mt-1.5">
          Guessed from your timezone. Pick one to make it stick.
        </p>
      )}
    </div>
  )
}
