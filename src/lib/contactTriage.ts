import type { ContactRow } from '../hooks/useRealtimeContacts'

// ─── Relationship Engine triage rules ─────────────────────────────────────────
//
// One place for "should this contact be handled 1-by-1 as a warm lead?" so the
// desktop and mobile Leads surfaces stay in lockstep.
//
// The load-bearing rule (Krish, 2026-06-02): anyone already engaged through
// Signal & Noise (a past or scheduled podcast guest) is "warm to me" by default,
// but that relationship warmth is NOT a reason to surface them as a lead. They
// should only reach the 1-by-1 warm queue if they ALSO score highly for a
// different reason — a strong fit for another venture. Otherwise they drop to
// the general review feed, where they can still be found but don't jump the line.

/** Heat/tier threshold that, on its own, marks a contact "warm" enough to handle personally. */
export const WARM_HEAT_FLOOR = 75

/** Minimum fit score (for a venture OTHER than the one they were engaged through) that
 *  re-qualifies an already-engaged contact for the warm queue. */
export const FOREIGN_FIT_FLOOR = 70

/** Highest per-venture fit score the contact has for any venture other than `exclude`. */
export function maxForeignFit(c: ContactRow, exclude: string | null | undefined): number {
  const fs = c.fit_scores || {}
  let max = 0
  for (const [venture, raw] of Object.entries(fs)) {
    if (venture === exclude) continue
    const n = Number(raw)
    if (Number.isFinite(n) && n > max) max = n
  }
  return max
}

/**
 * Whether a contact belongs in the "Handle 1-by-1" warm queue.
 *
 * Base test: warm/customer tier, or heat ≥ WARM_HEAT_FLOOR.
 * Suppression: if their warmth comes from an already-engaged Signal & Noise
 * relationship and they don't clear FOREIGN_FIT_FLOOR for another venture, they
 * are demoted out of the warm queue (the "warm to me ≠ a lead" rule).
 */
export function isHandQueue(c: ContactRow): boolean {
  const baseWarm =
    c.consent_tier === 'warm' ||
    c.consent_tier === 'customer' ||
    (c.heat_score ?? 0) >= WARM_HEAT_FLOOR
  if (!baseWarm) return false

  if (c.origin_venture === 'signal_noise' && maxForeignFit(c, 'signal_noise') < FOREIGN_FIT_FLOOR) {
    return false
  }
  return true
}
