import type { InsightContext } from "./context";

/**
 * Demo-mode real-world context, keyed by the Today card it belongs to. It lets
 * the fused, cited world-context layer render without a session or a network
 * call. Live mode replaces these with a call to /api/context.
 */
export const DEMO_CONTEXT: Record<string, InsightContext> = {
  n1: {
    summary:
      "IT services firms are leaning into AI rather than being replaced by it: Accenture and Cognizant both flagged rising demand for AI integration work in recent results, while analysts debate whether that revenue is durable or a one-off build-out.",
    citations: [
      { title: "Reuters — IT services AI demand", url: "https://www.reuters.com/technology/" },
      { title: "CNBC — Accenture results", url: "https://www.cnbc.com/technology/" },
    ],
    asOf: "2026-08-07",
    via: "demo",
  },
  n2: {
    summary:
      "Solana network activity has cooled from its peak, with commentary pointing to lower fee revenue even as total value locked stays elevated — the same split the numbers show.",
    citations: [
      { title: "CoinDesk — Solana activity", url: "https://www.coindesk.com/" },
      { title: "The Block — Solana fees", url: "https://www.theblock.co/" },
    ],
    asOf: "2026-08-07",
    via: "demo",
  },
  n3: {
    summary:
      "Recent moves in this name have drawn attention for running ahead of the fundamentals, with several commentators noting the rally lacks analyst upgrades or fresh positive news behind it.",
    citations: [{ title: "MarketWatch", url: "https://www.marketwatch.com/" }],
    asOf: "2026-08-07",
    via: "demo",
  },
};
