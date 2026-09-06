import type { ObservationRecord, RentRecord } from "./schema";

/**
 * Rent guidance. The band comes from observations the pipeline stored; the
 * comparison to the current rent and the review dates are worked out here.
 * Queensland allows one rent increase per twelve months with two months'
 * written notice, so the dates follow from the last increase.
 */

export function weeklyRent(rent: RentRecord): number {
  if (rent.period === "week") return rent.amountAud;
  if (rent.period === "fortnight") return rent.amountAud / 2;
  return rent.amountAud * 12 / 52;
}

export function currentRent(rents: RentRecord[], asOf: string): RentRecord | null {
  return [...rents].filter((rent) => rent.effectiveFrom <= asOf).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1) ?? null;
}

export interface RentBand {
  areaMedian: number | null;
  areaMedianPeriod: string | null;
  areaMedianSource: string | null;
  /** Which area the median describes, e.g. "Highgate Hill" or "postcode 4101". */
  areaMedianScope: string | null;
  askingP25: number | null;
  askingMedian: number | null;
  askingP75: number | null;
  askingCount: number | null;
  askingPeriod: string | null;
}

function pick(observations: ObservationRecord[], metric: string, areaKind: string, areaCode: string, bedrooms: number): ObservationRecord | undefined {
  return observations
    .filter((row) => row.metric === metric && row.areaKind === areaKind && row.areaCode.toLowerCase() === areaCode.toLowerCase()
      && (row.bedrooms === bedrooms || row.bedrooms == null)
      && (row.dwellingType == null || row.dwellingType === "unit" || row.dwellingType === "all"))
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || ((a.bedrooms === bedrooms ? 1 : 0) - (b.bedrooms === bedrooms ? 1 : 0)))
    .at(-1);
}

/** Suburb-level figures win over postcode-level ones: a postcode can span very different buildings. */
function latestFor(observations: ObservationRecord[], metric: string, area: { suburb: string; postcode: string }, bedrooms: number): ObservationRecord | undefined {
  return pick(observations, metric, "suburb", area.suburb, bedrooms) ?? pick(observations, metric, "postcode", area.postcode, bedrooms);
}

export function rentBand(observations: ObservationRecord[], area: { suburb: string; postcode: string }, bedrooms: number): RentBand {
  const median = latestFor(observations, "median_weekly_rent", area, bedrooms);
  const p25 = latestFor(observations, "asking_rent_p25", area, bedrooms);
  const p50 = latestFor(observations, "asking_rent_median", area, bedrooms);
  const p75 = latestFor(observations, "asking_rent_p75", area, bedrooms);
  const count = latestFor(observations, "rent_listing_count", area, bedrooms);
  return {
    areaMedian: median?.value ?? null,
    areaMedianPeriod: median?.periodEnd ?? null,
    areaMedianSource: median?.source ?? null,
    areaMedianScope: median ? (median.areaKind === "suburb" ? median.areaCode : `postcode ${median.areaCode}`) : null,
    askingP25: p25?.value ?? null,
    askingMedian: p50?.value ?? null,
    askingP75: p75?.value ?? null,
    askingCount: count?.value ?? null,
    askingPeriod: p50?.periodEnd ?? null,
  };
}

export interface RentGap {
  /** The weekly figure the current rent is compared against. */
  reference: number;
  referenceLabel: string;
  gapWeekly: number;
  gapPct: number;
}

/** Positive gap means the market is above the current rent. */
export function rentGap(currentWeekly: number, band: RentBand): RentGap | null {
  const reference = band.askingMedian ?? band.areaMedian;
  if (reference == null || currentWeekly <= 0) return null;
  const label = band.askingMedian != null ? "what similar units are asking now" : "the area median from new bonds";
  const gapWeekly = reference - currentWeekly;
  return { reference, referenceLabel: label, gapWeekly, gapPct: (gapWeekly / currentWeekly) * 100 };
}

export function reviewAdvice(gap: RentGap | null): string {
  if (!gap) return "No market rent figure is available yet, so there is nothing to compare against.";
  if (gap.gapPct <= -3) return `Your rent is above the area figure by about A$${Math.round(-gap.gapWeekly)} a week. Hold it and keep the tenant.`;
  if (gap.gapPct < 3) return "Your rent sits on the area figure. Hold, and review at the next allowed date.";
  if (gap.gapPct <= 8) return `Your rent is a little under the area figure. Move toward A$${Math.round(gap.reference)} a week at the next review.`;
  return `You are under the area figure by about A$${Math.round(gap.gapWeekly)} a week. Plan an increase for the next allowed date.`;
}

export interface ReviewDates {
  lastIncreaseOn: string | null;
  earliestIncreaseOn: string | null;
  noticeBy: string | null;
  leaseEndsOn: string | null;
}

function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

export function nextReview(rents: RentRecord[], asOf: string): ReviewDates {
  const current = currentRent(rents, asOf);
  if (!current) return { lastIncreaseOn: null, earliestIncreaseOn: null, noticeBy: null, leaseEndsOn: null };
  const earliest = addMonths(current.effectiveFrom, 12);
  return {
    lastIncreaseOn: current.effectiveFrom,
    earliestIncreaseOn: earliest,
    noticeBy: addMonths(earliest, -2),
    leaseEndsOn: current.leaseEndsOn,
  };
}

/** A year of rent as a share of the price, in percent. */
export function grossRentReturn(weekly: number, price: number): number | null {
  return price > 0 ? (weekly * 52 / price) * 100 : null;
}
