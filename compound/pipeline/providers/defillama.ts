import type { ProviderContext, ProviderEvidence } from "./types.ts";
import { fetchJson, parseNumber, sortedPoints } from "./shared.ts";

interface FeeOverview {
  totalDataChart?: Array<[number, number]>;
}

export async function collectDefiLlama(context: ProviderContext): Promise<ProviderEvidence> {
  const url = new URL("https://api.llama.fi/overview/fees");
  url.searchParams.set("dataType", "dailyFees");
  const payload = await fetchJson<FeeOverview>(url, context.signal);
  const points = sortedPoints((payload.totalDataChart ?? []).flatMap(([timestamp, rawValue]) => {
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const value = parseNumber(rawValue);
    return date <= context.asOf && value !== undefined ? [{ date, value }] : [];
  })).slice(-550);
  if (points.length === 0) throw new Error("DefiLlama returned no dated fee observations");
  return {
    metrics: [{
      id: "DEFI_FEES",
      label: "DeFi daily fees",
      domain: "crypto",
      unit: "USD",
      provider: "DefiLlama",
      sourceUrl: "https://defillama.com/fees",
      points,
    }],
    industries: [],
    raw: {},
    coverage: [{
      provider: "DefiLlama",
      domain: "crypto",
      status: points.at(-1)?.date === context.asOf ? "available" : "carried",
      sourceDate: points.at(-1)?.date,
    }],
  };
}
