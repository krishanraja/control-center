// Capacity: the one derived number that lets the dashboard adapt to the operator.
//
// The pilot layer already reads energy and anxiety every morning and then threw
// almost all of it away, deciding only red or green. That left no intermediate
// state between "one action" and "the full board": the focus spine asked for
// three targets identically on a sharp day and a depleted one.
//
// Capacity collapses the five-bucket reading in pilotStoic.ts into three levels
// and everything downstream keys off it. It may only ever REDUCE what the screen
// demands. It must never add a prompt, imply falling behind, or introduce a
// shame register, per the non-negotiables in docs/PILOT-LAYER.md.

import { bucketFor } from './pilotStoic'

export type Capacity = 'low' | 'steady' | 'high'

export interface CapacityProfile {
  level: Capacity
  /**
   * Whether the OS is allowed to demand a decision at the weekly altitude
   * today. The daily altitude always stays available, because one commitment
   * is the floor, not a demand.
   *
   * Note there is deliberately NO `targets` field any more. Today is always
   * exactly 3 slots — the daily_focus schema, the completion RPC, and the
   * calibrate route all hardcode 3, and a capacity-varied count is what shipped
   * the "Pick your 2" lock that the 3-only API rejected with a 400. Capacity
   * reduces what the screen DEMANDS, never the shape of the day's commitment.
   */
  allowsHigherAltitudeDemand: boolean
}

const PROFILES: Record<Capacity, CapacityProfile> = {
  low:    { level: 'low',    allowsHigherAltitudeDemand: false },
  steady: { level: 'steady', allowsHigherAltitudeDemand: true },
  high:   { level: 'high',   allowsHigherAltitudeDemand: true },
}

/**
 * Map a morning reading onto a capacity level. Reuses bucketFor so there is one
 * state model, not two.
 */
export function capacityFor(energy: number | null, anxiety: number | null): Capacity {
  if (energy === null || anxiety === null) return 'steady'
  switch (bucketFor(energy, anxiety)) {
    case 'depleted_anxious':
    case 'depleted_calm':
      return 'low'
    case 'strong_calm':
      return 'high'
    // A charged but noisy day has the energy but not the clarity, so it gets the
    // steady profile rather than the full board. High capacity is earned by
    // being clear, not merely by being awake.
    case 'strong_anxious':
    default:
      return 'steady'
  }
}

export function profileFor(level: Capacity): CapacityProfile {
  return PROFILES[level]
}

/** The fail-open default, used whenever state is missing or unreachable. */
export const DEFAULT_CAPACITY: Capacity = 'steady'

// ── Intent ranking ───────────────────────────────────────────────────────────

/**
 * Which nomination kinds each day-intent favours. Marcus tags every entry in
 * home_intelligence.top_three with a kind; observed values are revenue, growth
 * and risk, and unknown kinds simply fall through to leverage order.
 */
export const INTENT_KINDS: Record<string, string[]> = {
  content:  ['content', 'growth'],
  outreach: ['growth'],
  money:    ['revenue'],
  growth:   ['growth'],
  build:    ['product', 'risk'],
  clear:    ['risk'],
  // An ask day favours the same nominations as chasing money and growth:
  // requests are how both start.
  ask:      ['revenue', 'growth'],
}

interface Rankable {
  kind?: string
  leverage_score?: number | null
}

/**
 * Order a nomination pool for today's intent: entries whose kind matches the
 * intent first, then by leverage descending. Stable for equal ranks, so an
 * unmatched intent leaves the incoming order essentially intact.
 *
 * This lets a strong day pull an alternate above a default pick when the
 * alternate is what today is actually for.
 */
export function rankByIntent<T extends Rankable>(pool: T[], intent: string | null | undefined): T[] {
  const favoured = intent ? INTENT_KINDS[intent] : undefined
  const score = (x: T): number => {
    const matches = favoured && x.kind ? favoured.includes(x.kind) : false
    const leverage = typeof x.leverage_score === 'number' ? x.leverage_score : 0
    // Matching the intent is worth more than any leverage gap, so a matched
    // alternate outranks an unmatched primary.
    return (matches ? 1000 : 0) + leverage
  }
  return pool
    .map((item, i) => ({ item, i }))
    .sort((a, b) => score(b.item) - score(a.item) || a.i - b.i)
    .map(x => x.item)
}

// ── Flag ─────────────────────────────────────────────────────────────────────

/**
 * Gates the capacity layer: the morning reading shaping how much the dashboard
 * asks of the operator, the ambient fold, and the visual temperature. Build-time
 * Vite var, default OFF so today's Home stays the fallback until dogfooded. Flip
 * VITE_PILOT_CAPACITY_ENABLED=true in Vercel + redeploy to roll out. Mirrors the
 * VITE_FOCUS_RITUAL_ENABLED pattern in homeV2.ts.
 */
export function isCapacityEnabled(): boolean {
  return import.meta.env.VITE_PILOT_CAPACITY_ENABLED === 'true'
}
