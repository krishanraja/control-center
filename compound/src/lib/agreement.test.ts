import { describe, expect, it } from "vitest";
import { fixture } from "../test/snapshot-fixture";
import type { AgreementRow, Signals } from "../types";
import {
  agreementLabel,
  backed,
  contested,
  scoreAnalysts,
  scoreNews,
  scorePrice,
  scoreRevenue,
  splitByBacking,
  tally,
  whatItWouldTake,
} from "./agreement";

function row(signals: Partial<Signals>, overrides: Partial<AgreementRow> = {}): AgreementRow {
  const filled: Signals = { price: 0, analysts: 0, news: 0, revenue: 0, ...signals };
  const counted = tally(filled);
  return {
    symbol: "TEST",
    name: "Test Company",
    industry: "Testing",
    signals: filled,
    direction: counted.direction,
    agree: counted.agree,
    total: counted.total,
    m1: null,
    pe: null,
    sent: null,
    rev: null,
    breadth: null,
    ...overrides,
  };
}

describe("signal thresholds", () => {
  it("scores the price move on the documented bands", () => {
    expect(scorePrice(2.1)).toBe(1);
    expect(scorePrice(2)).toBe(0);
    expect(scorePrice(-2)).toBe(0);
    expect(scorePrice(-2.1)).toBe(-1);
    expect(scorePrice(null)).toBe(0);
  });

  it("scores analyst breadth against the oldest sample in the window", () => {
    expect(scoreAnalysts(62, 58)).toBe(1);
    expect(scoreAnalysts(58, 62)).toBe(-1);
    expect(scoreAnalysts(58, 58)).toBe(0);
    expect(scoreAnalysts(58, null)).toBe(0);
  });

  it("scores news on the asymmetric sentiment bands", () => {
    expect(scoreNews(0.16)).toBe(1);
    expect(scoreNews(0.15)).toBe(0);
    expect(scoreNews(-0.05)).toBe(0);
    expect(scoreNews(-0.06)).toBe(-1);
    expect(scoreNews(null)).toBe(0);
  });

  it("scores revenue growth on the documented bands", () => {
    expect(scoreRevenue(5.1)).toBe(1);
    expect(scoreRevenue(5)).toBe(0);
    expect(scoreRevenue(0)).toBe(0);
    expect(scoreRevenue(-0.1)).toBe(-1);
  });
});

describe("tally", () => {
  it("takes the direction from the larger side and counts only non-zero votes", () => {
    expect(tally({ price: 1, analysts: 1, news: 1, revenue: 0 })).toEqual({ direction: "up", agree: 3, total: 3 });
    expect(tally({ price: 1, analysts: -1, news: -1, revenue: 0 })).toEqual({ direction: "down", agree: 2, total: 3 });
    expect(tally({ price: 1, analysts: -1, news: 0, revenue: 0 })).toEqual({ direction: "split", agree: 1, total: 2 });
    expect(tally({ price: 0, analysts: 0, news: 0, revenue: 0 })).toEqual({ direction: "split", agree: 0, total: 0 });
  });
});

describe("contested", () => {
  it("flags a price moving against the other sources", () => {
    const state = contested(row({ price: 1, analysts: -1, news: -1 }));
    expect(state.priceAlone).toBe(true);
    expect(agreementLabel(row({ price: 1, analysts: -1, news: -1 }))).toBe("price disagrees");
  });

  it("flags a price moving with nothing else behind it", () => {
    const state = contested(row({ price: 1 }));
    expect(state.noBackers).toBe(true);
    expect(agreementLabel(row({ price: 1 }))).toBe("price only");
  });

  it("flags an even split", () => {
    expect(agreementLabel(row({ analysts: 1, news: -1 }))).toBe("sources disagree");
  });

  it("does not call a single vote agreement", () => {
    // The mock shipped "1 of 1 agree" on rows the grouping filed under
    // "price is on its own". One rule now decides both.
    expect(agreementLabel(row({ analysts: 1 }))).toBe("one source only");
    expect(backed(row({ analysts: 1 }))).toBe(false);
  });

  it("says so when no source has an opinion", () => {
    expect(agreementLabel(row({}))).toBe("no signal yet");
  });

  it("counts a real majority", () => {
    expect(agreementLabel(row({ price: 1, analysts: 1, news: 1 }))).toBe("3 of 3 agree");
    expect(backed(row({ price: 1, analysts: 1, news: 1 }))).toBe(true);
  });

  it("treats a missing row as undecidable rather than agreed", () => {
    expect(contested(undefined).split).toBe(true);
    expect(agreementLabel(undefined)).toBe("no data");
  });
});

describe("the label and the grouping stay in sync", () => {
  const { strong, alone } = splitByBacking(fixture.agreement);

  it("covers every row exactly once", () => {
    expect(strong.length + alone.length).toBe(fixture.agreement.length);
    expect(new Set([...strong, ...alone].map((entry) => entry.symbol)).size).toBe(fixture.agreement.length);
  });

  it("never labels a row in the disagreeing group as agreeing", () => {
    for (const entry of alone) {
      expect(agreementLabel(entry), `${entry.symbol} sits under "price is on its own"`).not.toMatch(/^\d+ of \d+ agree$/);
    }
  });

  it("always labels a row in the agreeing group with its majority", () => {
    for (const entry of strong) {
      expect(agreementLabel(entry), entry.symbol).toMatch(/^\d+ of \d+ agree$/);
      expect(entry.agree).toBeGreaterThanOrEqual(2);
      expect(entry.direction).not.toBe("split");
    }
  });

  it("puts the documented rows on the documented side", () => {
    const symbols = strong.map((entry) => entry.symbol);
    // Palantir: price, analysts and news all point the same way.
    expect(symbols).toContain("PLTR");
    // Microsoft rose while analysts cut and news turned negative.
    expect(symbols).not.toContain("MSFT");
    expect(agreementLabel(fixture.agreement.find((entry) => entry.symbol === "MSFT"))).toBe("price disagrees");
  });

  it("explains what would change every reading", () => {
    for (const entry of fixture.agreement) {
      expect(whatItWouldTake(entry).length, entry.symbol).toBeGreaterThan(20);
    }
  });
});
