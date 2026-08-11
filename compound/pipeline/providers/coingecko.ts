import type { ProviderContext, ProviderEvidence } from "./types.ts";
import { fetchJson, parseNumber, sortedPoints } from "./shared.ts";

const COINS = ["bitcoin", "ethereum", "solana"] as const;

interface CoinHistory {
  market_data?: { current_price?: { usd?: number } };
}

function coingeckoDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}-${month}-${year}`;
}

export async function collectCoinGecko(context: ProviderContext): Promise<ProviderEvidence> {
  const proKey = Deno.env.get("COINGECKO_PRO_API_KEY")?.trim();
  const demoKey = Deno.env.get("COINGECKO_API_KEY")?.trim();
  const apiBase = proKey ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";
  const headers = proKey
    ? { "x-cg-pro-api-key": proKey }
    : demoKey
    ? { "x-cg-demo-api-key": demoKey }
    : undefined;
  const metrics = await Promise.all(COINS.map(async (coin) => {
    const points = [];
    for (const offset of [30, 7, 0]) {
      const date = new Date(`${context.asOf}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - offset);
      const isoDate = date.toISOString().slice(0, 10);
      const url = new URL(`${apiBase}/coins/${coin}/history`);
      url.searchParams.set("date", coingeckoDate(isoDate));
      url.searchParams.set("localization", "false");
      const response = await fetch(url, {
        signal: context.signal,
        headers: { Accept: "application/json", ...headers },
      });
      if (!response.ok) throw new Error(`CoinGecko ${coin} returned ${response.status}`);
      const payload = await response.json() as CoinHistory;
      const value = parseNumber(payload.market_data?.current_price?.usd);
      if (value !== undefined) points.push({ date: isoDate, value });
    }
    if (points.length === 0) throw new Error(`CoinGecko ${coin} returned no historical price`);
    return {
      id: coin.toUpperCase(),
      label: `${coin} price`,
      domain: "crypto" as const,
      unit: "USD",
      provider: "CoinGecko",
      sourceUrl: `https://www.coingecko.com/en/coins/${coin}`,
      points: sortedPoints(points),
    };
  }));
  return {
    metrics,
    industries: [],
    raw: { coins: COINS },
    coverage: [{ provider: "CoinGecko", domain: "crypto", status: "available", sourceDate: context.asOf }],
  };
}
