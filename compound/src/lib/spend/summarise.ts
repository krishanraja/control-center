import type { MeterDay, SpendItem, SpendScope } from "./schema";

/**
 * The maths behind the spend tab. Everything here is pure and works on the
 * validated day. Totals count only rows that are priced and not superseded;
 * refunds subtract. The meter is never part of a total.
 */

export const SCOPES: SpendScope[] = ["personal", "os", "property"];

export function countable(item: SpendItem): boolean {
  return item.supersededByRef == null && item.amountUsd != null;
}

export function signedUsd(item: SpendItem): number {
  const value = item.amountUsd ?? 0;
  return item.kind === "refund" ? -value : value;
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const value = new Date(`${month}-01T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + delta);
  return value.toISOString().slice(0, 7);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface MonthTotal {
  month: string;
  total: number;
  personal: number;
  os: number;
  property: number;
  count: number;
}

/** Oldest first, zero-filled, ending at the month of `asOf`. */
export function monthTotals(items: SpendItem[], asOf: string, months = 13): MonthTotal[] {
  const current = monthOf(asOf);
  const rows = new Map<string, MonthTotal>();
  for (let index = months - 1; index >= 0; index -= 1) {
    const month = shiftMonth(current, -index);
    rows.set(month, { month, total: 0, personal: 0, os: 0, property: 0, count: 0 });
  }
  for (const item of items) {
    if (!countable(item)) continue;
    const row = rows.get(monthOf(item.occurredOn));
    if (!row) continue;
    const value = signedUsd(item);
    row.total = round2(row.total + value);
    row[item.scope] = round2(row[item.scope] + value);
    row.count += 1;
  }
  return [...rows.values()];
}

export interface NormalMonth {
  total: number;
  personal: number;
  os: number;
  property: number;
  monthsUsed: number;
}

/** The mean of the three full months before the current one. Null until one full month exists. */
export function normalMonth(totals: MonthTotal[], asOf: string): NormalMonth | null {
  const current = monthOf(asOf);
  const prior = totals.filter((row) => row.month < current && row.count > 0).slice(-3);
  if (prior.length === 0) return null;
  const mean = (key: "total" | SpendScope) => round2(prior.reduce((sum, row) => sum + row[key], 0) / prior.length);
  return { total: mean("total"), personal: mean("personal"), os: mean("os"), property: mean("property"), monthsUsed: prior.length };
}

export function thisMonth(totals: MonthTotal[], asOf: string): MonthTotal {
  const current = monthOf(asOf);
  return totals.find((row) => row.month === current) ?? { month: current, total: 0, personal: 0, os: 0, property: 0, count: 0 };
}

export interface Mover {
  merchantKey: string;
  name: string;
  scope: SpendScope;
  current: number;
  normal: number;
  delta: number;
}

/** Merchants whose current month differs most from their mean over the prior three full months. */
export function movers(items: SpendItem[], asOf: string, limit = 5): Mover[] {
  const current = monthOf(asOf);
  const window = new Set([shiftMonth(current, -1), shiftMonth(current, -2), shiftMonth(current, -3)]);
  const byMerchant = new Map<string, { name: string; scope: SpendScope; current: number; prior: number }>();
  for (const item of items) {
    if (!countable(item)) continue;
    const month = monthOf(item.occurredOn);
    if (month !== current && !window.has(month)) continue;
    const entry = byMerchant.get(item.merchantKey) ?? { name: item.merchant, scope: item.scope, current: 0, prior: 0 };
    if (month === current) entry.current = round2(entry.current + signedUsd(item));
    else entry.prior = round2(entry.prior + signedUsd(item));
    byMerchant.set(item.merchantKey, entry);
  }
  return [...byMerchant.entries()]
    .map(([merchantKey, entry]) => {
      const normal = round2(entry.prior / 3);
      return { merchantKey, name: entry.name, scope: entry.scope, current: entry.current, normal, delta: round2(entry.current - normal) };
    })
    .filter((row) => Math.abs(row.delta) >= 1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export interface Subscription {
  merchantKey: string;
  name: string;
  scope: SpendScope;
  cadence: "monthly" | "yearly";
  monthlyEquivalentUsd: number;
  lastPaidOn: string;
  lastAmountUsd: number;
  nextExpectedOn: string;
  charges: number;
  confidence: "good" | "thin";
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function addDays(iso: string, days: number): string {
  const value = new Date(`${iso}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Recurring merchants: monthly from a steady rhythm of gaps, yearly from a long gap or a stated cadence. */
export function detectSubscriptions(items: SpendItem[], asOf: string): { active: Subscription[]; lapsed: Subscription[] } {
  const groups = new Map<string, SpendItem[]>();
  for (const item of items) {
    if (!countable(item) || item.kind !== "charge" || item.scope === "property") continue;
    const group = groups.get(item.merchantKey) ?? [];
    group.push(item);
    groups.set(item.merchantKey, group);
  }
  const active: Subscription[] = [];
  const lapsed: Subscription[] = [];
  for (const [merchantKey, group] of groups) {
    const charges = [...group].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
    const dates = [...new Set(charges.map((item) => item.occurredOn))];
    const gaps = dates.slice(1).map((date, index) => daysBetween(dates[index], date));
    const last = charges.at(-1)!;
    const lastAmount = last.amountUsd ?? 0;
    let found: Pick<Subscription, "cadence" | "monthlyEquivalentUsd" | "nextExpectedOn" | "confidence"> | null = null;
    if (dates.length >= 3 && gaps.filter((gap) => gap >= 25 && gap <= 35).length >= Math.ceil(gaps.length * 2 / 3)) {
      const recent = charges.slice(-3).map((item) => item.amountUsd ?? 0);
      found = { cadence: "monthly", monthlyEquivalentUsd: round2(median(recent)), nextExpectedOn: addDays(last.occurredOn, 30), confidence: "good" };
    } else if (gaps.some((gap) => gap >= 350 && gap <= 380)) {
      found = { cadence: "yearly", monthlyEquivalentUsd: round2(lastAmount / 12), nextExpectedOn: addDays(last.occurredOn, 365), confidence: "good" };
    } else if (dates.length === 1 && /annual|yearly|per year/i.test(last.item ?? "")) {
      found = { cadence: "yearly", monthlyEquivalentUsd: round2(lastAmount / 12), nextExpectedOn: addDays(last.occurredOn, 365), confidence: "thin" };
    }
    if (!found) continue;
    const row: Subscription = {
      merchantKey,
      name: last.merchant,
      scope: last.scope,
      lastPaidOn: last.occurredOn,
      lastAmountUsd: round2(lastAmount),
      charges: charges.length,
      ...found,
    };
    const staleAfter = found.cadence === "monthly" ? 45 : 400;
    if (daysBetween(last.occurredOn, asOf) <= staleAfter) active.push(row);
    else lapsed.push(row);
  }
  const byCost = (a: Subscription, b: Subscription) => b.monthlyEquivalentUsd - a.monthlyEquivalentUsd || a.name.localeCompare(b.name);
  return { active: active.sort(byCost), lapsed: lapsed.sort(byCost) };
}

export interface Reconciliation {
  month: string;
  invoicedOs: number;
  metered: number;
  gap: number;
}

/** Bills for the operating system this month against what the meter saw. Two views of one thing, never added. */
export function reconcile(items: SpendItem[], meterDays: MeterDay[], asOf: string): Reconciliation {
  const month = monthOf(asOf);
  const invoicedOs = round2(items.filter((item) => countable(item) && item.scope === "os" && monthOf(item.occurredOn) === month).reduce((sum, item) => sum + signedUsd(item), 0));
  const metered = round2(meterDays.filter((day) => monthOf(day.day) === month).reduce((sum, day) => sum + day.usd, 0));
  return { month, invoicedOs, metered, gap: round2(invoicedOs - metered) };
}

export interface Issues {
  unpriced: number;
  possibleDuplicates: number;
  sheetDuplicates: number;
  superseded: number;
  needsReview: number;
}

export function issues(items: SpendItem[]): Issues {
  return {
    unpriced: items.filter((item) => item.supersededByRef == null && item.amountUsd == null).length,
    possibleDuplicates: items.filter((item) => item.supersededByRef == null && item.flags.includes("possible_duplicate")).length,
    sheetDuplicates: items.filter((item) => item.flags.includes("sheet_duplicate")).length,
    superseded: items.filter((item) => item.supersededByRef != null).length,
    needsReview: items.filter((item) => item.supersededByRef == null && item.flags.includes("needs_review")).length,
  };
}

export interface MonthGroup {
  month: string;
  total: number;
  items: SpendItem[];
}

/** Newest month first, newest item first inside each month. */
export function groupByMonth(items: SpendItem[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const item of [...items].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || a.merchant.localeCompare(b.merchant))) {
    const month = monthOf(item.occurredOn);
    const group = groups.get(month) ?? { month, total: 0, items: [] };
    group.items.push(item);
    if (countable(item)) group.total = round2(group.total + signedUsd(item));
    groups.set(month, group);
  }
  return [...groups.values()].sort((a, b) => b.month.localeCompare(a.month));
}

export function matchesSearch(item: SpendItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [item.merchant, item.item, item.category, item.accountEmail, item.invoiceRef, item.currency].some((field) => (field ?? "").toLowerCase().includes(needle));
}
