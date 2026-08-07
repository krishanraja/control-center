import type { DashboardSnapshot, Horizon, SnapshotState } from "../types";

const base: DashboardSnapshot = {
  id: "demo-snapshot-2026-08-07",
  asOf: "2026-08-07T06:14:00-04:00",
  dateLabel: "Friday 7 August",
  horizon: "3m",
  status: "partial",
  verdict: {
    lead: "Keep the cash for now.",
    signal: "Solana needs a closer look.",
    tail: "None of the other options looks better.",
  },
  freshness: {
    title: "8 of 9 data sources up to date",
    detail: ["Updated 06:14 EDT", "News data is 19 minutes late"],
  },
  facts: [
    { label: "Most money is in", value: "Solana 42.1%" },
    { label: "Money in crypto that moves together", value: "59.4%" },
    { label: "Cash available", value: "A$4,938" },
    { label: "Needs a closer look", value: "A$17,628", attention: true },
  ],
  dial: {
    count: "1",
    label: "thing to check",
    detail: ["Next 3 months", "no clear new buy"],
  },
  review: {
    badge: "Needs a closer look",
    title: "Solana is looking weaker.",
    call: "Do not buy more yet. Keep the cash until activity on the Solana network starts recovering.",
    holdingValue: "A$17,628 in Solana",
    changed: "People paid 19% less in fees to use Solana than they did 30 days ago. The value of digital dollars held on Solana is 6% below its July high.",
    changedSource: "DefiLlama · up to date at 06:11",
    countercase: "A$4.74B is still deposited in Solana apps. Its price could recover before usage does.",
    countercaseSource: "DefiLlama + CoinGecko",
    serious: "If the value of digital dollars held on Solana falls below $14B, the reason for owning it is no longer strong. It is $15.56B now.",
    seriousSource: "Checked daily · about 10% above that level",
  },
  holdings: [
    { name: "Solana", share: "42.1%", summary: "Use of the network is falling", status: "Needs a look", attention: true, latest: "Up to date" },
    { name: "Nvidia", share: "12.7%", summary: "Most analysts still rate it positively", status: "Looks healthy", latest: "Some news data is late" },
    { name: "Symbotic", share: "13.3%", summary: "No new reason to worry", status: "Looks healthy", latest: "Up to date" },
    { name: "SoundHound", share: "9.8%", summary: "Cash could last about 21 months", status: "Watch spending", latest: "Up to date" },
  ],
  movements: [
    { label: "Getting stronger", detail: "Power infrastructure moved from 41st to 12th out of 159 parts of the market", status: "Look closer", attention: true },
    { label: "Popular but expensive", detail: "Chip companies cost about 74 times their yearly profit", status: "Pricey" },
    { label: "Worth researching", detail: "CrowdStrike moved to your research list", status: "New" },
    { label: "Still weakening", detail: "Regional bank prices continue to lose ground", status: "Skip" },
  ],
  warning: {
    feed: "NEWS DATA",
    detail: "News updates are 19 minutes late. Today's short-term view leaves that information out. Everything else is up to date.",
    status: "Late data left out",
  },
  evidence: [
    { id: "sol-fees-30d", label: "Fees paid to use Solana", detail: "down 19% over 30 days", source: "DefiLlama", checkedAt: "06:11 EDT", current: true },
    { id: "sol-stables-high", label: "Digital dollars held on Solana", detail: "6% below the July high", source: "DefiLlama", checkedAt: "06:11 EDT", current: true },
    { id: "sol-tvl", label: "Money deposited in Solana apps", detail: "A$4.74B", source: "DefiLlama", checkedAt: "06:11 EDT", current: true },
    { id: "market-news", label: "Market news", detail: "19 minutes late", source: "News feed", checkedAt: "05:55 EDT", current: false },
  ],
};

export function getDemoSnapshot(state: SnapshotState, horizon: Horizon): DashboardSnapshot {
  const snapshot = structuredClone(base);
  snapshot.horizon = horizon;
  snapshot.status = state;
  snapshot.dial.detail[0] = horizon === "1y" ? "Next 1 year" : "Next 3 months";

  if (state === "quiet") {
    snapshot.verdict = { lead: "", signal: "Nothing needs your attention today.", tail: "Keep the cash for now." };
    snapshot.freshness = { title: "All 9 data sources are up to date", detail: ["Updated 06:14 EDT", "All checks finished"] };
    snapshot.facts[3] = { label: "Needs a closer look", value: "Nothing" };
    snapshot.dial = { count: "0", label: "things to check", detail: [horizon === "1y" ? "Next 1 year" : "Next 3 months", "no clear new buy"] };
    snapshot.review = { ...snapshot.review, badge: "Nothing to check", title: "Nothing needs your attention today.", call: "Keep the cash. None of the other options looks better." };
    snapshot.warning = { feed: "ALL DATA", detail: "All checks finished and no important change crossed your limits.", status: "Everything is current" };
    snapshot.holdings[0] = { ...snapshot.holdings[0], summary: "No important change", status: "Looks healthy", attention: false };
  }

  if (state === "stale") {
    snapshot.verdict = { lead: "", signal: "I can't give a new recommendation today.", tail: "The latest complete data is 31 hours old." };
    snapshot.freshness = { title: "Data is 31 hours old", detail: ["Last complete check: Thursday 06:14", "2 important sources are missing"] };
    snapshot.facts[3] = { label: "Needs a closer look", value: "Not available" };
    snapshot.dial = { count: "?", label: "no current answer", detail: ["Last complete check", "31 hours ago"] };
    snapshot.review = { ...snapshot.review, badge: "Last complete view", title: "No new result. The price data is too old.", call: "You can still see the previous view, but there is not enough current data for a new recommendation." };
    snapshot.warning = { feed: "PRICE DATA", detail: "Price data is 31 hours old. Anything that depends on it has been left out.", status: "No current result" };
    snapshot.evidence = snapshot.evidence.map((item) => ({ ...item, current: false, checkedAt: "Thursday 06:11 EDT" }));
  }

  return snapshot;
}

export const demoAnswer = "Don't buy more Solana yet. Two signs of use are down. People paid 19% less in fees to use Solana than they did 30 days ago. The value of digital dollars held on Solana is 6% below its July high. That does not prove Solana's price will fall. It means today's data is not strong enough to support buying more. The answer changes if activity on the Solana network starts rising again.";

export function getDemoAnswer(state: SnapshotState): string {
  if (state === "stale") return "I cannot give a current answer because the latest complete COMPOUND data is 31 hours old. You can ask about the last complete view, but it should not be treated as today's position.";
  if (state === "quiet") return "Nothing important changed in today's data. None of your companies or coins crossed a limit that needs attention, and none of the other options looks clearly better. Keeping the cash is still the clearest choice for now.";
  return demoAnswer;
}
