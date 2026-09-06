import type { Observation, ProviderContext, ProviderEvidence, Target } from "../types.ts";

/**
 * Domain Developer API, free tier. Two things it can tell us that nothing free
 * elsewhere can: what two-bed units are asking for rent right now, and what
 * they have been selling for. Only aggregates and dated sale prices are kept;
 * raw listings are not stored. "Powered by Domain" attribution is shown in the
 * tab's footer whenever a Domain observation is on screen.
 *
 * A missing key or an unpermitted package is a coverage limitation, not a run
 * failure: the rest of the pipeline continues and the tab says what is absent.
 */

const BASE = "https://api.domain.com.au/v1";

interface Listing {
  id?: number;
  listingType?: string;
  priceDetails?: { displayPrice?: string; price?: number; priceFrom?: number; priceTo?: number };
  propertyDetails?: {
    bedrooms?: number;
    bathrooms?: number;
    carspaces?: number;
    suburb?: string;
    postcode?: string;
    propertyType?: string;
    displayableAddress?: string;
    unitNumber?: string;
    streetNumber?: string;
    street?: string;
  };
  soldData?: { soldPrice?: number; soldDate?: string; soldDateTime?: string };
  dateListed?: string;
  seoUrl?: string;
}

interface SearchItem {
  type?: string;
  listing?: Listing;
  listings?: Listing[];
}

function flatten(items: SearchItem[]): Listing[] {
  return items.flatMap((item) => item.listing ? [item.listing] : item.listings ?? []);
}

/** Weekly asking rent from a listing. Returns null when the price is hidden or not weekly. */
export function weeklyAskingRent(listing: Listing): number | null {
  const details = listing.priceDetails ?? {};
  const candidates = [details.price, details.priceFrom, details.priceTo].filter((value): value is number => typeof value === "number" && value > 0);
  if (candidates.length > 0) return Math.min(...candidates);
  const text = details.displayPrice ?? "";
  if (!/\$/.test(text) || /month|pcm|p\/m/i.test(text)) return null;
  const match = text.replace(/,/g, "").match(/\$\s?(\d{2,5})/);
  const value = match ? Number(match[1]) : null;
  return value != null && value >= 100 && value <= 5000 ? value : null;
}

