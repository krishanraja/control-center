/**
 * Age helpers shared by every pipeline / blocker / queue surface.
 *
 * Two flavours because the codebase already has two — `ageLabel` operates on
 * a pre-computed day count, `humanAge` operates on an ISO timestamp and
 * resolves to hour granularity for fresh items. Pipeline lanes use both:
 * card-level age is `humanAge(updated_at)`, rollup age is `ageDays(iso)`.
 */

export function ageDays(iso?: string | null): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return null
  return Math.floor(ms / 86_400_000)
}

export function ageLabel(daysOld?: number | null): string {
  if (daysOld === undefined || daysOld === null) return ''
  if (daysOld === 0) return 'today'
  if (daysOld === 1) return '1d'
  return `${daysOld}d`
}

export function humanAge(iso?: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return ''
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

/**
 * Map a task's age to a "freshness" tone. Used by pipeline cards to colour
 * the age badge — older items get warmer / more urgent tones.
 *  fresh  → ≤ 1 day
 *  warm   → 2-6 days
 *  stale  → 7-13 days
 *  rotten → ≥ 14 days
 */
export type AgeTone = 'fresh' | 'warm' | 'stale' | 'rotten'

export function ageTone(daysOld?: number | null): AgeTone {
  if (daysOld === undefined || daysOld === null || daysOld <= 1) return 'fresh'
  if (daysOld < 7) return 'warm'
  if (daysOld < 14) return 'stale'
  return 'rotten'
}

export const AGE_TONE_CLASS: Record<AgeTone, string> = {
  fresh:  'text-white/30',
  warm:   'text-amber-300/70',
  stale:  'text-orange-400/80',
  rotten: 'text-rose-400',
}
