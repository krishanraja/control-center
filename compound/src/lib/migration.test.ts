import { describe, expect, it } from "vitest";
import { fixture } from "../test/snapshot-fixture";
import { THEMES, groupStats, groupsIn, migrationFor, themesFor } from "./migration";

describe("groupStats", () => {
  it("averages the trajectory, not the level", () => {
    const stats = groupStats(fixture.accel, "IT services");
    expect(stats).not.toBeNull();
    expect(stats?.members).toHaveLength(4);
    // CTSH +5.0, IBM +6.2, ACN +6.2, INFY +0.7
    expect(stats?.avgDelta).toBeCloseTo(4.525, 3);
    expect(stats?.accelerating).toBe(true);
  });

  it("returns null for a group the snapshot does not carry", () => {
    expect(groupStats(fixture.accel, "Shipping")).toBeNull();
  });

  it("skips missing gross margins instead of counting them as zero", () => {
    const stats = groupStats(
      [
        { symbol: "A", group: "G", now: 10, prev: 5, delta: 5, gm: 60, year: "2026" },
        { symbol: "B", group: "G", now: 10, prev: 5, delta: 5, gm: null, year: "2026" },
      ],
      "G",
    );
    expect(stats?.avgGm).toBe(60);
  });
});

describe("migrationFor", () => {
  const result = migrationFor(fixture.accel, THEMES[0]);

  it("reports the gap and that it is closing", () => {
    // NVDA +65.5 against IT services averaging +6.6.
    expect(result.gap).toBeCloseTo(58.9, 1);
    expect(result.gapDelta).toBeLessThan(0);
  });

  it("flags the divergence between the story and the filed revenue", () => {
    expect(result.diverged).toBe(true);
    expect(result.verdict).toContain("The story is not in the numbers");
  });

  it("agrees with the story when the disrupted group is slowing", () => {
    const slowing = migrationFor(
      [
        { symbol: "WIN", group: "AI chips", now: 65, prev: 40, delta: 25, gm: 71, year: "2026" },
        { symbol: "LOSE", group: "IT services", now: 1, prev: 8, delta: -7, gm: 30, year: "2026" },
      ],
      THEMES[0],
    );
    expect(slowing.diverged).toBe(false);
    expect(slowing.verdict).toContain("The numbers agree with the story");
  });

  it("says so rather than guessing when a side is missing", () => {
    const missing = migrationFor([{ symbol: "WIN", group: "AI chips", now: 65, prev: 40, delta: 25, gm: 71, year: "2026" }], THEMES[0]);
    expect(missing.gap).toBeNull();
    expect(missing.verdict).toBe("Not enough reported sales to test this yet.");
  });
});

describe("themesFor", () => {
  it("only offers themes with both sides present in the snapshot", () => {
    const present = new Set(groupsIn(fixture.accel));
    for (const theme of themesFor(fixture)) {
      expect(present.has(theme.definition.beneficiary)).toBe(true);
      expect(present.has(theme.definition.disrupted)).toBe(true);
      expect(theme.beneficiary).not.toBeNull();
      expect(theme.disrupted).not.toBeNull();
    }
  });

  it("finds both declared themes in the current run", () => {
    expect(themesFor(fixture).map((theme) => theme.definition.id)).toEqual(["ai-services", "ai-research"]);
  });
});
