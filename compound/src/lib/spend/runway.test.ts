import { describe, expect, it } from "vitest";
import type { SpendItem } from "./schema";
import { dayMonth, monthlyBurn, monthsLabel, RUNWAY_EMPTY, runwayFacts, runwayMonths, runwaySentence } from "./runway";

function item(partial: Partial<SpendItem> & Pick<SpendItem, "occurredOn" | "amountUsd">): SpendItem {
  return {
    source: "bills_sheet",
    sourceRef: `${partial.occurredOn}-${partial.amountUsd ?? "none"}`,
    merchant: "Sample",
    merchantKey: "sample",
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

const AS_OF = "2026-09-04";

describe("monthly burn", () => {
  it("adds the trailing ninety days and divides by three", () => {
    const items = [
      item({ occurredOn: "2026-09-01", amountUsd: 300 }),
      item({ occurredOn: "2026-08-01", amountUsd: 300 }),
      item({ occurredOn: "2026-07-01", amountUsd: 300 }),
      item({ occurredOn: "2026-06-07", amountUsd: 300 }),
    ];
    expect(monthlyBurn(items, AS_OF)).toBe(400);
  });

  it("counts exactly ninety days ending on the day itself", () => {
    // 7 June to 4 September inclusive is ninety days; 6 June is the ninety-first.
    const items = [
      item({ occurredOn: "2026-06-07", amountUsd: 90 }),
      item({ occurredOn: "2026-06-06", amountUsd: 900 }),
      item({ occurredOn: "2026-09-04", amountUsd: 60 }),
      item({ occurredOn: "2026-09-05", amountUsd: 900 }),
    ];
    expect(monthlyBurn(items, AS_OF)).toBe(50);
  });

  it("leaves out unpriced rows and rows a sheet copy supersedes", () => {
    const items = [
      item({ occurredOn: "2026-08-20", amountUsd: 300 }),
      item({ occurredOn: "2026-08-21", amountUsd: null, flags: ["unpriced"] }),
      item({ occurredOn: "2026-08-22", amountUsd: 3000, supersededByRef: "bills_sheet:abc" }),
    ];
    expect(monthlyBurn(items, AS_OF)).toBe(100);
  });

  it("takes refunds off and never goes below zero", () => {
    expect(monthlyBurn([
      item({ occurredOn: "2026-08-20", amountUsd: 300 }),
      item({ occurredOn: "2026-08-21", amountUsd: 30, kind: "refund" }),
    ], AS_OF)).toBe(90);
    expect(monthlyBurn([item({ occurredOn: "2026-08-21", amountUsd: 30, kind: "refund" })], AS_OF)).toBe(0);
  });
});

describe("runway months", () => {
  it("divides cash by burn", () => {
    expect(runwayMonths(42000, 6000)).toBe(7);
  });

  it("is null when nothing goes out, rather than infinite", () => {
    expect(runwayMonths(42000, 0)).toBeNull();
    expect(runwayMonths(42000, -5)).toBeNull();
    expect(runwayMonths(Number.NaN, 100)).toBeNull();
  });

  it("keeps one decimal under ten months and whole numbers above", () => {
    expect(monthsLabel(7.04)).toBe("7.0");
    expect(monthsLabel(7.05)).toBe("7.1");
    expect(monthsLabel(9.96)).toBe("10.0");
    expect(monthsLabel(10.4)).toBe("10");
    expect(monthsLabel(1234.6)).toBe("1,235");
  });
});

describe("the sentence", () => {
  it("reads calmly with the cash, the burn and the months", () => {
    expect(runwaySentence({ asOf: "2026-09-03", amountUsd: 42000, burn: 6000, months: 7 }))
      .toBe("Cash on hand $42,000 as of 3 September. About $6,000 goes out a month. That is about 7.0 months.");
  });

  it("says so when there is no burn to measure", () => {
    expect(runwaySentence({ asOf: "2026-09-03", amountUsd: 42000, burn: 0, months: null }))
      .toBe("Cash on hand $42,000 as of 3 September. Nothing priced went out in the last three months, so there is no monthly figure yet.");
  });

  it("has an empty state that points at Settings", () => {
    expect(RUNWAY_EMPTY).toBe("No cash balance entered yet. Add one in Settings.");
  });

  it("builds the facts from a day and a balance", () => {
    const facts = runwayFacts([item({ occurredOn: "2026-08-20", amountUsd: 900 })], AS_OF, { asOf: "2026-09-03", amountUsd: 1500 });
    expect(facts).toEqual({ asOf: "2026-09-03", amountUsd: 1500, burn: 300, months: 5 });
    expect(dayMonth("2026-12-25")).toBe("25 December");
  });

  it("uses no dashes anywhere", () => {
    const text = [
      runwaySentence({ asOf: "2026-09-03", amountUsd: 42000, burn: 6000, months: 7 }),
      runwaySentence({ asOf: "2026-09-03", amountUsd: 42000, burn: 0, months: null }),
      RUNWAY_EMPTY,
    ].join(" ");
    expect(text).not.toMatch(/[–—]/);
  });
});
