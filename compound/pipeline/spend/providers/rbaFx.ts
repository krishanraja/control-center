import { isoFromRbaDate, splitCsvLine } from "../../property/providers/rba.ts";
import type { Coverage, Currency, FxRate, SpendContext } from "../types.ts";
import { monthsBefore } from "../types.ts";

/**
 * RBA statistical table F11.1: daily exchange rates, A$1 = X units. Free, no
 * key, same CSV layout as the cash rate table the property pipeline reads.
 */

export const RBA_F11_URL = "https://www.rba.gov.au/statistics/tables/csv/f11.1-data.csv";
export const FX_SERIES: Record<Currency, string> = { USD: "FXRUSD", EUR: "FXREUR", GBP: "FXRUKPS" };

/** Pure parse of an F11.1 CSV into one rate per business day per currency. */
export function parseFxRates(csv: string, sinceIso: string): FxRate[] {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/);
  const seriesLine = lines.find((line) => line.startsWith("Series ID"));
  if (!seriesLine) throw new Error("RBA F11.1 has no Series ID row");
  const header = splitCsvLine(seriesLine);
  const columns = new Map<Currency, number>();
  for (const [currency, series] of Object.entries(FX_SERIES) as Array<[Currency, string]>) {
    const column = header.indexOf(series);
    if (column >= 0) columns.set(currency, column);
  }
  if (!columns.has("USD")) throw new Error("RBA F11.1 has no USD column");
  const rates: FxRate[] = [];
  for (const line of lines) {
    const cells = splitCsvLine(line);
    const iso = isoFromRbaDate(cells[0] ?? "");
    if (!iso || iso < sinceIso) continue;
    for (const [currency, column] of columns) {
      const value = Number(cells[column]);
      if (Number.isFinite(value) && value > 0) rates.push({ rate_on: iso, currency, per_aud: value });
    }
  }
  return rates;
}

export interface FxCollection {
  rates: FxRate[];
  coverage: Coverage;
}

async function fetchCsv(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal, headers: { "User-Agent": "COMPOUND/1.0" } });
  if (!response.ok) throw new Error(`rba.gov.au returned ${response.status} for ${url}`);
  return await response.text();
}

/** The daily file starts in January 2023, which covers every receipt the tab shows. */
export async function collectFx(context: SpendContext, monthsBack = 14): Promise<FxCollection> {
  const started = performance.now();
  const since = monthsBefore(context.runOn, monthsBack);
  const rates = parseFxRates(await fetchCsv(RBA_F11_URL, context.signal), since);
  if (rates.length === 0) throw new Error("RBA F11.1 returned no exchange rates");
  const latest = rates.reduce((carry, rate) => rate.rate_on > carry ? rate.rate_on : carry, "");
  const earliest = rates.reduce((carry, rate) => rate.rate_on < carry ? rate.rate_on : carry, latest);
  return {
    rates,
    coverage: {
      provider: "RBA exchange rates",
      status: "available",
      sourceDate: latest,
      latencyMs: Math.round(performance.now() - started),
      limitation: earliest > monthsBefore(context.runOn, monthsBack - 1) ? `Rates start ${earliest}; older items stay unpriced.` : undefined,
    },
  };
}
