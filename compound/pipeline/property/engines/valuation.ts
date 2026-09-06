import type { Observation } from "../types.ts";

/**
 * Hedonic-lite value estimate, version 1.
 *
 * Plain rules, every input written into the result so the tab can show the
 * working:
 *   1. Anchor on the most recent sale in the same building with the same
 *      bedroom count, adjusted for car spaces with a fixed, declared constant.
 *   2. Pool recent sales of the same bedroom count in the same postcode; take
 *      the median and the middle half (interquartile range).
 *   3. Blend anchor and pool when both exist. The band is the wider of five
 *      percent or half the pool's middle range.
 *   4. A same-building smaller unit sets a floor: the estimate never dips
 *      below what a one-bed in the block last fetched.
 * Confidence is high only with a fresh anchor and a deep pool.
 */

export const CAR_SPACE_AUD = 30_000;
export const TOP_FLOOR_AUD = 0;
export const ANCHOR_WEIGHT = 0.6;
export const MIN_BAND = 0.05;

export interface Subject {
  postcode: string;
  bedrooms: number;
  carSpaces: number;
  purchasePrice: number;
  settledOn: string;
  buildingKey: string;
}

export interface ValuationResult {
  low: number;
  mid: number;
  high: number;
  confidence: "low" | "medium" | "high";
  inputs: Record<string, unknown>;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function quartiles(values: number[]): { q1: number; q3: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (share: number) => {
    const position = (sorted.length - 1) * share;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return { q1: at(0.25), q3: at(0.75) };
}

function monthsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

function daysBefore(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function round(value: number): number {
  return Math.round(value / 500) * 500;
}

/** Year-on-year growth in the postcode's median sold price for this bedroom count, if known. */
export function priceGrowth(observations: Observation[], postcode: string, bedrooms: number): number | null {
  const medians = observations
    .filter((row) => row.metric === "median_sold_price" && row.areaKind === "postcode" && row.areaCode === postcode && (row.bedrooms === bedrooms || row.bedrooms == null))
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  if (medians.length < 2) return null;
  const latest = medians.at(-1)!;
  const yearBefore = medians.filter((row) => monthsBetween(row.periodEnd, latest.periodEnd) >= 11).at(-1);
  if (!yearBefore || yearBefore.value <= 0) return null;
  return (latest.value / yearBefore.value - 1) * 100;
}

export function estimateValue(subject: Subject, observations: Observation[], asOf: string): ValuationResult {
  const assumptions: string[] = [];
  const sales = observations.filter((row) => row.metric === "sale_price");

  const buildingSales = sales
    .filter((row) => row.areaKind === "building" && row.areaCode === subject.buildingKey)
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const anchorSale = buildingSales.find((row) => row.bedrooms === subject.bedrooms);
  const smallerSale = buildingSales.find((row) => row.bedrooms != null && row.bedrooms < subject.bedrooms);

  const growth = priceGrowth(observations, subject.postcode, subject.bedrooms);
  let adjustedAnchor: number | null = null;
  if (anchorSale) {
    const anchorCars = typeof anchorSale.detail?.cars === "number" ? anchorSale.detail.cars : subject.carSpaces;
    const carAdjustment = (subject.carSpaces - anchorCars) * CAR_SPACE_AUD;
    const months = Math.max(0, monthsBetween(anchorSale.periodEnd, asOf));
    const indexFactor = growth == null ? 1 : Math.pow(1 + growth / 100, months / 12);
    if (growth == null) assumptions.push("No price index for the postcode yet, so the building sale was not moved forward in time.");
    if (TOP_FLOOR_AUD === 0) assumptions.push("No value was added for the top floor position; the evidence does not price it.");
    adjustedAnchor = (anchorSale.value + carAdjustment + TOP_FLOOR_AUD) * indexFactor;
  } else {
    assumptions.push("No same-size sale in the building has been recorded yet.");
  }

  const since = daysBefore(asOf, 365);
  let pool = sales.filter((row) =>
    row.areaKind !== "building" && row.areaCode === subject.postcode && row.bedrooms === subject.bedrooms && row.periodEnd >= since
  );
  let poolScope = subject.postcode;
  if (pool.length < 5) {
    const widened = sales.filter((row) =>
      row.areaKind !== "building" && ["4101", "4102", "4169"].includes(row.areaCode) && row.bedrooms === subject.bedrooms && row.periodEnd >= since
    );
    if (widened.length > pool.length) {
      pool = widened;
      poolScope = "4101, 4102, 4169";
      assumptions.push("Fewer than five sales in the postcode, so the pool widened to the neighbouring postcodes.");
    }
  }
  const poolValues = pool.map((row) => row.value);
  const poolMedian = poolValues.length ? median(poolValues) : null;
  const iqr = poolValues.length >= 4 ? (() => { const { q1, q3 } = quartiles(poolValues); return q3 - q1; })() : null;

  let mid: number;
  let method: string;
  if (adjustedAnchor != null && poolMedian != null) {
    mid = ANCHOR_WEIGHT * adjustedAnchor + (1 - ANCHOR_WEIGHT) * poolMedian;
    method = "blend of building sale and postcode pool";
  } else if (adjustedAnchor != null) {
    mid = adjustedAnchor;
    method = "building sale only";
  } else if (poolMedian != null) {
    mid = poolMedian;
    method = "postcode pool only";
  } else {
    mid = subject.purchasePrice;
    method = "purchase price, no market evidence yet";
    assumptions.push("No sales evidence at all, so the estimate is the purchase price.");
  }

  const bandShare = Math.max(MIN_BAND, iqr != null && mid > 0 ? (iqr / 2) / mid : 0);
  let low = mid * (1 - bandShare);
  const high = mid * (1 + bandShare);
  if (smallerSale && low < smallerSale.value) {
    low = smallerSale.value;
    assumptions.push(`The low end was lifted to the smaller unit's sale in the same building (A$${Math.round(smallerSale.value).toLocaleString("en-AU")}).`);
  }

  const anchorAgeMonths = anchorSale ? monthsBetween(anchorSale.periodEnd, asOf) : null;
  const confidence: ValuationResult["confidence"] =
    anchorAgeMonths != null && anchorAgeMonths <= 12 && poolValues.length >= 8
      ? "high"
      : anchorSale || poolValues.length >= 5
      ? "medium"
      : "low";

  return {
    low: round(Math.min(low, mid)),
    mid: round(mid),
    high: round(Math.max(high, mid)),
    confidence,
    inputs: {
      method,
      asOf,
      anchor: anchorSale
        ? {
          price: anchorSale.value,
          soldOn: anchorSale.periodEnd,
          cars: anchorSale.detail?.cars ?? null,
          address: anchorSale.detail?.address ?? null,
          sourceUrl: anchorSale.sourceUrl ?? null,
          carAdjustmentAud: adjustedAnchor != null ? Math.round(adjustedAnchor - anchorSale.value) : null,
          adjusted: adjustedAnchor != null ? Math.round(adjustedAnchor) : null,
          ageMonths: anchorAgeMonths,
        }
        : null,
      pool: { scope: poolScope, count: poolValues.length, median: poolMedian, interquartileRange: iqr, since },
      priceGrowthPct: growth,
      floor: smallerSale ? { price: smallerSale.value, soldOn: smallerSale.periodEnd, bedrooms: smallerSale.bedrooms } : null,
      constants: { CAR_SPACE_AUD, TOP_FLOOR_AUD, ANCHOR_WEIGHT, MIN_BAND },
      bandShare: Math.round(bandShare * 1000) / 1000,
      assumptions,
    },
  };
}
