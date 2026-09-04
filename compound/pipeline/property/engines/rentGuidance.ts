import type { Observation } from "../types.ts";

/**
 * The rent band is assembled from observations, not computed in the browser,
 * so the tab shows the same band the pipeline saw on run day.
 */

export interface RentBand {
  areaMedian: number | null;
  areaMedianPeriod: string | null;
  areaMedianSource: string | null;
  askingP25: number | null;
  askingMedian: number | null;
  askingP75: number | null;
  askingCount: number | null;
  askingPeriod: string | null;
}

function latestFor(observations: Observation[], metric: string, postcode: string, bedrooms: number): Observation | undefined {
  return observations
    .filter((row) => row.metric === metric && row.areaKind === "postcode" && row.areaCode === postcode
      && (row.bedrooms === bedrooms || row.bedrooms == null) && (row.dwellingType == null || row.dwellingType === "unit" || row.dwellingType === "all"))
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || (a.bedrooms === bedrooms ? 1 : -1))
    .at(-1);
}

export function rentBand(observations: Observation[], postcode: string, bedrooms: number): RentBand {
  const median = latestFor(observations, "median_weekly_rent", postcode, bedrooms);
  const p25 = latestFor(observations, "asking_rent_p25", postcode, bedrooms);
  const p50 = latestFor(observations, "asking_rent_median", postcode, bedrooms);
  const p75 = latestFor(observations, "asking_rent_p75", postcode, bedrooms);
  const count = latestFor(observations, "rent_listing_count", postcode, bedrooms);
  return {
    areaMedian: median?.value ?? null,
    areaMedianPeriod: median?.periodEnd ?? null,
    areaMedianSource: median?.source ?? null,
    askingP25: p25?.value ?? null,
    askingMedian: p50?.value ?? null,
    askingP75: p75?.value ?? null,
    askingCount: count?.value ?? null,
    askingPeriod: p50?.periodEnd ?? null,
  };
}
