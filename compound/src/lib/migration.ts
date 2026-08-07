import type { AccelRow, Snapshot } from "../types";

/**
 * Value migration. Compare the trajectory of revenue growth between the group a
 * story says wins and the group it says loses, rather than comparing levels.
 *
 * The finding that drives the Now tab:
 *   AI infrastructure   NVDA  +65.5% growth (was +114.2%)  gross margin 71.1%
 *   IT services         CTSH   +7.0% (was +2.0%)   IBM +7.6% (was +1.4%)
 *                       ACN    +7.4% (was +1.2%)   INFY +4.6% (was +3.9%)
 *
 * The gap is 59 percentage points but it is closing, not widening. The narrative
 * says AI is eating IT services and the filed revenue says all three
 * accelerated. That contradiction is the product working, so the engine reports
 * it as a first-class result instead of hiding it behind an average.
 */

export interface GroupStats {
  group: string;
  members: AccelRow[];
  /** Mean revenue growth in the latest filed year. */
  avgGrowth: number;
  /** Mean revenue growth in the year before it. */
  avgPrev: number;
  /** Mean change in growth rate, in percentage points. */
  avgDelta: number;
  avgGm: number | null;
  accelerating: boolean;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  /** The group the story says wins. */
  beneficiary: string;
  /** The group the story says loses. */
  disrupted: string;
  /** The claim being tested, in one sentence. */
  claim: string;
}

export interface ThemeMigration {
  definition: ThemeDefinition;
  beneficiary: GroupStats | null;
  disrupted: GroupStats | null;
  /** Growth gap in percentage points, beneficiary less disrupted. */
  gap: number | null;
  /** Whether that gap is opening or closing, in percentage points per year. */
  gapDelta: number | null;
  /** True when the story and the filed revenue point in opposite directions. */
  diverged: boolean;
  verdict: string;
}

export function groupStats(rows: AccelRow[], group: string): GroupStats | null {
  const members = rows.filter((row) => row.group === group);
  if (!members.length) return null;
  const mean = (pick: (row: AccelRow) => number | null): number | null => {
    const values = members.map(pick).filter((value): value is number => value != null && Number.isFinite(value));
    return values.length ? values.reduce((carry, value) => carry + value, 0) / values.length : null;
  };
  const avgGrowth = mean((row) => row.now) ?? 0;
  const avgPrev = mean((row) => row.prev) ?? 0;
  const avgDelta = mean((row) => row.delta) ?? 0;
  return {
    group,
    members: [...members].sort((a, b) => b.now - a.now),
    avgGrowth,
    avgPrev,
    avgDelta,
    avgGm: mean((row) => row.gm),
    accelerating: avgDelta > 0,
  };
}

export function groupsIn(rows: AccelRow[]): string[] {
  return [...new Set(rows.map((row) => row.group))];
}

export function migrationFor(rows: AccelRow[], definition: ThemeDefinition): ThemeMigration {
  const beneficiary = groupStats(rows, definition.beneficiary);
  const disrupted = groupStats(rows, definition.disrupted);

  const gap = beneficiary && disrupted ? beneficiary.avgGrowth - disrupted.avgGrowth : null;
  const gapDelta = beneficiary && disrupted ? beneficiary.avgDelta - disrupted.avgDelta : null;

  // The story says the disrupted group declines. Filed revenue accelerating is
  // the divergence worth flagging, whichever way the beneficiary is going.
  const diverged = Boolean(disrupted?.accelerating);

  let verdict = "Not enough filed revenue to test this yet.";
  if (beneficiary && disrupted) {
    if (diverged && gapDelta != null && gapDelta < 0) {
      verdict = `The story is not in the numbers. ${definition.disrupted} revenue is speeding up and the gap is closing by ${Math.abs(gapDelta).toFixed(1)} points a year.`;
    } else if (diverged) {
      verdict = `${definition.disrupted} revenue is still speeding up, so the disruption has not reached the filings.`;
    } else if (gapDelta != null && gapDelta > 0) {
      verdict = `The numbers agree with the story. The gap is widening by ${gapDelta.toFixed(1)} points a year.`;
    } else {
      verdict = `${definition.disrupted} revenue is slowing, which is the first thing the story predicts.`;
    }
  }

  return { definition, beneficiary, disrupted, gap, gapDelta, diverged, verdict };
}

/**
 * Themes are declared once and computed the same way. Adding a group to
 * `accel` in the pipeline is enough to add a theme here.
 */
export const THEMES: ThemeDefinition[] = [
  {
    id: "ai-services",
    name: "AI against IT services",
    beneficiary: "AI chips",
    disrupted: "IT services",
    claim: "AI eats consultants and IT outsourcers.",
  },
  {
    id: "ai-research",
    name: "AI against research and advisory",
    beneficiary: "AI chips",
    disrupted: "Research",
    claim: "Models answer the questions people used to pay analysts for.",
  },
];

export function themesFor(snapshot: Snapshot): ThemeMigration[] {
  const present = new Set(groupsIn(snapshot.accel));
  return THEMES
    .filter((theme) => present.has(theme.beneficiary) && present.has(theme.disrupted))
    .map((theme) => migrationFor(snapshot.accel, theme));
}
