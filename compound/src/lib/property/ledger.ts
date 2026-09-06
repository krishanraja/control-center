import { splitRepayment, type ScheduleRow } from "./loan";
import type { LedgerCategory, LedgerRow } from "./schema";

/**
 * Turns the mirrored ledger into the figures the tab shows. Loan repayments
 * are split with the amortisation schedule so interest counts as a cost and
 * paydown counts as money moved into what is owned, never as a loss.
 */

export const CATEGORY_LABEL: Record<LedgerCategory, string> = {
  rent_received: "Rent received",
  management_fee: "Agent fees",
  loan_repayment: "Loan repayments",
  council_rates: "Council rates",
  body_corporate: "Body corporate",
  water: "Water",
  insurance: "Insurance",
  purchase_cost: "Buying costs",
  legal: "Legal",
  repairs: "Repairs",
  other: "Other",
};

export const HOLDING_CATEGORIES: LedgerCategory[] = ["management_fee", "council_rates", "body_corporate", "water", "insurance", "repairs", "other"];
export const ONE_OFF_CATEGORIES: LedgerCategory[] = ["purchase_cost", "legal"];

export interface CategoryTotal {
  category: LedgerCategory;
  label: string;
  total: number;
  count: number;
}

export interface LedgerSummary {
  from: string | null;
  to: string | null;
  rentReceived: number;
  holdingCosts: number;
  oneOffCosts: number;
  loanRepayments: number;
  interestPaid: number;
  principalPaid: number;
  /** Everything paid out minus everything received. Loan paydown is included because it left the account. */
  netOutOfPocket: number;
  /** Net out of pocket with paydown added back: the true running cost of owning. */
  netCostExcludingPaydown: number;
  confirmedShare: number;
  gaps: LedgerRow[];
  byCategory: CategoryTotal[];
  trailingYearByCategory: CategoryTotal[];
  cumulative: Array<{ date: string; net: number }>;
  fastestRising: { category: LedgerCategory; label: string; first: number; latest: number; firstOn: string; latestOn: string } | null;
  lastSyncedAt: string | null;
}

function totals(rows: LedgerRow[]): CategoryTotal[] {
  const map = new Map<LedgerCategory, CategoryTotal>();
  for (const row of rows) {
    if (row.direction !== "out" || row.amountAud == null) continue;
    const entry = map.get(row.category) ?? { category: row.category, label: CATEGORY_LABEL[row.category], total: 0, count: 0 };
    entry.total += row.amountAud;
    entry.count += 1;
    map.set(row.category, entry);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function yearBefore(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year - 1, month - 1, day)).toISOString().slice(0, 10);
}

export function summariseLedger(rows: LedgerRow[], schedule: ScheduleRow[], asOf: string): LedgerSummary {
  const dated = [...rows].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
  const money = dated.filter((row) => (row.direction === "in" || row.direction === "out") && row.amountAud != null);
  let rentReceived = 0;
  let holdingCosts = 0;
  let oneOffCosts = 0;
  let loanRepayments = 0;
  let interestPaid = 0;
  let principalPaid = 0;
  let confirmed = 0;
  const cumulative: Array<{ date: string; net: number }> = [];
  let running = 0;
  for (const row of money) {
    const amount = row.amountAud as number;
    if (row.direction === "in") {
      rentReceived += amount;
      running += amount;
    } else {
      running -= amount;
      if (row.category === "loan_repayment") {
        loanRepayments += amount;
        const split = splitRepayment(schedule, row.occurredOn, amount);
        interestPaid += split.interest;
        principalPaid += split.principal;
      } else if (ONE_OFF_CATEGORIES.includes(row.category)) {
        oneOffCosts += amount;
      } else if (row.category !== "rent_received") {
        holdingCosts += amount;
      }
    }
    if ((row.confidence ?? "").toLowerCase().startsWith("confirmed")) confirmed += 1;
    const last = cumulative.at(-1);
    if (last && last.date === row.occurredOn) last.net = running;
    else cumulative.push({ date: row.occurredOn, net: running });
  }
  const netOutOfPocket = -running;
  const since = yearBefore(asOf);

  // Fastest rising recurring cost: compare the first and latest charge of each holding category with at least three charges.
  let fastestRising: LedgerSummary["fastestRising"] = null;
  for (const category of HOLDING_CATEGORIES) {
    const charges = money.filter((row) => row.direction === "out" && row.category === category && row.category !== "management_fee");
    if (charges.length < 3) continue;
    const first = charges[0];
    const latest = charges.at(-1)!;
    const rise = (latest.amountAud as number) / (first.amountAud as number) - 1;
    if (rise > 0.2 && (!fastestRising || rise > fastestRising.latest / fastestRising.first - 1)) {
      fastestRising = {
        category,
        label: CATEGORY_LABEL[category],
        first: first.amountAud as number,
        latest: latest.amountAud as number,
        firstOn: first.occurredOn,
        latestOn: latest.occurredOn,
      };
    }
  }

  return {
    from: dated[0]?.occurredOn ?? null,
    to: dated.at(-1)?.occurredOn ?? null,
    rentReceived: round2(rentReceived),
    holdingCosts: round2(holdingCosts),
    oneOffCosts: round2(oneOffCosts),
    loanRepayments: round2(loanRepayments),
    interestPaid: round2(interestPaid),
    principalPaid: round2(principalPaid),
    netOutOfPocket: round2(netOutOfPocket),
    netCostExcludingPaydown: round2(netOutOfPocket - principalPaid),
    confirmedShare: money.length ? confirmed / money.length : 0,
    gaps: dated.filter((row) => row.direction === "gap"),
    byCategory: totals(money),
    trailingYearByCategory: totals(money.filter((row) => row.occurredOn > since)),
    cumulative,
    fastestRising,
    lastSyncedAt: rows.reduce<string | null>((carry, row) => (carry == null || row.syncedAt > carry ? row.syncedAt : carry), null),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
