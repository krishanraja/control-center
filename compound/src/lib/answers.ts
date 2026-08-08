import { contested, splitByBacking } from "./agreement";
import { aud, pct1, plain1, usd } from "./format";
import { themesFor } from "./migration";
import type { Snapshot } from "../types";

/**
 * The answers that work without a live session. Every sentence is built from
 * the snapshot, so the numbers in an answer are the numbers the cards showed
 * and the sources named underneath are the feeds they came from.
 *
 * In live mode these questions go to the model instead. This set is what makes
 * the surface usable without a session and what the QA pass checks against.
 */

export interface Answer {
  question: string;
  paragraphs: string[];
  evidence: Array<{ label: string; source: string }>;
}

export function buildAnswers(snapshot: Snapshot): Answer[] {
  const themes = themesFor(snapshot);
  const theme = themes.find((entry) => entry.diverged) ?? themes[0];
  const { strong, alone } = splitByBacking(snapshot.agreement);
  const unsupported = alone.filter((row) => contested(row).priceAlone).slice(0, 2);
  const solana = snapshot.solana;
  const averageMonth = solana.fees1y != null ? solana.fees1y / 12 : null;
  const largest = snapshot.holdings.find((holding) => holding.symbol === snapshot.portfolio.largest);
  const answers: Answer[] = [];

  if (theme?.beneficiary && theme.disrupted) {
    answers.push({
      question: `Is AI actually hurting ${theme.definition.disrupted} yet?`,
      paragraphs: [
        `**Not in the numbers.** ${theme.disrupted.members.map((member) => `${member.symbol} went from ${pct1(member.prev)} to ${pct1(member.now)}`).join(", ")}. Every one of them sold more, faster, in the last full year they reported.`,
        `${theme.definition.beneficiary} went the other way, from **${pct1(theme.beneficiary.avgPrev)}** down to **${pct1(theme.beneficiary.avgGrowth)}**. One side is still growing **${plain1(theme.gap)}** faster than the other, but that gap is ${theme.gapDelta != null && theme.gapDelta < 0 ? "closing" : "getting wider"} by **${plain1(Math.abs(theme.gapDelta ?? 0))}** a year.`,
        `So the story is running ahead of the accounts. Either the losing side is getting paid to build the very thing meant to replace it, or the spending is a one off and sales drop back. Watch for the first three months where sales growth turns down. That is the real signal, not the headlines.`,
      ],
      evidence: [
        { label: `${theme.definition.disrupted} sales growth, last full year reported`, source: "Company accounts through FMP" },
        { label: `${theme.definition.beneficiary} sales growth, last full year reported`, source: "Company accounts through FMP" },
      ],
    });
  }

  if (unsupported.length) {
    answers.push({
      question: "Which stocks are moving with nothing behind them?",
      paragraphs: [
        `**${unsupported.map((row) => row.symbol).join(" and ")}.** ${unsupported.map((row) => `${row.symbol} is ${(row.m1 ?? 0) > 0 ? "up" : "down"} ${pct1(row.m1)} in a month`).join(", and ")}. In both cases the price is the only one of the four checks pointing that way.`,
        `${unsupported[0].symbol} is the clearest. ${unsupported[0].signals.analysts < 0 ? "Fewer experts are positive than were before" : "Experts have no view either way"}${unsupported[0].sent != null ? `, and the news over 30 days scores ${unsupported[0].sent.toFixed(2)}` : ""}. ${unsupported[0].breadth != null ? `Only ${unsupported[0].breadth}% of experts rate it a buy.` : ""}`,
        `Compare that with **${strong[0]?.symbol ?? "the ones that agree"}**, where ${strong[0]?.agree ?? 0} of ${strong[0]?.total ?? 0} checks point the same way. Both look like a move on a chart. Only one of them has anything underneath it.`,
      ],
      evidence: [
        { label: "How the price moved over one month", source: "FMP price history" },
        { label: "Whether more experts turned positive", source: "FMP ratings history" },
        { label: "How positive the news was over 30 days", source: "Marketaux news scores" },
      ],
    });
  }

  if (theme?.beneficiary && theme.disrupted) {
    answers.push({
      question: `Who actually wins in ${theme.definition.name}?`,
      paragraphs: [
        `Follow the profit. ${theme.definition.beneficiary} keeps **${plain1(theme.beneficiary.avgGm)}** of every dollar it sells. ${theme.definition.disrupted} keeps **${plain1(theme.disrupted.avgGm)}**. That difference is the whole argument: one side sells something hard to copy, the other sells hours of people's time.`,
        `The growth is moving the other way though. ${theme.definition.disrupted} is speeding up by **${pct1(theme.disrupted.avgDelta)}** a year while ${theme.definition.beneficiary} is slowing by **${pct1(theme.beneficiary.avgDelta)}**. Keeping more profit while slowing beats keeping less while slowing. It does not obviously beat keeping less while speeding up at a fraction of the price.`,
        `The companies on each side are on the Trends screen, with what each one reported.`,
      ],
      evidence: [
        { label: "Profit kept per dollar of sales, by side", source: "Company accounts through FMP" },
        { label: "Change in sales growth, by side", source: "Company accounts through FMP" },
      ],
    });
  }

  if (largest) {
    answers.push({
      question: `What would tell me ${largest.name} is actually recovering?`,
      paragraphs: [
        `One number: **fee income**. It came to **${usd(solana.fees30d)}** over 30 days against **${usd(averageMonth)}** in a normal month of the past year, so the last month ran **${plain1(averageMonth && solana.fees30d != null ? Math.abs(((solana.fees30d - averageMonth) / averageMonth) * 100) : null)} below** that pace.`,
        `Fees are what people pay to use the network, so they are the closest thing it has to sales. The price can go up without them. Actual use cannot.`,
        `The test is three weeks of rising fees in a row. There is **${usd(solana.tvl)}** sitting in its apps and it has not left, so the money is there and doing nothing. You own **${aud(largest.valueAud)}** of it, **${largest.pct}%** of everything you have, which is why this one number matters more than anything else on these screens.`,
      ],
      evidence: [
        { label: "Fee income, 30 days and one year", source: "DefiLlama" },
        { label: "Money parked in its apps", source: "DefiLlama" },
        { label: "How much of it you own", source: "What you entered" },
      ],
    });
  }

  answers.push({
    question: "What is my biggest risk?",
    paragraphs: [
      `Having too much in one thing. **${snapshot.portfolio.largest}** is **${snapshot.portfolio.largestPct}%** of everything you own, and crypto altogether is **${plain1(snapshot.portfolio.cryptoPct)}**. Those coins tend to rise and fall together, so it is really one bet wearing several names.`,
      `The second risk is the setting rather than the holdings. Lending to the US government for a year pays **${plain1(snapshot.macro.y1)}** while cash pays **${plain1(snapshot.macro.fedFunds)}**, so the market expects borrowing to get dearer, not cheaper. Over 10 years it pays **${plain1(snapshot.macro.real10)}** once price rises are taken out, against **${plain1(snapshot.macro.real10_1y)}** a year ago. Anything that pays you nothing today is worth less in that world.`,
      `You have **${aud(snapshot.portfolio.cashAud)}** in cash, which is the thing that makes all of the above survivable instead of fatal.`,
    ],
    evidence: [
      { label: "What you own and how much is crypto", source: "What you entered" },
      { label: "What cash and government loans pay", source: "US Federal Reserve data and the US Treasury" },
    ],
  });

  return answers;
}

export function findAnswer(answers: Answer[], question: string): Answer | undefined {
  const wanted = question.trim().toLowerCase();
  return answers.find((answer) => answer.question.toLowerCase() === wanted);
}
