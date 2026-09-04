import type { Observation, Target } from "../types.ts";

/**
 * Suburb ranking for two-bedroom units. Four inputs, each turned into a
 * percentile rank across the target set so no single unit of measure
 * dominates. A missing input scores the middle (0.5) and is named in the row,
 * so a suburb never wins on data it does not have.
 */

export const WEIGHTS = { grossYield: 0.35, rentGrowth: 0.25, priceGrowth: 0.25, supply: 0.15 } as const;

export interface RankingRow {
  suburb: string;
  postcode: string;
  score: number;
  rank: number;
  grossYieldPct: number | null;
  rentGrowthPct: number | null;
  priceGrowthPct: number | null;
  listingCount: number | null;
  medianSoldPriceAud: number | null;
  medianWeeklyRentAud: number | null;
  missing: string[];
  inputs: Record<string, unknown>;
}

function latest(rows: Observation[]): Observation | undefined {
  return [...rows].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd)).at(-1);
}

function yearEarlier(rows: Observation[], reference: Observation): Observation | undefined {
  const target = new Date(`${reference.periodEnd}T00:00:00Z`);
  target.setUTCFullYear(target.getUTCFullYear() - 1);
  const cutoff = target.toISOString().slice(0, 10);
  const earlier = rows.filter((row) => row.periodEnd <= cutoff).sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  return earlier.at(-1);
}

/**
 * Rows for one target. Suburb-level rows beat postcode-level rows and a matching
 * bedroom count beats "all bedrooms", so only the best tier that exists for the
 * target is used. Without this a postcode row dated the same day as a suburb
 * row could win a tie and describe a different market.
 */
function forArea(observations: Observation[], target: Target, metric: string, bedrooms: number): Observation[] {
  const candidates = observations.filter((row) =>
    row.metric === metric
    && ((row.areaKind === "suburb" && row.areaCode.toLowerCase() === target.suburb.toLowerCase())
      || (row.areaKind === "postcode" && row.areaCode === target.postcode))
    && (row.bedrooms === bedrooms || row.bedrooms == null)
    && (row.dwellingType == null || row.dwellingType === "unit" || row.dwellingType === "all")
  );
  const tier = (row: Observation) => (row.areaKind === "suburb" ? 2 : 0) + (row.bedrooms === bedrooms ? 1 : 0);
  const best = Math.max(-1, ...candidates.map(tier));
  return candidates.filter((row) => tier(row) === best);
}

function percentileRanks(values: Array<number | null>, higherIsBetter: boolean): number[] {
  const present = values.filter((value): value is number => value != null);
  return values.map((value) => {
    if (value == null || present.length <= 1) return 0.5;
    const below = present.filter((other) => other < value).length;
    const equal = present.filter((other) => other === value).length - 1;
    const rank = (below + equal / 2) / (present.length - 1);
    return higherIsBetter ? rank : 1 - rank;
  });
}

export function rankSuburbs(observations: Observation[], targets: Target[], bedrooms: number): RankingRow[] {
  const raw = targets.map((target) => {
    const rentRows = forArea(observations, target, "median_weekly_rent", bedrooms);
    const rentLatest = latest(rentRows);
    const rentEarlier = rentLatest ? yearEarlier(rentRows, rentLatest) : undefined;
    const soldRows = forArea(observations, target, "median_sold_price", bedrooms);
    const soldLatest = latest(soldRows);
    const soldEarlier = soldLatest ? yearEarlier(soldRows, soldLatest) : undefined;
    const listings = latest(forArea(observations, target, "sale_listing_count", bedrooms));

    const medianRent = rentLatest?.value ?? null;
    const medianSold = soldLatest?.value ?? null;
    const grossYield = medianRent != null && medianSold != null && medianSold > 0 ? (medianRent * 52 / medianSold) * 100 : null;
    const rentGrowth = rentLatest && rentEarlier && rentEarlier.value > 0 ? (rentLatest.value / rentEarlier.value - 1) * 100 : null;
    const priceGrowth = soldLatest && soldEarlier && soldEarlier.value > 0 ? (soldLatest.value / soldEarlier.value - 1) * 100 : null;
    const missing: string[] = [];
    if (grossYield == null) missing.push("rent return");
    if (rentGrowth == null) missing.push("rent growth");
    if (priceGrowth == null) missing.push("price growth");
    if (!listings) missing.push("homes for sale");

    return {
      target,
      grossYield,
      rentGrowth,
      priceGrowth,
      listingCount: listings?.value ?? null,
      medianRent,
      medianSold,
      missing,
      sources: {
        rent: rentLatest ? { source: rentLatest.source, periodEnd: rentLatest.periodEnd } : null,
        sold: soldLatest ? { source: soldLatest.source, periodEnd: soldLatest.periodEnd } : null,
        listings: listings ? { source: listings.source, periodEnd: listings.periodEnd } : null,
      },
    };
  });

  const yieldRank = percentileRanks(raw.map((row) => row.grossYield), true);
  const rentRank = percentileRanks(raw.map((row) => row.rentGrowth), true);
  const priceRank = percentileRanks(raw.map((row) => row.priceGrowth), true);
  const supplyRank = percentileRanks(raw.map((row) => row.listingCount), false);

  const scored = raw.map((row, index) => {
    const score = 100 * (
      WEIGHTS.grossYield * yieldRank[index]
      + WEIGHTS.rentGrowth * rentRank[index]
      + WEIGHTS.priceGrowth * priceRank[index]
      + WEIGHTS.supply * supplyRank[index]
    );
    return {
      suburb: row.target.suburb,
      postcode: row.target.postcode,
      score: Math.round(score * 10) / 10,
      rank: 0,
      grossYieldPct: row.grossYield == null ? null : Math.round(row.grossYield * 100) / 100,
      rentGrowthPct: row.rentGrowth == null ? null : Math.round(row.rentGrowth * 10) / 10,
      priceGrowthPct: row.priceGrowth == null ? null : Math.round(row.priceGrowth * 10) / 10,
      listingCount: row.listingCount,
      medianSoldPriceAud: row.medianSold,
      medianWeeklyRentAud: row.medianRent,
      missing: row.missing,
      inputs: {
        weights: WEIGHTS,
        ranks: { grossYield: yieldRank[index], rentGrowth: rentRank[index], priceGrowth: priceRank[index], supply: supplyRank[index] },
        sources: row.sources,
        bedrooms,
      },
    } satisfies RankingRow;
  });

  scored.sort((a, b) => b.score - a.score || a.suburb.localeCompare(b.suburb));
  scored.forEach((row, index) => { row.rank = index + 1; });
  return scored;
}

/** True when the set has enough data to be worth showing at all. */
export function rankingIsInformative(rows: RankingRow[]): boolean {
  return rows.some((row) => row.missing.length < 4);
}
