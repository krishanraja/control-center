import type { IndustryRow, Quadrant } from "../types";

/**
 * Industry momentum. Compound the daily `averageChange` values returned by
 * `historical-industry-performance`:
 *
 *   r1m   = product over the last 21 rows of (1 + averageChange/100) - 1
 *   r3m   = product over the last 63 rows
 *   accel = r1m - (r3m / 3)   -- is the recent pace faster than the 3-month pace
 *
 * Quadrant: direction decides the row, and acceleration alone never counts as a
 * rise. An earlier pass let a bounce qualify as "rising, still cheap" while the
 * industry was ranked 122 of 123 and down 55.7% over three months.
 */

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  early: "Rising, still cheap",
  crowded: "Rising, already dear",
  turning: "Falling, pace easing",
  avoid: "Falling, no let up",
};

export const QUADRANT_NOTE: Record<Quadrant, string> = {
  early: "Up over three months and cheaper than most. This is where the work pays.",
  crowded: "Up over three months but priced above most. The easy part has gone.",
  turning: "Still down over three months, but the recent pace is faster than the trend.",
  avoid: "Down over three months with no sign of the pace easing.",
};

export function compoundChange(series: number[], rows: number): number {
  const window = series.slice(-rows);
  if (!window.length) return 0;
  return (window.reduce((carry, change) => carry * (1 + change / 100), 1) - 1) * 100;
}

export function momentum(series: number[]): { r1m: number; r3m: number; accel: number } {
  const r1m = compoundChange(series, 21);
  const r3m = compoundChange(series, 63);
  return { r1m, r3m, accel: r1m - r3m / 3 };
}

/**
 * Percentile of one P/E among all industries carrying a usable P/E.
 * Industries outside 0 < pe < 200 are excluded rather than clamped.
 */
export function peRank(pe: number | null, allPes: Array<number | null>): number | null {
  if (pe == null || !(pe > 0 && pe < 200)) return null;
  const usable = allPes.filter((value): value is number => value != null && value > 0 && value < 200).sort((a, b) => a - b);
  if (!usable.length) return null;
  const below = usable.filter((value) => value < pe).length;
  return Math.round((below / usable.length) * 100);
}

/**
 * `cheap` requires an actual rank. Guarding the null matters: `null < 50` is
 * true in JavaScript, which would file every industry with no P/E under
 * "rising, still cheap". Five industries in the current run have no rank.
 */
export function quadrantOf(input: { r3m: number; peRank: number | null; accel: number }): Quadrant {
  const up = input.r3m > 0;
  const cheap = input.peRank != null && input.peRank < 50;
  const turning = input.accel > 5;
  if (up) return cheap ? "early" : "crowded";
  return turning ? "turning" : "avoid";
}

export function quadrantCounts(rows: IndustryRow[]): Record<Quadrant, number> {
  const counts: Record<Quadrant, number> = { early: 0, crowded: 0, turning: 0, avoid: 0 };
  for (const row of rows) counts[row.quadrant] += 1;
  return counts;
}

export function byQuadrant(rows: IndustryRow[], quadrant: Quadrant): IndustryRow[] {
  return rows
    .filter((row) => row.quadrant === quadrant)
    .sort((a, b) => b.r3m - a.r3m);
}
