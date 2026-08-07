import { describe, expect, it } from "vitest";
import { fixture } from "../test/snapshot-fixture";
import { compoundChange, momentum, peRank, quadrantCounts, quadrantOf } from "./industries";

describe("momentum", () => {
  it("compounds daily percentage changes rather than adding them", () => {
    expect(compoundChange([10, 10], 2)).toBeCloseTo(21, 6);
    expect(compoundChange([-50, 100], 2)).toBeCloseTo(0, 6);
  });

  it("reads the last N rows only", () => {
    const series = Array.from({ length: 80 }, (_, index) => (index < 17 ? 100 : 0));
    expect(compoundChange(series, 63)).toBeCloseTo(0, 6);
  });

  it("returns zero for an empty series instead of failing", () => {
    expect(compoundChange([], 21)).toBe(0);
    expect(momentum([])).toEqual({ r1m: 0, r3m: 0, accel: 0 });
  });

  it("measures acceleration against a third of the 3-month move", () => {
    const series = Array.from({ length: 63 }, () => 1);
    const result = momentum(series);
    expect(result.accel).toBeCloseTo(result.r1m - result.r3m / 3, 6);
  });
});

describe("peRank", () => {
  const all = [5, 12, 20, 40, 90, 250, -3, null];

  it("ignores P/Es outside the usable band", () => {
    expect(peRank(250, all)).toBeNull();
    expect(peRank(-3, all)).toBeNull();
    expect(peRank(null, all)).toBeNull();
  });

  it("ranks against the usable band only", () => {
    expect(peRank(5, all)).toBe(0);
    expect(peRank(90, all)).toBe(80);
  });
});

describe("quadrantOf", () => {
  it("never lets acceleration alone qualify as a rise", () => {
    // Ranked near last and down over three months, but bouncing hard.
    expect(quadrantOf({ r3m: -55.7, peRank: 10, accel: 40 })).toBe("turning");
    expect(quadrantOf({ r3m: -55.7, peRank: 10, accel: 4 })).toBe("avoid");
  });

  it("splits a rise by valuation", () => {
    expect(quadrantOf({ r3m: 9.8, peRank: 48, accel: 15 })).toBe("early");
    expect(quadrantOf({ r3m: 9.8, peRank: 51, accel: 15 })).toBe("crowded");
  });

  it("does not treat a missing P/E rank as cheap", () => {
    // `null < 50` is true in JavaScript. Without the guard every industry
    // with no P/E lands in "rising, still cheap".
    expect(quadrantOf({ r3m: 4.9, peRank: null, accel: -7.1 })).toBe("crowded");
  });
});

describe("against the committed snapshot", () => {
  it("reproduces every stored quadrant", () => {
    const wrong = fixture.industries.filter((row) => quadrantOf(row) !== row.quadrant);
    expect(wrong.map((row) => row.industry)).toEqual([]);
  });

  it("matches the documented split", () => {
    expect(quadrantCounts(fixture.industries)).toEqual({ early: 27, crowded: 23, turning: 17, avoid: 56 });
  });

  it("recomputes stored momentum from the stored series", () => {
    // The series ships rounded to three decimals, so compounding 63 of them
    // lands within a couple of hundredths of a point rather than exactly.
    const tolerance = 0.02;
    for (const row of fixture.industries) {
      if (row.series.length < 63) continue;
      const result = momentum(row.series);
      expect(Math.abs(result.r3m - row.r3m), row.industry).toBeLessThan(tolerance);
      expect(Math.abs(result.r1m - row.r1m), row.industry).toBeLessThan(tolerance);
      expect(Math.abs(result.accel - row.accel), row.industry).toBeLessThan(tolerance);
    }
  });
});
