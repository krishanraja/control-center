import * as XLSX from "xlsx";
import type { Observation, ProviderContext, ProviderEvidence } from "../types.ts";

/**
 * Residential Tenancies Authority (Queensland) median rents from new bonds
 * lodged each quarter. Free, no key, published as one Excel workbook whose
 * link moves every quarter. The workbook's layout is discovered rather than
 * assumed: the parser finds a header row that names a postcode and a bedroom
 * count, then reads every row under it.
 */

export const RTA_PAGE_URL = "https://www.rta.qld.gov.au/forms-resources/rta-quarterly-data/median-rents-quarterly-data";

export function findWorkbookUrl(html: string): string | null {
  const match = html.match(/href="([^"]+\.xlsx[^"]*)"/i);
  if (!match) return null;
  const href = match[1].replace(/&amp;/g, "&");
  return href.startsWith("http") ? href : new URL(href, "https://www.rta.qld.gov.au").toString();
}

const QUARTER_END: Record<string, string> = { mar: "03-31", jun: "06-30", sep: "09-30", dec: "12-31" };

/** "Mar 2026", "March 2026 quarter", "Q1 2026", "2026-03" to a quarter end date. */
export function quarterEnd(label: string): string | null {
  const text = label.toLowerCase();
  const month = text.match(/\b(mar|jun|sep|dec)[a-z]*\b/);
  const year = text.match(/\b(20\d{2})\b/);
  if (month && year) return `${year[1]}-${QUARTER_END[month[1]]}`;
  const quarter = text.match(/\bq([1-4])\b/);
  if (quarter && year) return `${year[1]}-${["03-31", "06-30", "09-30", "12-31"][Number(quarter[1]) - 1]}`;
  const iso = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (iso) {
    const monthIndex = Number(iso[2]);
    const ends = ["03-31", "06-30", "09-30", "12-31"];
    return `${iso[1]}-${ends[Math.ceil(monthIndex / 3) - 1]}`;
  }
  return null;
}

function normalise(cell: unknown): string {
  return String(cell ?? "").trim().toLowerCase();
}

function bedroomsFrom(text: string): number | null {
  const match = text.match(/(\d)\s*(?:bed|br)/);
  if (match) return Number(match[1]);
  if (/\bstudio\b/.test(text)) return 0;
  return null;
}

function dwellingFrom(text: string): Observation["dwellingType"] {
  if (/flat|unit|apartment/.test(text)) return "unit";
  if (/townhouse/.test(text)) return "townhouse";
  if (/house/.test(text)) return "house";
  if (/all/.test(text)) return "all";
  return null;
}

interface HeaderMap {
  row: number;
  postcode: number;
  median: number;
  bedrooms: number | null;
  dwelling: number | null;
  period: number | null;
  count: number | null;
}

function findHeader(rows: unknown[][]): HeaderMap | null {
  for (let index = 0; index < Math.min(rows.length, 40); index += 1) {
    const cells = rows[index].map(normalise);
    const postcode = cells.findIndex((cell) => /post\s*code/.test(cell));
    const median = cells.findIndex((cell) => /median/.test(cell));
    if (postcode < 0 || median < 0) continue;
    const at = (pattern: RegExp) => { const found = cells.findIndex((cell) => pattern.test(cell)); return found < 0 ? null : found; };
    return {
      row: index,
      postcode,
      median,
      bedrooms: at(/bed/),
      dwelling: at(/dwelling|type|property/),
      period: at(/quarter|period|month|date/),
      count: at(/count|number|bonds|sample/),
    };
  }
  return null;
}

