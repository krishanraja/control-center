import type { Observation, ProviderContext, ProviderEvidence } from "../types.ts";

/**
 * RBA statistical table F1: the cash rate target. Free, no key. Kept so the tab
 * can say how far the cash rate has moved since settlement while the loan's
 * own rate is whatever the bank last wrote.
 */

export const RBA_F1_URL = "https://www.rba.gov.au/statistics/tables/csv/f1-data.csv";
const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { cells.push(current); current = ""; }
    else current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/** "04-Jan-2011" to "2011-01-04". Returns null for anything else. */
export function isoFromRbaDate(value: string): string | null {
  const match = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return null;
  const month = MONTHS[match[2].toLowerCase()];
  return month ? `${match[3]}-${month}-${match[1].padStart(2, "0")}` : null;
}

/** Pure parse of the F1 CSV into month-end cash rate observations. */
export function parseCashRate(csv: string, sinceIso: string): Observation[] {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/);
  const seriesLine = lines.find((line) => line.startsWith("Series ID"));
  if (!seriesLine) throw new Error("RBA F1 has no Series ID row");
  const column = splitCsvLine(seriesLine).indexOf("FIRMMCRTD");
  if (column < 0) throw new Error("RBA F1 has no cash rate target column");
  const byMonth = new Map<string, { date: string; value: number }>();
  for (const line of lines) {
    const cells = splitCsvLine(line);
    const iso = isoFromRbaDate(cells[0] ?? "");
    if (!iso || iso < sinceIso) continue;
    const value = Number(cells[column]);
    if (!Number.isFinite(value)) continue;
    byMonth.set(iso.slice(0, 7), { date: iso, value });
  }
  return [...byMonth.values()].map((point) => ({
    source: "rba",
    areaKind: "national",
    areaCode: "AU",
    dwellingType: null,
    bedrooms: null,
    metric: "cash_rate_pct",
    periodStart: `${point.date.slice(0, 7)}-01`,
    periodEnd: point.date,
    value: point.value,
    unit: "%",
    sourceUrl: RBA_F1_URL,
    sourceDate: point.date,
  }));
}

export async function collectRba(context: ProviderContext): Promise<ProviderEvidence> {
  const since = new Date(`${context.runOn}T00:00:00Z`);
  since.setUTCFullYear(since.getUTCFullYear() - 3);
  const response = await fetch(RBA_F1_URL, { signal: context.signal, headers: { "User-Agent": "COMPOUND/1.0" } });
  if (!response.ok) throw new Error(`rba.gov.au returned ${response.status}`);
  const observations = parseCashRate(await response.text(), since.toISOString().slice(0, 10));
  if (observations.length === 0) throw new Error("RBA F1 returned no cash rate observations");
  return {
    observations,
    coverage: [{ provider: "RBA", status: "available", sourceDate: observations.at(-1)?.periodEnd }],
  };
}
