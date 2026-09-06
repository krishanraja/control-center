import { describe, expect, it } from "vitest";
import demo from "../../demo/spend.json";
import { original, usd2, usdRound } from "./format";
import { parseSpendDay, type SpendItem } from "./schema";
import { detectSubscriptions, groupByMonth, issues, matchesSearch, monthTotals, movers, normalMonth, reconcile, thisMonth } from "./summarise";

function item(partial: Partial<SpendItem> & Pick<SpendItem, "occurredOn" | "merchant" | "amountUsd">): SpendItem {
  return {
    source: "bills_sheet",
    sourceRef: `${partial.merchant}-${partial.occurredOn}`,
    merchantKey: partial.merchant.toLowerCase().replace(/\s+/g, "-"),
    registryKey: null,
    item: null,
    category: null,
    scope: "personal",
    scopeReason: "default",
    kind: "charge",
    amount: partial.amountUsd,
    currency: "USD",
    fxRate: 1,
    fxDate: null,
    fxSource: null,
    evidence: null,
    accountEmail: null,
    confidence: null,
    invoiceRef: null,
    supersededByRef: null,
    possibleDuplicateOfRef: null,
    flags: [],
    syncedAt: "2026-09-04T00:00:00Z",
    ...partial,
  };
}

const asOf = "2026-09-04";

describe("month totals", () => {
  const items = [
    item({ occurredOn: "2026-09-02", merchant: "Sample AI", amountUsd: 300, scope: "os" }),
    item({ occurredOn: "2026-08-02", merchant: "Sample AI", amountUsd: 200, scope: "os" }),
    item({ occurredOn: "2026-07-02", merchant: "Sample AI", amountUsd: 200, scope: "os" }),
    item({ occurredOn: "2026-06-02", merchant: "Sample AI", amountUsd: 200, scope: "os" }),
    item({ occurredOn: "2026-08-20", merchant: "Streamflix", amountUsd: 15 }),
    item({ occurredOn: "2026-08-22", merchant: "Streamflix", amountUsd: 15, kind: "refund" }),
    item({ occurredOn: "2026-08-25", merchant: "Inbox copy", amountUsd: 999, supersededByRef: "bills_sheet:x" }),
    item({ occurredOn: "2026-08-26", merchant: "No price", amountUsd: null }),
    item({ occurredOn: "2026-08-13", merchant: "Home loan", amountUsd: 2000, scope: "property" }),
  ];

  it("zero-fills thirteen months and nets refunds, ignoring superseded and unpriced rows", () => {
    const totals = monthTotals(items, asOf);
    expect(totals).toHaveLength(13);
    expect(totals[0].month).toBe("2025-09");
    expect(totals.at(-1)).toMatchObject({ month: "2026-09", total: 300, os: 300, personal: 0, property: 0, count: 1 });
    const august = totals.find((row) => row.month === "2026-08");
    expect(august).toMatchObject({ total: 2200, os: 200, personal: 0, property: 2000, count: 4 });
  });

  it("calls a normal month the mean of the last three full months, or nothing", () => {
    const totals = monthTotals(items, asOf);
    expect(normalMonth(totals, asOf)).toMatchObject({ total: 866.67, os: 200, property: 666.67, monthsUsed: 3 });
    expect(normalMonth(monthTotals([items[0]], asOf), asOf)).toBeNull();
    expect(thisMonth(totals, asOf).total).toBe(300);
  });

  it("ranks movers by the size of the change against the prior three months", () => {
    const top = movers(items, asOf);
    expect(top[0]).toMatchObject({ merchantKey: "home-loan", current: 0, normal: 666.67, delta: -666.67 });
    expect(top[1]).toMatchObject({ merchantKey: "sample-ai", current: 300, normal: 200, delta: 100 });
    expect(top.find((row) => row.merchantKey === "streamflix")).toBeUndefined();
  });

  it("counts the rows that need a human", () => {
    expect(issues([...items, item({ occurredOn: "2026-08-01", merchant: "Dup", amountUsd: 1, flags: ["possible_duplicate", "sheet_duplicate"] })]))
      .toEqual({ unpriced: 1, possibleDuplicates: 1, sheetDuplicates: 1, superseded: 1, needsReview: 0 });
  });

  it("groups newest month first and searches across fields", () => {
    const groups = groupByMonth(items);
    expect(groups[0].month).toBe("2026-09");
    expect(groups[1].total).toBe(2200);
    expect(matchesSearch(items[0], "sample")).toBe(true);
    expect(matchesSearch(items[0], "loan")).toBe(false);
    expect(matchesSearch(items[0], "")).toBe(true);
  });
});