/** Pure: workbook rows (all sheets, header: 1) to observations for the wanted postcodes. */
export function normaliseRtaRows(
  sheets: Array<{ name: string; rows: unknown[][] }>,
  wanted: Set<string>,
  fallbackPeriodEnd: string,
  sourceUrl: string,
): Observation[] {
  const observations: Observation[] = [];
  for (const sheet of sheets) {
    const header = findHeader(sheet.rows);
    if (!header) continue;
    const sheetBedrooms = bedroomsFrom(sheet.name.toLowerCase());
    const sheetDwelling = dwellingFrom(sheet.name.toLowerCase());
    for (const row of sheet.rows.slice(header.row + 1)) {
      const postcode = String(row[header.postcode] ?? "").trim().replace(/\.0$/, "");
      if (!/^\d{4}$/.test(postcode) || !wanted.has(postcode)) continue;
      const median = Number(String(row[header.median] ?? "").replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(median) || median <= 0) continue;
      const bedroomText = header.bedrooms == null ? "" : normalise(row[header.bedrooms]);
      const bedrooms = header.bedrooms == null ? sheetBedrooms : (/^\d+$/.test(bedroomText) ? Number(bedroomText) : bedroomsFrom(bedroomText) ?? sheetBedrooms);
      const dwellingText = header.dwelling == null ? "" : normalise(row[header.dwelling]);
      const dwelling = dwellingFrom(dwellingText) ?? sheetDwelling;
      const periodText = header.period == null ? "" : String(row[header.period] ?? "");
      const periodEnd = quarterEnd(periodText) ?? quarterEnd(sheet.name) ?? fallbackPeriodEnd;
      const start = new Date(`${periodEnd}T00:00:00Z`);
      start.setUTCMonth(start.getUTCMonth() - 2, 1);
      const count = header.count == null ? null : Number(String(row[header.count] ?? "").replace(/[^0-9]/g, ""));
      observations.push({
        source: "rta",
        areaKind: "postcode",
        areaCode: postcode,
        dwellingType: dwelling,
        bedrooms,
        metric: "median_weekly_rent",
        periodStart: start.toISOString().slice(0, 10),
        periodEnd,
        value: median,
        unit: "AUD/week",
        sourceUrl,
        sourceDate: periodEnd,
        detail: Number.isFinite(count) && count ? { sampleSize: count } : {},
      });
    }
  }
  // Keep one row per natural key, preferring the last seen (later sheets tend to be newer).
  const byKey = new Map<string, Observation>();
  for (const row of observations) {
    byKey.set([row.areaCode, row.dwellingType ?? "-", row.bedrooms ?? -1, row.periodEnd].join("|"), row);
  }
  return [...byKey.values()];
}

function previousQuarterEnd(runOn: string): string {
  const date = new Date(`${runOn}T00:00:00Z`);
  const quarterIndex = Math.floor(date.getUTCMonth() / 3);
  const ends = ["03-31", "06-30", "09-30", "12-31"];
  const previous = quarterIndex === 0 ? `${date.getUTCFullYear() - 1}-12-31` : `${date.getUTCFullYear()}-${ends[quarterIndex - 1]}`;
  return previous;
}

export async function collectRta(context: ProviderContext): Promise<ProviderEvidence> {
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; COMPOUND/1.0)", Accept: "*/*" };
  let url = (await context.secret("RTA_MEDIAN_RENTS_URL")) ?? "";
  if (!url) {
    const page = await fetch(RTA_PAGE_URL, { signal: context.signal, headers });
    if (!page.ok) throw new Error(`rta.qld.gov.au returned ${page.status}`);
    url = findWorkbookUrl(await page.text()) ?? "";
    if (!url) throw new Error("RTA page has no workbook link");
  }
  const response = await fetch(url, { signal: context.signal, headers });
  if (!response.ok) throw new Error(`RTA workbook returned ${response.status}`);
  const workbook = XLSX.read(new Uint8Array(await response.arrayBuffer()), { type: "array" });
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: true, defval: "" }),
  }));
  const wanted = new Set(context.targets.map((target) => target.postcode));
  const observations = normaliseRtaRows(sheets, wanted, previousQuarterEnd(context.runOn), url);
  if (observations.length === 0) throw new Error("RTA workbook had no rows for the target postcodes");
  const latest = observations.map((row) => row.periodEnd).sort().at(-1);
  return { observations, coverage: [{ provider: "RTA", status: "available", sourceDate: latest }] };
}
