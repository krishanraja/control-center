/**
 * The weekly clear-out's clock, in one place for the browser and the server.
 *
 * The content engine's purge runs on a cron at Monday 14:00 UTC
 * (`/api/purge/run`, docs/architecture/09-scheduling.md) and hard-deletes
 * news pieces whose `expires_at` has passed by then. The feed ingest stamps
 * `expires_at` with the same boundary, so a piece ingested this week expires
 * at exactly next Monday 14:00 UTC.
 *
 * The Content tab's "Clears out Monday" badge used to count to the END of
 * Monday instead, so a piece expiring Monday afternoon or evening was labelled
 * as clearing out that Monday while the purge actually took it a week later.
 * Both sides now read this file (api/_weeks.ts re-exports `purgeBoundary`), so
 * the label and the purge cannot drift apart again.
 */

const DAY_MS = 86_400_000

/** Monday, as `Date.getUTCDay()` counts it. */
export const PURGE_WEEKDAY_UTC = 1
/** The hour the purge cron fires, UTC. */
export const PURGE_HOUR_UTC = 14

/** Midnight UTC of the Monday that starts the ISO week containing `d`. */
function mondayOf(d: Date): number {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const day = new Date(t).getUTCDay() || 7
  return t - (day - 1) * DAY_MS
}

/**
 * The purge boundary: the Monday 14:00 UTC that ends the ISO week containing
 * `d`. This is what the feed ingest stamps on `expires_at`. On a Monday it is
 * NEXT Monday, so a piece ingested on a Monday morning is not stamped to expire
 * the same afternoon.
 */
export function purgeBoundary(d: Date = new Date()): Date {
  return new Date(mondayOf(d) + 7 * DAY_MS + PURGE_HOUR_UTC * 3_600_000)
}

/**
 * When the next purge runs, seen from `now`: the first Monday 14:00 UTC
 * strictly after `now`. On a Monday before 14:00 that is today; from 14:00 on
 * it is the Monday after.
 */
export function nextPurgeRun(now: Date | number = new Date()): Date {
  const at = typeof now === 'number' ? now : now.getTime()
  const thisWeek = mondayOf(new Date(at)) + PURGE_HOUR_UTC * 3_600_000
  return new Date(thisWeek > at ? thisWeek : thisWeek + 7 * DAY_MS)
}

/**
 * Whether the next purge removes a piece with this `expires_at`, if nobody
 * picks or keeps it. The purge deletes rows whose expiry has passed when it
 * runs, and it runs at or just after 14:00:00, so an expiry of exactly Monday
 * 14:00 UTC (the ingest's own stamp) goes in that run, and one a minute later
 * waits a week.
 */
export function clearsAtNextPurge(expiresAt: string | null | undefined, now: Date | number = new Date()): boolean {
  if (!expiresAt) return false
  const t = Date.parse(expiresAt)
  return Number.isFinite(t) && t <= nextPurgeRun(now).getTime()
}
