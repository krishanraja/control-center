import type { ProviderContext, ProviderEvidence } from "./types.ts";
import { daysBefore, fetchJson, parseNumber, requireEnv, sortedPoints } from "./shared.ts";

const SERIES = [
  { id: "DGS10", label: "US 10-year Treasury yield", domain: "rates", unit: "%" },
  { id: "DFII10", label: "US 10-year real yield", domain: "rates", unit: "%" },
  { id: "BAMLH0A0HYM2", label: "US high-yield option-adjusted spread", domain: "credit", unit: "%" },
  { id: "DTWEXBGS", label: "Trade-weighted US dollar index", domain: "currencies", unit: "index" },
] as const;

interface FredResponse {
  observations?: Array<{ date?: string; value?: string }>;
}

export async function collectFred(context: ProviderContext): Promise<ProviderEvidence> {
  const apiKey = requireEnv("FRED_API_KEY");
  const metrics = await Promise.all(SERIES.map(async (series) => {
    const url = new URL("https://api.stlouisfed.org/fred/series/observations");
    url.searchParams.set("series_id", series.id);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("observation_start", daysBefore(context.asOf, 550));
    url.searchParams.set("observation_end", context.asOf);
    if (context.reconstructed) {
      url.searchParams.set("realtime_start", context.asOf);
      url.searchParams.set("realtime_end", context.asOf);
    }
    const payload = await fetchJson<FredResponse>(url, context.signal);
    const points = sortedPoints((payload.observations ?? []).flatMap((row) => {
      const value = parseNumber(row.value);
      return row.date && value !== undefined ? [{ date: row.date, value }] : [];
    }));
    if (points.length === 0) throw new Error(`FRED ${series.id} returned no dated observations`);
    return {
      ...series,
      points,
      provider: "FRED",
      sourceUrl: `https://fred.stlouisfed.org/series/${series.id}`,
    };
  }));
  return {
    metrics,
    industries: [],
    raw: { series: SERIES.map((series) => series.id) },
    coverage: [
      { provider: "FRED", domain: "rates", status: "available", sourceDate: metrics[0].points.at(-1)?.date },
      { provider: "FRED", domain: "credit", status: "available", sourceDate: metrics[2].points.at(-1)?.date },
      {
        provider: "FRED",
        domain: "currencies",
        status: "available",
        sourceDate: metrics[3].points.at(-1)?.date,
      },
    ],
  };
}
