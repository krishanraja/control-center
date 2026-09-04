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
  brief: "Brief",
  markets: "Markets",
  portfolio: "Portfolio",
  property: "Property",
  spend: "Spend",
  ask: "Ask",
};

export const SECTION_LONG: Record<TabKey, string> = {
  brief: "Today in markets",
  markets: "Markets",
  portfolio: "Portfolio",
  property: "Property",
  spend: "Spend",
  ask: "Ask COMPOUND",
};

/** One line on what each section is for. The rail has room to say it. */
export const SECTION_BLURB: Record<TabKey, string> = {
  brief: "The three signals that matter",
  markets: "Opportunities and the full market",
  portfolio: "Exposure, concentration and capacity",
  property: "What the unit is worth, its rent, its costs, and where to buy next",
  spend: "What went out, where it went, and what is normal",
  ask: "Answers across today or history",
};

export const SECTION_ORDER: TabKey[] = ["brief", "markets", "portfolio", "property", "spend", "ask"];

/** Property words. Written so nobody has to look up a lending term. */
export const PROPERTY_EXPLAIN = {
  worthNow: "our best estimate of what the unit would sell for today, with a low and high",
  ownOutright: "what is left after the loan is paid off today",
  loanShare: "the loan as a share of what the place is worth",
  rentReturn: "a year of rent as a share of the price",
  loanPaydown: "the part of each repayment that reduces the loan rather than paying interest",
  netOutOfPocket: "everything paid out so far, minus all the rent that came in",
} as const;

/** Spend words. The two rules the tab lives by, in plain sentences. */
export const SPEND_EXPLAIN = {
  normalMonth: "the average of the last three full months",
  billsAreTheMoney: "Totals come from bills and receipts only.",
  meterIsTheBreakdown: "The meter shows where the operating-system money went. It is a breakdown, never added to a total.",
} as const;

/** The four groups an industry can land in. Direction first, price second. */
export const GROUP_NAME: Record<Quadrant, string> = {
  early: "Going up, still cheap",
  crowded: "Going up, already pricey",
  turning: "Going down, but slowing",
  avoid: "Going down, no let up",
};

/** The phone track is two across, so the names have to be short enough to fit
 *  one line. The sentence under the track carries the full meaning either way. */
export const GROUP_SHORT: Record<Quadrant, string> = {
  early: "Up, still cheap",
  crowded: "Up, but pricey",
  turning: "Down, slowing",
  avoid: "Down, no let up",
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
