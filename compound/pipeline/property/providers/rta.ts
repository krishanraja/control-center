import * as XLSX from "xlsx";
import type { Observation, ProviderContext, ProviderEvidence } from "../types.ts";

/**
 * Residential Tenancies Authority (Queensland) median rents from new bonds
 * lodged each quarter. Free, no key, one Excel workbook.
 *
 * Layout (read from the live file on 2026-09-04): sheets named like
 * "1 pc-rents" (by postcode) and "4 sub-rents" (by suburb). A header row has
 * "Postcode" or "Suburb" in column B and "Dwelling" in column C. The next row
 * carries quarter months (Mar, Jun, Sep, Dec) from column D onward and the row
 * after carries the year for each column. Data rows give the area, a dwelling
 * label such as "Flat 2", "House 3", "Townhouse 2" or "All dwellings", then one
 * median per quarter. Blank cells mean too few bonds to publish.
 */

export const RTA_PAGE_URL = "https://www.rta.qld.gov.au/forms-resources/rta-quarterly-data/median-rents-quarterly-data";
const QUARTERS_KEPT = 10;
const QUARTER_END: Record<string, string> = { mar: "03-31", jun: "06-30", sep: "09-30", dec: "12-31" };

export function findWorkbookUrl(html: string): string | null {
  const match = html.match(/href="([^"]+\.xlsx[^"]*)"/i);
  if (!match) return null;
  const href = match[1].replace(/&amp;/g, "&");
  return href.startsWith("http") ? href : new URL(href, "https://www.rta.qld.gov.au").toString();
}

/** "Mar 2026", "March 2026 quarter", "Q1 2026", "2026-03" to a quarter end date. */
export function quarterEnd(label: string): string | null {
  const text = label.toLowerCase();
  const month = text.match(/\b(mar|jun|sep|dec)[a-z]*\b/);
  const year = text.match(/\b(20\d{2})\b/);
  if (month && year) return `${year[1]}-${QUARTER_END[month[1]]}`;
  const quarter = text.match(/\bq([1-4])\b/);
  if (quarter && year) return `${year[1]}-${["03-31", "06-30", "09-30", "12-31"][Number(quarter[1]) - 1]}`;
  const iso = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (iso) return `${iso[1]}-${["03-31", "06-30", "09-30", "12-31"][Math.ceil(Number(iso[2]) / 3) - 1]}`;
  return null;
}

function text(cell: unknown): string {
  return String(cell ?? "").trim();
}

/** "Flat 2" to unit with 2 bedrooms; "All dwellings" to all with no bedroom count; "Other" is skipped. */
export function parseDwelling(label: string): { dwellingType: Observation["dwellingType"]; bedrooms: number | null } | null {
  const lower = label.toLowerCase().trim();
  if (!lower || lower === "other") return null;
  if (lower.startsWith("all")) return { dwellingType: "all", bedrooms: null };
  const bedrooms = lower.match(/(\d)\s*$/);
  const beds = bedrooms ? Number(bedrooms[1]) : null;
  if (/flat|unit|apartment/.test(lower)) return { dwellingType: "unit", bedrooms: beds };
  if (/townhouse/.test(lower)) return { dwellingType: "townhouse", bedrooms: beds };
  if (/house/.test(lower)) return { dwellingType: "house", bedrooms: beds };
  return null;
}

interface WideHeader {
  areaKind: "postcode" | "suburb";
  headerRow: number;
  periods: Array<{ column: number; periodEnd: string }>;
}

function findWideHeader(rows: unknown[][]): WideHeader | null {
  for (let index = 0; index < Math.min(rows.length, 30); index += 1) {
    const cells = rows[index] ?? [];
    const area = text(cells[1]).toLowerCase();
    if (!/^(postcode|suburb)$/.test(area) || !/dwelling/.test(text(cells[2]).toLowerCase())) continue;
    const months = rows[index + 1] ?? [];
    const years = rows[index + 2] ?? [];
    const periods: WideHeader["periods"] = [];
    for (let column = 3; column < Math.max(months.length, years.length); column += 1) {
      const month = text(months[column]).toLowerCase().slice(0, 3);
      const year = text(years[column]).replace(/\.0$/, "");
      if (QUARTER_END[month] && /^20\d{2}$/.test(year)) periods.push({ column, periodEnd: `${year}-${QUARTER_END[month]}` });
    }
    if (periods.length === 0) continue;
    return { areaKind: area === "postcode" ? "postcode" : "suburb", headerRow: index, periods };
  }
  return null;
}

/**
 * Pure: workbook sheets (header: 1) to median rent observations for the wanted
 * postcodes and suburbs. Only unit rows and the all-dwellings row are kept, for
 * the most recent quarters, so the table stays small and relevant.
 */
export function normaliseRtaRows(
  sheets: Array<{ name: string; rows: unknown[][] }>,
  wanted: { postcodes: Set<string>; suburbs: Set<string> },
  sourceUrl: string,
): Observation[] {
  const observations: Observation[] = [];
  for (const sheet of sheets) {
    const title = text(sheet.rows[1]?.[0] ?? sheet.rows[0]?.[0]).toLowerCase();
    if (!/median rents/.test(title) && !/rents/.test(sheet.name.toLowerCase())) continue;
    const header = findWideHeader(sheet.rows);
    if (!header) continue;
    const recent = header.periods.slice(-QUARTERS_KEPT);
    for (const row of sheet.rows.slice(header.headerRow + 3)) {
      const area = text(row[1]).replace(/\.0$/, "");
      if (!area) continue;
      if (header.areaKind === "postcode" ? !wanted.postcodes.has(area) : !wanted.suburbs.has(area.toLowerCase())) continue;
      const dwelling = parseDwelling(text(row[2]));
      if (!dwelling || (dwelling.dwellingType !== "unit" && dwelling.dwellingType !== "all")) continue;
      for (const period of recent) {
        const value = Number(text(row[period.column]).replace(/[^0-9.]/g, ""));
        if (!Number.isFinite(value) || value <= 0) continue;
        const start = new Date(`${period.periodEnd}T00:00:00Z`);
        start.setUTCMonth(start.getUTCMonth() - 2, 1);
        observations.push({
          source: "rta",
          areaKind: header.areaKind,
          areaCode: area,
          dwellingType: dwelling.dwellingType,
          bedrooms: dwelling.bedrooms,
          metric: "median_weekly_rent",
          periodStart: start.toISOString().slice(0, 10),
          periodEnd: period.periodEnd,
          value,
          unit: "AUD/week",
          sourceUrl,
          sourceDate: period.periodEnd,
        });
      }
    }
  }
  return observations;
}

export async function collectRta(context: ProviderContext): Promise<ProviderEvidence> {
  const headers = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36", Accept: "*/*" };
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
  const wanted = {
    postcodes: new Set(context.targets.map((target) => target.postcode)),
    suburbs: new Set(context.targets.map((target) => target.suburb.toLowerCase())),
  };
  const observations = normaliseRtaRows(sheets, wanted, url);
  if (observations.length === 0) throw new Error("RTA workbook had no rows for the target postcodes or suburbs");
  const latest = observations.map((row) => row.periodEnd).sort().at(-1);
  return { observations, coverage: [{ provider: "RTA", status: "available", sourceDate: latest }] };
}
