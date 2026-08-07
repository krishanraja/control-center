import type { AgreementRow, SignalName, SignalVote, Signals } from "../types";

/**
 * Agreement: four independent signals per company, each voting +1, -1 or 0.
 *
 *   price     +1 if the 1-month move > +2%, -1 if < -2%      (stock-price-change)
 *   analysts  +1 if the positive-rating count rose against    (grades-historical)
 *             the oldest sample in the window, -1 if it fell
 *   news      +1 if 30-day mean sentiment > 0.15,             (Marketaux entity
 *             -1 if < -0.05                                    sentiment_score)
 *   revenue   +1 if latest revenueGrowth > 5%, -1 if < 0      (financial-growth)
 *
 * `direction` is whichever side holds more votes, `agree` is the size of that
 * majority and `total` is the number of non-zero votes.
 *
 * ONE rule decides both the label and the grouping. They must never disagree:
 * a stock cannot read "2 of 2 agree" while sitting under "price is on its own",
 * and it cannot read "sources agree" while its dots visibly argue.
 */

export const SIGNAL_ORDER: SignalName[] = ["price", "analysts", "news", "revenue"];

export const SIGNAL_SOURCES: Record<SignalName, string> = {
  price: "1 month price move",
  analysts: "change in positive ratings",
  news: "30 day news sentiment",
  revenue: "latest filed revenue growth",
};

export interface Contested {
  /** The price moved and the majority of the other signals point the other way. */
  priceAlone: boolean;
  /** The price moved and nothing else has an opinion at all. */
  noBackers: boolean;
  /** The votes are evenly divided, so there is no direction. */
  split: boolean;
  /** Fewer than two signals agree, so there is not enough to call it. */
  thin: boolean;
}

export function scorePrice(monthMove: number | null): SignalVote {
  if (monthMove == null || !Number.isFinite(monthMove)) return 0;
  if (monthMove > 2) return 1;
  if (monthMove < -2) return -1;
  return 0;
}

export function scoreAnalysts(latestPositive: number | null, oldestPositive: number | null): SignalVote {
  if (latestPositive == null || oldestPositive == null) return 0;
  if (latestPositive > oldestPositive) return 1;
  if (latestPositive < oldestPositive) return -1;
  return 0;
}

export function scoreNews(meanSentiment: number | null): SignalVote {
  if (meanSentiment == null || !Number.isFinite(meanSentiment)) return 0;
  if (meanSentiment > 0.15) return 1;
  if (meanSentiment < -0.05) return -1;
  return 0;
}

export function scoreRevenue(revenueGrowth: number | null): SignalVote {
  if (revenueGrowth == null || !Number.isFinite(revenueGrowth)) return 0;
  if (revenueGrowth > 5) return 1;
  if (revenueGrowth < 0) return -1;
  return 0;
}

/** Roll four votes into the direction, majority size and vote count. */
export function tally(signals: Signals): { direction: AgreementRow["direction"]; agree: number; total: number } {
  const votes = SIGNAL_ORDER.map((key) => signals[key]);
  const up = votes.filter((vote) => vote > 0).length;
  const down = votes.filter((vote) => vote < 0).length;
  const total = up + down;
  if (up === down) return { direction: "split", agree: up, total };
  return up > down ? { direction: "up", agree: up, total } : { direction: "down", agree: down, total };
}

export function contested(row: AgreementRow | undefined): Contested {
  if (!row) return { priceAlone: false, noBackers: false, split: true, thin: true };

  const others = (["analysts", "news", "revenue"] as const)
    .map((key) => row.signals[key])
    .filter((vote) => vote !== 0);
  const up = others.filter((vote) => vote > 0).length;
  const down = others.filter((vote) => vote < 0).length;

  const priceAlone = row.signals.price !== 0 && others.length > 0
    && ((row.signals.price > 0 && down > up) || (row.signals.price < 0 && up > down));
  const noBackers = row.signals.price !== 0 && others.length === 0;
  // Nothing can disagree when nothing voted. A row with four zero signals is
  // encoded as "split" by the engine, but it has no disagreement to report.
  const split = row.direction === "split" && row.total > 0;
  // A single vote is not agreement. Without this the label read "1 of 1 agree"
  // for rows the grouping had already put under "price is on its own".
  const thin = !priceAlone && !noBackers && !split && row.agree < 2;

  return { priceAlone, noBackers, split, thin };
}

/** True when at least two independent signals point the same way. */
export function backed(row: AgreementRow): boolean {
  const state = contested(row);
  return !state.priceAlone && !state.noBackers && !state.split && !state.thin;
}

/** The label the meter shows. Derived from the same rule as the grouping. */
export function agreementLabel(row: AgreementRow | undefined): string {
  if (!row) return "no data";
  const state = contested(row);
  if (state.priceAlone) return "price disagrees";
  if (state.noBackers) return "price only";
  if (state.split) return "sources disagree";
  if (state.thin) return row.total === 0 ? "no signal yet" : "one source only";
  return `${row.agree} of ${row.total} agree`;
}

/** What would have to change for the reading to flip. */
export function whatItWouldTake(row: AgreementRow): string {
  const state = contested(row);
  if (state.priceAlone) {
    return "The price is moving without the other sources. Analysts turning positive, or news sentiment crossing back above zero, would make this a real move rather than a drift.";
  }
  if (state.noBackers) {
    return "Nothing except the price has an opinion. One analyst revision or a week of news coverage would give this its first piece of independent support.";
  }
  if (state.split) {
    return "Sources disagree, so this is a coin flip dressed as a trend. Wait for news and analysts to land on the same side.";
  }
  if (state.thin) {
    return "Only one source has an opinion so far. A second signal turning the same way would make this worth attention.";
  }
  if (row.agree >= 3) {
    return "Three of four sources already agree. The thing that would break it is analysts starting to cut, because ratings turn before revenue does.";
  }
  return "Two sources agree. A third turning the same way would make this worth real attention.";
}

export function splitByBacking(rows: AgreementRow[]): { strong: AgreementRow[]; alone: AgreementRow[] } {
  const strong = rows.filter(backed).sort((a, b) => (b.agree - a.agree) || ((b.m1 ?? 0) - (a.m1 ?? 0)));
  const alone = rows.filter((row) => !backed(row)).sort((a, b) => Math.abs(b.m1 ?? 0) - Math.abs(a.m1 ?? 0));
  return { strong, alone };
}

export function indexBySymbol(rows: AgreementRow[]): Record<string, AgreementRow> {
  return Object.fromEntries(rows.map((row) => [row.symbol, row]));
}
