// The pilot layer's day boundary. Delegates entirely to src/lib/civilDate.ts,
// which is now the single clock for the whole product.
//
// This file used to hardcode America/New_York while the focus spine hardcoded
// Europe/London and daily_focus used UTC. Three clocks meant the same morning
// could be three different days depending on which surface you asked. The zone
// is now one user setting; change it in the nav and every boundary moves.

import { civilHour, civilYmd, shiftYmd, dayStartUtc, dayEndUtc, daysBetween, getZone } from './civilDate'

/** The hour after which the evening shutdown auto-prompts, in the active zone. */
export const SHUTDOWN_HOUR = 17

/** @deprecated Read the live setting with getZone(); this is only its current value. */
export const PILOT_TZ = getZone()

export function pilotYmd(now: Date = new Date()): string {
  return civilYmd(now)
}

export function pilotHour(now: Date = new Date()): number {
  return civilHour(now)
}

/** True once the operator is past the shutdown hour on his own clock. */
export function isAfterShutdownHour(now: Date = new Date()): boolean {
  return civilHour(now) >= SHUTDOWN_HOUR
}

export function pilotYesterdayYmd(now: Date = new Date()): string {
  return shiftYmd(civilYmd(now), -1)
}

export function pilotTomorrowYmd(now: Date = new Date()): string {
  return shiftYmd(civilYmd(now), 1)
}

export { shiftYmd, dayStartUtc as pilotDayStartUtc, dayEndUtc as pilotDayEndUtc, daysBetween as pilotDaysBetween }
