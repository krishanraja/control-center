import type { InsightContext } from "./context";

/** Deterministic cited context for demo mode. */
export const DEMO_CONTEXT: Record<string, InsightContext> = {
  n1: {
    summary:
      "IT services firms are leaning into AI rather than being replaced by it. Accenture and Cognizant have both flagged rising demand for AI integration work, while analysts debate whether that work is durable or a one-off build-out.",
    citations: [
      { title: "Reuters: IT services AI demand", url: "https://www.reuters.com/technology/" },
      { title: "CNBC: Accenture results", url: "https://www.cnbc.com/technology/" },
    ],
    asOf: "2026-08-07",
    via: "demo",
  },
  n2: {
    summary:
      "Solana network activity has cooled from its peak. Recent coverage points to lower fee income even as total value locked stays elevated, the same split the dashboard numbers show.",
    citations: [
      { title: "CoinDesk: Solana activity", url: "https://www.coindesk.com/" },
      { title: "The Block: Solana fees", url: "https://www.theblock.co/" },
    ],
    asOf: "2026-08-07",
    via: "demo",
  },
  n3: {
    summary:
      "Recent coverage has focused on this price move running ahead of the fundamentals, without matching analyst upgrades or fresh positive news.",
    citations: [{ title: "MarketWatch", url: "https://www.marketwatch.com/" }],
    asOf: "2026-08-07",
    via: "demo",
  },
};
