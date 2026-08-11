import type { MetricSeries, ProviderContext, ProviderEvidence, TimePoint } from "./types.ts";
import { daysBefore, fetchJson, parseNumber, requireEnv, sortedPoints } from "./shared.ts";

const ASSETS = [
  { symbol: "SPY", label: "US large-cap equities", domain: "equities" },
  { symbol: "IWM", label: "US small-cap equities", domain: "equities" },
  { symbol: "EFA", label: "Developed-market equities", domain: "equities" },
  { symbol: "EEM", label: "Emerging-market equities", domain: "equities" },
  { symbol: "HYG", label: "High-yield credit", domain: "credit" },
  { symbol: "GLD", label: "Gold", domain: "commodities" },
  { symbol: "DBC", label: "Broad commodities", domain: "commodities" },
] as const;

interface FmpPriceRow {
  date?: string;
  close?: number;
}

interface FmpHistoryResponse {
  historical?: FmpPriceRow[];
}

interface FmpIndustryRow {
  industry?: string;
  averageChange?: number | string;
  changesPercentage?: number | string;
  changePercentage?: number | string;
  date?: string;
}

async function collectAsset(
  asset: typeof ASSETS[number],
  context: ProviderContext,
  apiKey: string,
): Promise<MetricSeries> {
  const url = new URL("https://financialmodelingprep.com/stable/historical-price-eod/full");
  url.searchParams.set("symbol", asset.symbol);
  url.searchParams.set("from", daysBefore(context.asOf, 550));
  url.searchParams.set("to", context.asOf);
  url.searchParams.set("apikey", apiKey);
  const payload = await fetchJson<FmpHistoryResponse | FmpPriceRow[]>(url, context.signal);
  const rows = Array.isArray(payload) ? payload : payload.historical ?? [];
  const points: TimePoint[] = sortedPoints(rows.flatMap((row) => {
    const value = parseNumber(row.close);
    return row.date && value !== undefined ? [{ date: row.date, value }] : [];
  }));
  if (points.length === 0) throw new Error(`FMP ${asset.symbol} returned no dated prices`);
  return {
    id: asset.symbol,
    label: asset.label,
    domain: asset.domain,
    unit: "USD",
    provider: "FMP",
    sourceUrl: `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${asset.symbol}`,
    points,
  };
}

export async function collectFmp(context: ProviderContext): Promise<ProviderEvidence> {
  const apiKey = requireEnv("FMP_API_KEY");
  const metrics = await Promise.all(ASSETS.map((asset) => collectAsset(asset, context, apiKey)));
  const industryUrl = new URL("https://financialmodelingprep.com/stable/industry-performance-snapshot");
  industryUrl.searchParams.set("date", context.asOf);
  industryUrl.searchParams.set("apikey", apiKey);
  const industryPayload = await fetchJson<FmpIndustryRow[]>(industryUrl, context.signal);
  const industryGroups = new Map<string, { total: number; count: number; sourceDate: string }>();
  for (const row of industryPayload) {
    const changePercent = parseNumber(row.averageChange ?? row.changesPercentage ?? row.changePercentage);
    if (!row.industry || changePercent === undefined) continue;
    const current = industryGroups.get(row.industry) ?? { total: 0, count: 0, sourceDate: row.date ?? context.asOf };
    current.total += changePercent;
    current.count += 1;
    if (row.date && row.date > current.sourceDate) current.sourceDate = row.date;
    industryGroups.set(row.industry, current);
  }
  const industries = [...industryGroups.entries()]
    .map(([industry, values]) => ({
      industry,
      changePercent: values.total / values.count,
      sourceDate: values.sourceDate,
      sourceUrl: "https://financialmodelingprep.com/stable/industry-performance-snapshot",
    }))
    .sort((a, b) => a.industry.localeCompare(b.industry));
  const latestAssetDate = metrics.map((metric) => metric.points.at(-1)?.date ?? "").sort().at(-1);
  const equityStatus = latestAssetDate === context.asOf ? "available" : "carried";
  return {
    metrics,
    industries,
    raw: { symbols: ASSETS.map((asset) => asset.symbol), industryCount: industries.length },
    coverage: [
      {
        provider: "FMP",
        domain: "equities",
        status: equityStatus,
        sourceDate: latestAssetDate,
        limitation: equityStatus === "carried" ? `Equity prices carried from ${latestAssetDate}` : undefined,
      },
      { provider: "FMP", domain: "commodities", status: equityStatus, sourceDate: latestAssetDate },
    ],
  };
}
