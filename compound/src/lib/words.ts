import type { Quadrant, SignalName, TabKey } from "../types";

/**
 * Every word the reader sees is written for someone who has never bought a
 * share. Finance terms are either replaced here or explained the first time
 * they appear. Keeping the shared ones in one file is what makes the reading
 * level checkable: `npm run check:language` reads this file and the screens.
 *
 * Rules the copy follows:
 *   say what happened, why it matters, and what would change it
 *   short sentences, ordinary words, no term left unexplained
 *   never dress a guess up as a fact
 */

/** The four independent checks behind every stock. Named, not lettered. */
export const CHECK_NAME: Record<SignalName, string> = {
  price: "Price",
  analysts: "Experts",
  news: "News",
  revenue: "Sales",
};

/** What each check actually measures, in one plain line. */
export const CHECK_MEANS: Record<SignalName, string> = {
  price: "how the price moved over one month",
  analysts: "whether experts turned more positive",
  news: "how positive the news was over 30 days",
  revenue: "how fast sales grew last year",
};

/** Terms that would otherwise need a search. Used wherever the term appears. */
export const EXPLAIN = {
  checks: "Four checks look at each stock: the price, what experts say, what the news says, and how fast sales grew. Green means it points up, red means down, grey means it has nothing to say.",
  fees: "Fees are what people pay to use the network. People pay them, so they are the closest thing crypto has to sales.",
  parked: "money people have left sitting in its apps",
  peRatio: "how many years of profit you pay for one share",
  margin: "how much profit is left out of every dollar of sales",
  realRate: "what a loan pays after you take price rises out of it",
  spread: "the extra interest risky borrowers have to pay",
  nerves: "a score for how nervous the market is",
} as const;

/** Section names. The bar gets one word, the rail gets the full name. */
export const SECTION_SHORT: Record<TabKey, string> = {
  now: "Today",
  shifts: "Trends",
  stocks: "Stocks",
  mine: "Money",
  ask: "Ask",
};

export const SECTION_LONG: Record<TabKey, string> = {
  now: "Today",
  shifts: "Big trends",
  stocks: "Stocks",
  mine: "My money",
  ask: "Ask a question",
};

/** One line on what each section is for. The rail has room to say it. */
export const SECTION_BLURB: Record<TabKey, string> = {
  now: "What changed since yesterday",
  shifts: "What is pushing prices around",
  stocks: "Which names have real backing",
  mine: "What you own and what it is doing",
  ask: "Answers built from today's numbers",
};

export const SECTION_ORDER: TabKey[] = ["now", "shifts", "stocks", "mine", "ask"];

/** The four groups an industry can land in. Direction first, price second. */
export const GROUP_NAME: Record<Quadrant, string> = {
  early: "Going up, still cheap",
  crowded: "Going up, already pricey",
  turning: "Going down, but slowing",
  avoid: "Going down, no let up",
};

export const GROUP_NOTE: Record<Quadrant, string> = {
  early: "Up over three months and still cheaper than most. This is where digging pays off.",
  crowded: "Up over three months, but you pay more for it than for most. The easy money has gone.",
  turning: "Still down over three months, but the fall is slowing down.",
  avoid: "Down over three months, and it shows no sign of slowing.",
};

/** The five stages a shift moves through. The feed names them tersely. */
const PLAIN_STAGE: Record<string, string> = {
  "Nothing yet": "Nothing yet",
  "Story only": "Talk only",
  "Numbers move": "Numbers move",
  Repriced: "Price catches up",
  Settled: "Winners are clear",
};

const PLAIN_STAGE_DESC: Record<string, string> = {
  "No visible effect": "Nothing has actually changed yet.",
  "Headlines, no numbers": "Plenty of headlines, but the sales figures have not moved.",
  "Growth or margin shifts": "Sales or profit have started to move.",
  "Valuation resets": "The price has caught up with the story.",
  "Winners and losers clear": "It is obvious now who won and who lost.",
};

export function plainStage(name: string): string {
  return PLAIN_STAGE[name] ?? name;
}

export function plainStageDesc(desc: string): string {
  return PLAIN_STAGE_DESC[desc] ?? desc;
}