function percentile(sorted: number[], share: number): number {
  const position = (sorted.length - 1) * share;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

async function search(apiKey: string, body: Record<string, unknown>, signal: AbortSignal): Promise<Listing[]> {
  const response = await fetch(`${BASE}/listings/residential/_search`, {
    method: "POST",
    signal,
    headers: { "X-Api-Key": apiKey, "Content-Type": "application/json", Accept: "application/json", "User-Agent": "COMPOUND/1.0" },
    body: JSON.stringify(body),
  });
  if (response.status === 401 || response.status === 403) {
    const text = await response.text().catch(() => "");
    throw new Error(`Domain listings not permitted for this key (${response.status}): ${text.slice(0, 120)}`);
  }
  if (!response.ok) throw new Error(`Domain search returned ${response.status}`);
  return flatten(await response.json() as SearchItem[]);
}

/** Pure: asking-rent aggregates for one postcode from its rent listings. */
export function rentObservations(listings: Listing[], postcode: string, bedrooms: number, runOn: string): Observation[] {
  const rents = listings.map(weeklyAskingRent).filter((value): value is number => value != null).sort((a, b) => a - b);
  const base = {
    source: "domain" as const,
    areaKind: "postcode" as const,
    areaCode: postcode,
    dwellingType: "unit" as const,
    bedrooms,
    periodStart: monthStart(runOn),
    periodEnd: runOn,
    sourceUrl: "https://www.domain.com.au/",
    sourceDate: runOn,
  };
  const rows: Observation[] = [{ ...base, metric: "rent_listing_count", value: listings.length, unit: "listings" }];
  if (rents.length >= 3) {
    rows.push(
      { ...base, metric: "asking_rent_p25", value: Math.round(percentile(rents, 0.25)), unit: "AUD/week", detail: { sample: rents.length } },
      { ...base, metric: "asking_rent_median", value: Math.round(percentile(rents, 0.5)), unit: "AUD/week", detail: { sample: rents.length } },
      { ...base, metric: "asking_rent_p75", value: Math.round(percentile(rents, 0.75)), unit: "AUD/week", detail: { sample: rents.length } },
    );
  }
  return rows;
}

/** Pure: one sale_price observation per sold listing with a price and date, plus the count. */
export function soldObservations(listings: Listing[], postcode: string, bedrooms: number, runOn: string): Observation[] {
  const rows: Observation[] = [];
  const prices: number[] = [];
  for (const listing of listings) {
    const price = listing.soldData?.soldPrice ?? listing.priceDetails?.price;
    const soldDate = (listing.soldData?.soldDate ?? listing.soldData?.soldDateTime ?? "").slice(0, 10);
    if (!price || price <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(soldDate)) continue;
    prices.push(price);
    const details = listing.propertyDetails ?? {};
    rows.push({
      source: "domain",
      areaKind: "postcode",
      areaCode: postcode,
      dwellingType: "unit",
      bedrooms,
      metric: "sale_price",
      periodStart: soldDate,
      periodEnd: soldDate,
      value: price,
      unit: "AUD",
      sourceUrl: listing.seoUrl ? `https://www.domain.com.au${listing.seoUrl}` : "https://www.domain.com.au/",
      sourceDate: soldDate,
      detail: {
        ref: listing.id != null ? `domain-${listing.id}` : `domain-${soldDate}-${price}`,
        address: details.displayableAddress ?? null,
        beds: details.bedrooms ?? null,
        baths: details.bathrooms ?? null,
        cars: details.carspaces ?? null,
        suburb: details.suburb ?? null,
      },
    });
  }
  if (prices.length >= 3) {
    const sorted = [...prices].sort((a, b) => a - b);
    const since = new Date(`${runOn}T00:00:00Z`);
    since.setUTCFullYear(since.getUTCFullYear() - 1);
    rows.push({
      source: "domain",
      areaKind: "postcode",
      areaCode: postcode,
      dwellingType: "unit",
      bedrooms,
      metric: "median_sold_price",
      periodStart: since.toISOString().slice(0, 10),
      periodEnd: runOn,
      value: Math.round(percentile(sorted, 0.5)),
      unit: "AUD",
      sourceUrl: "https://www.domain.com.au/",
      sourceDate: runOn,
      detail: { sample: prices.length },
    }, {
      source: "domain",
      areaKind: "postcode",
      areaCode: postcode,
      dwellingType: "unit",
      bedrooms,
      metric: "sold_count",
      periodStart: since.toISOString().slice(0, 10),
      periodEnd: runOn,
      value: prices.length,
      unit: "sales",
      sourceUrl: "https://www.domain.com.au/",
      sourceDate: runOn,
    });
  }
  return rows;
}

function listingBody(listingType: "Rent" | "Sale" | "Sold", postcode: string, bedrooms: number) {
  return {
    listingType,
    propertyTypes: ["ApartmentUnitFlat"],
    minBedrooms: bedrooms,
    maxBedrooms: bedrooms,
    locations: [{ state: "QLD", postCode: postcode }],
    pageSize: 100,
    sort: { sortKey: "DateUpdated", direction: "Descending" },
  };
}

export async function collectDomain(context: ProviderContext): Promise<ProviderEvidence> {
  const apiKey = await context.secret("DOMAIN_API_KEY");
  if (!apiKey) {
    return {
      observations: [],
      coverage: [{ provider: "Domain", status: "not_configured", limitation: "No Domain API key is configured; asking rents and sold prices are unavailable." }],
    };
  }
  const postcodes = [...new Set(context.targets.map((target: Target) => target.postcode))];
  const observations: Observation[] = [];
  const limitations: string[] = [];
  let soldSupported = true;
  for (const postcode of postcodes) {
    const rentListings = await search(apiKey, listingBody("Rent", postcode, context.subjectBedrooms), context.signal);
    observations.push(...rentObservations(rentListings, postcode, context.subjectBedrooms, context.runOn));
    const saleListings = await search(apiKey, listingBody("Sale", postcode, context.subjectBedrooms), context.signal);
    observations.push({
      source: "domain",
      areaKind: "postcode",
      areaCode: postcode,
      dwellingType: "unit",
      bedrooms: context.subjectBedrooms,
      metric: "sale_listing_count",
      periodStart: monthStart(context.runOn),
      periodEnd: context.runOn,
      value: saleListings.length,
      unit: "listings",
      sourceUrl: "https://www.domain.com.au/",
      sourceDate: context.runOn,
    });
    if (soldSupported) {
      try {
        const soldListings = await search(apiKey, listingBody("Sold", postcode, context.subjectBedrooms), context.signal);
        observations.push(...soldObservations(soldListings, postcode, context.subjectBedrooms, context.runOn));
      } catch (error) {
        soldSupported = false;
        limitations.push(`Sold listings are not available on this Domain plan: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return {
    observations,
    coverage: [{
      provider: "Domain",
      status: "available",
      sourceDate: context.runOn,
      limitation: limitations[0],
    }],
  };
}
