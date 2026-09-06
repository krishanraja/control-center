import type { Currency, FxRate, FxSource } from "../types.ts";

/**
 * USD pricing from RBA table F11.1, which publishes how many units of each
 * currency A$1 buys. AUD amounts multiply by the USD figure; EUR and GBP go
 * through AUD first. Weekends and holidays take the last business day before
 * them; anything older than ten days is left unpriced rather than guessed.
 */

export const MAX_GAP_DAYS = 10;

export interface FxTable {
  byCurrency: Map<Currency, { dates: string[]; rates: number[] }>;
}

export function buildFxTable(rates: FxRate[]): FxTable {
  const byCurrency = new Map<Currency, { dates: string[]; rates: number[] }>();
  const sorted = [...rates].sort((a, b) => a.rate_on.localeCompare(b.rate_on));
  for (const rate of sorted) {
    const bucket = byCurrency.get(rate.currency) ?? { dates: [], rates: [] };
    bucket.dates.push(rate.rate_on);
    bucket.rates.push(rate.per_aud);
    byCurrency.set(rate.currency, bucket);
  }
  return { byCurrency };
}

function dayGap(later: string, earlier: string): number {
  return (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000;
}

/** The latest rate on or before the date, within the allowed gap. */
export function rateOnOrBefore(table: FxTable, currency: Currency, iso: string): { rate_on: string; per_aud: number } | null {
  const bucket = table.byCurrency.get(currency);
  if (!bucket || bucket.dates.length === 0) return null;
  let low = 0;
  let high = bucket.dates.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (bucket.dates[mid] <= iso) { found = mid; low = mid + 1; } else high = mid - 1;
  }
  if (found < 0) return null;
  if (dayGap(iso, bucket.dates[found]) > MAX_GAP_DAYS) return null;
  return { rate_on: bucket.dates[found], per_aud: bucket.rates[found] };
}

export interface Priced {
  amount_usd: number | null;
  fx_rate: number | null;
  fx_date: string | null;
  fx_source: FxSource | null;
}

export function toUsd(amount: number | null, currency: string | null, iso: string, table: FxTable): Priced {
  const none: Priced = { amount_usd: null, fx_rate: null, fx_date: null, fx_source: "none" };
  if (amount == null || !currency) return none;
  const code = currency.toUpperCase();
  if (code === "USD") return { amount_usd: Math.round(amount * 100) / 100, fx_rate: 1, fx_date: null, fx_source: null };
  const usd = rateOnOrBefore(table, "USD", iso);
  if (!usd) return none;
  let usdPerUnit: number;
  if (code === "AUD") usdPerUnit = usd.per_aud;
  else if (code === "EUR" || code === "GBP") {
    const other = rateOnOrBefore(table, code, iso);
    if (!other) return none;
    usdPerUnit = usd.per_aud / other.per_aud;
  } else return none;
  return {
    amount_usd: Math.round(amount * usdPerUnit * 100) / 100,
    fx_rate: Math.round(usdPerUnit * 1_000_000) / 1_000_000,
    fx_date: usd.rate_on,
    fx_source: "rba",
  };
}