describe("subscriptions", () => {
  it("finds monthly and yearly rhythms, drops lapsed ones, and marks a single stated yearly bill thin", () => {
    const monthly = ["2026-06-05", "2026-07-05", "2026-08-04", "2026-09-03"].map((date) => item({ occurredOn: date, merchant: "Streamflix", amountUsd: 15 }));
    const lapsed = ["2026-01-05", "2026-02-05", "2026-03-06"].map((date) => item({ occurredOn: date, merchant: "Old Gym", amountUsd: 40 }));
    const yearly = ["2025-10-03", "2026-10-03"].map((date) => item({ occurredOn: date, merchant: "Domain Names Co", amountUsd: 36 }));
    const thin = [item({ occurredOn: "2026-05-01", merchant: "Backup Vault", amountUsd: 120, item: "Annual plan" })];
    const oneOff = [item({ occurredOn: "2026-08-01", merchant: "Skyhop Airlines", amountUsd: 400 })];
    const property = ["2026-06-13", "2026-07-13", "2026-08-13"].map((date) => item({ occurredOn: date, merchant: "Home loan", amountUsd: 2000, scope: "property" }));
    const found = detectSubscriptions([...monthly, ...lapsed, ...yearly, ...thin, ...oneOff, ...property], "2026-10-10");
    expect(found.active.map((row) => row.merchantKey)).toEqual(["streamflix", "backup-vault", "domain-names-co"]);
    expect(found.active.find((row) => row.merchantKey === "streamflix")).toMatchObject({ cadence: "monthly", monthlyEquivalentUsd: 15, nextExpectedOn: "2026-10-03", confidence: "good" });
    expect(found.active.find((row) => row.merchantKey === "domain-names-co")).toMatchObject({ cadence: "yearly", monthlyEquivalentUsd: 3 });
    expect(found.active.find((row) => row.merchantKey === "backup-vault")).toMatchObject({ cadence: "yearly", confidence: "thin", monthlyEquivalentUsd: 10 });
    expect(found.lapsed.map((row) => row.merchantKey)).toEqual(["old-gym"]);
  });
});

describe("reconciliation and formatting", () => {
  it("compares operating-system bills with the meter for the current month without adding them", () => {
    const items = [
      item({ occurredOn: "2026-09-02", merchant: "Sample AI", amountUsd: 300, scope: "os" }),
      item({ occurredOn: "2026-09-03", merchant: "Streamflix", amountUsd: 15 }),
    ];
    const result = reconcile(items, [{ day: "2026-09-01", usd: 40 }, { day: "2026-09-02", usd: 60.5 }, { day: "2026-08-31", usd: 99 }], asOf);
    expect(result).toEqual({ month: "2026-09", invoicedOs: 300, metered: 100.5, gap: 199.5 });
  });

  it("formats dollars and original currencies", () => {
    expect(usd2(1234.5)).toBe("$1,234.50");
    expect(usd2(-3)).toBe("-$3.00");
    expect(usdRound(1234.5)).toBe("$1,235");
    expect(original(41.8, "AUD")).toBe("A$41.80");
    expect(original(12, "EUR")).toBe("€12.00");
    expect(original(9.99, "GBP")).toBe("£9.99");
    expect(original(20, "USD")).toBe("US$20.00");
    expect(original(5, null)).toBe("5.00 (no currency)");
    expect(original(null, "AUD")).toBe("AUD n/a");
  });

  it("parses the demo fixture", () => {
    const day = parseSpendDay(demo);
    expect(day.items.length).toBeGreaterThan(100);
    expect(day.meter.units).toHaveLength(3);
    expect(day.cycles[0].state).toBe("over_prepaid");
  });
});
