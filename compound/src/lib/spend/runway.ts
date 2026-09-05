import { usdRound } from "./format";
import type { SpendItem } from "./schema";
import { countable, signedUsd } from "./summarise";

/**
 * The one honest money line. Cash on hand is what the member typed in;
 * burn is what went out over the last ninety days divided by three; runway
 * is the first divided by the second. Only priced rows that are not
 * superseded count, the same rule as every total on the tab. Rows the
 * pipeline marked hidden never reach the browser, and rows with no price are
 * left out here as they are everywhere else. Refunds come off.
 */

export const RUNWAY_WINDOW_DAYS = 90;

export interface RunwayFacts {
  asOf: string;
  amountUsd: number;
  burn: number;
  months: number | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function daysBefore(iso: string, days: number): string {
  const value = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

/** What goes out in a normal month, from the ninety days ending on `asOf`. Never below zero. */
export function monthlyBurn(items: SpendItem[], asOf: string): number {
  const since = daysBefore(asOf, RUNWAY_WINDOW_DAYS);
  const day = asOf.slice(0, 10);
  let total = 0;
  for (const item of items) {
    if (!countable(item)) continue;
    if (item.occurredOn <= since || item.occurredOn > day) continue;
    total += signedUsd(item);
  }
  return Math.max(0, round2(total / 3));
}

/** How many months the cash would last. Null when nothing goes out, because dividing by zero is not an answer. */
export function runwayMonths(balanceUsd: number, burnPerMonth: number): number | null {
  if (!Number.isFinite(balanceUsd) || !Number.isFinite(burnPerMonth) || burnPerMonth <= 0) return null;
  return balanceUsd / burnPerMonth;
}

/** Under ten months one decimal matters; above it a whole number is honest enough. */
export function monthsLabel(months: number): string {
  if (months < 10) return (Math.round(months * 10) / 10).toFixed(1);
  return Math.round(months).toLocaleString("en-US");
}

/** "2026-09-03" reads as "3 September". The year is left off; the line is about now. */
export function dayMonth(iso: string): string {
  const parsed = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

export const RUNWAY_EMPTY = "No cash balance entered yet. Add one in Settings.";

export function runwaySentence(facts: RunwayFacts): string {
  const cash = `Cash on hand ${usdRound(facts.amountUsd)} as of ${dayMonth(facts.asOf)}.`;
  if (facts.months == null) {
    return `${cash} Nothing priced went out in the last three months, so there is no monthly figure yet.`;
  }
  return `${cash} About ${usdRound(facts.burn)} goes out a month. That is about ${monthsLabel(facts.months)} months.`;
}

/** Everything the line needs from a spend day and a balance, in one call. */
export function runwayFacts(items: SpendItem[], asOf: string, cash: { asOf: string; amountUsd: number }): RunwayFacts {
  const burn = monthlyBurn(items, asOf);
  return { asOf: cash.asOf, amountUsd: cash.amountUsd, burn, months: runwayMonths(cash.amountUsd, burn) };
}
