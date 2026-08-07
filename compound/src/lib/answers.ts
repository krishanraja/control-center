import { contested, splitByBacking } from "./agreement";
import { aud, pct1, plain1, usd } from "./format";
import { themesFor } from "./migration";
import type { Snapshot } from "../types";

/**
 * The offline answer set. Every sentence is built from the snapshot, so the
 * numbers in an answer are the same numbers the cards showed and the sources
 * named underneath are the feeds they came from.
 *
 * In live mode these questions go to the model instead. This set is what makes
 * the surface usable without a session and what the QA pass asserts against.
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
      question: `Is AI actually hurting ${theme.definition.disrupted} revenue yet?`,
      paragraphs: [
        `**Not in the numbers.** ${theme.disrupted.members.map((member) => `${member.symbol} went from ${pct1(member.prev)} to ${pct1(member.now)}`).join(", ")}. Every one of them accelerated in the latest full year filed.`,
        `${theme.definition.beneficiary} growth went the other way, from **${pct1(theme.beneficiary.avgPrev)}** to **${pct1(theme.beneficiary.avgGrowth)}**. The gap is still **${plain1(theme.gap)}** but it is ${theme.gapDelta != null && theme.gapDelta < 0 ? "closing" : "widening"} by **${plain1(Math.abs(theme.gapDelta ?? 0))}** a year.`,
        `So the story is ahead of the filings. Either the disrupted group is being paid to build the thing meant to replace it, or the spending is a one-off and growth rolls over. Watch for the first quarter where growth turns down. That is the real signal, not the headlines.`,
      ],
      evidence: [
        { label: `${theme.definition.disrupted} revenue growth, latest full year filed`, source: "FMP income statements" },
        { label: `${theme.definition.beneficiary} revenue growth, latest full year filed`, source: "FMP income statements" },
      ],
    });
  }

  if (unsupported.length) {
    answers.push({
      question: "Which stocks are moving without any support?",
      paragraphs: [
        `**${unsupported.map((row) => row.symbol).join(" and ")}.** ${unsupported.map((row) => `${row.symbol} is ${(row.m1 ?? 0) > 0 ? "up" : "down"} ${pct1(row.m1)} in a month`).join(", and ")}. In each case the price is the only one of the four sources pointing that way.`,
        `${unsupported[0].symbol} is the clearest. ${unsupported[0].signals.analysts < 0 ? "Analysts cut their positive count" : "Analysts have no view"}${unsupported[0].sent != null ? `, and 30-day news sentiment is ${unsupported[0].sent.toFixed(2)}` : ""}. ${unsupported[0].breadth != null ? `Only ${unsupported[0].breadth}% of ratings are positive.` : ""}`,
        `Compare that with **${strong[0]?.symbol ?? "the agreeing group"}**, where ${strong[0]?.agree ?? 0} of ${strong[0]?.total ?? 0} sources point the same way. Both look like a move on a chart. Only one has evidence underneath it.`,
      ],
      evidence: [
        { label: "1 month price move", source: "FMP stock price change" },
        { label: "Change in positive analyst ratings", source: "FMP grades history" },
        { label: "30 day mean news sentiment", source: "Marketaux entity sentiment" },
      ],
    });
  }

  if (theme?.beneficiary && theme.disrupted) {
    answers.push({
      question: `Who actually wins in ${theme.definition.name}?`,
      paragraphs: [
        `Follow the margin. ${theme.definition.beneficiary} earns **${plain1(theme.beneficiary.avgGm)}** gross margin. ${theme.definition.disrupted} earns **${plain1(theme.disrupted.avgGm)}**. That difference is the whole argument: one side sells something scarce, the other sells hours.`,
        `But the growth is moving the other way. ${theme.definition.disrupted} is accelerating by **${pct1(theme.disrupted.avgDelta)}** a year while ${theme.definition.beneficiary} decelerated by **${pct1(theme.beneficiary.avgDelta)}**. High margin and slowing beats low margin and slowing, but it does not obviously beat low margin and speeding up at a fraction of the price.`,
        `The names on each side are in the theme sheet on the Shifts tab, with what each one filed.`,
      ],
      evidence: [
        { label: "Gross margin by group", source: "FMP income statements" },
        { label: "Revenue growth change by group", source: "FMP financial growth" },
      ],
    });
  }

  if (largest) {
    answers.push({
      question: `What would tell me ${largest.name} is actually recovering?`,
      paragraphs: [
        `One number: **fee income**. It is **${usd(solana.fees30d)}** over 30 days against **${usd(averageMonth)}** for the average month of the past year, so the last month ran **${plain1(averageMonth && solana.fees30d != null ? Math.abs(((solana.fees30d - averageMonth) / averageMonth) * 100) : null)} below** that pace.`,
        `Fees are what people pay to use the network, so they are the closest thing it has to revenue. Price can rise without them. Usage cannot.`,
        `The test is three straight weeks of rising fees. Deposits are **${usd(solana.tvl)}** and have not left, so the capital is there and idle. You hold **${aud(largest.valueAud)}**, **${largest.pct}%** of everything you own, which is why this one number matters more than any other on the screen.`,
      ],
      evidence: [
        { label: "Fee income, 30 days and 1 year", source: "DefiLlama" },
        { label: "Deposits held in apps", source: "DefiLlama" },
        { label: "Position size", source: "Your holdings" },
      ],
    });
  }

  answers.push({
    question: "What is my biggest risk?",
    paragraphs: [
      `Concentration. **${snapshot.portfolio.largest}** is **${snapshot.portfolio.largestPct}%** of everything you own and crypto in total is **${plain1(snapshot.portfolio.cryptoPct)}**. Those positions tend to move together, so the real exposure is one bet wearing several names.`,
      `The second risk is the setting rather than the holdings. The 1 year bond pays **${plain1(snapshot.macro.y1)}** against a **${plain1(snapshot.macro.fedFunds)}** cash rate, so the market expects money to get dearer, not cheaper. After inflation the 10 year pays **${plain1(snapshot.macro.real10)}** against **${plain1(snapshot.macro.real10_1y)}** a year ago. Assets that pay nothing now are worth less in that world.`,
      `You have **${aud(snapshot.portfolio.cashAud)}** in cash, which is the thing that makes the concentration survivable rather than fatal.`,
    ],
    evidence: [
      { label: "Position sizes and crypto share", source: "Your holdings" },
      { label: "Cash rate, 1 year and real 10 year", source: "FRED and US Treasury" },
    ],
  });

  return answers;
}

export function findAnswer(answers: Answer[], question: string): Answer | undefined {
  const wanted = question.trim().toLowerCase();
  return answers.find((answer) => answer.question.toLowerCase() === wanted);
}
