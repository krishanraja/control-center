import { describe, expect, it } from "vitest";
import { fixture } from "../test/snapshot-fixture";
import {
  buildGroups,
  FMP_INDUSTRY_TO_SECTOR,
  groupOf,
  KNOWN_FMP_INDUSTRIES,
  SECTOR_ORDER,
} from "./industryGroups";

describe("industry taxonomy", () => {
  it("keeps the stable live explorer exhaustive during a partial capture", () => {
    expect(KNOWN_FMP_INDUSTRIES).toHaveLength(123);
    expect(new Set(KNOWN_FMP_INDUSTRIES).size).toBe(123);
  });

  it("maps every real snapshot industry to one known sector", () => {
    const industries = fixture.industries.map((row) => row.industry);
    expect(industries).toHaveLength(123);
    expect(new Set(industries).size).toBe(123);
    expect(Object.keys(FMP_INDUSTRY_TO_SECTOR)).toHaveLength(123);

    const groups = buildGroups(industries.map((industry) => ({ industry, names: 0 })));
    expect(groups.map((group) => group.group)).toEqual(SECTOR_ORDER);
    expect(groups.some((group) => group.group === "Other")).toBe(false);
    expect(groups.flatMap((group) => group.members.map((member) => member.industry))).toHaveLength(123);
  });

  it("has the expected exhaustive group counts and no singleton sectors", () => {
    const groups = buildGroups(fixture.industries.map((row) => ({ industry: row.industry, names: 0 })));
    expect(Object.fromEntries(groups.map((group) => [group.group, group.members.length]))).toEqual({
      Technology: 10,
      Financials: 14,
      Healthcare: 13,
      Energy: 7,
      "Consumer Cyclical": 19,
      "Consumer Defensive": 9,
      Industrials: 21,
      Materials: 10,
      "Real Estate": 10,
      Utilities: 3,
      "Communication Services": 7,
    });
    expect(groups.every((group) => group.members.length > 1)).toBe(true);
  });

  it("places representative FMP industries in their coarse sectors", () => {
    expect(groupOf("Software - Infrastructure")).toBe("Technology");
    expect(groupOf("REIT - Retail")).toBe("Real Estate");
    expect(groupOf("Restaurants")).toBe("Consumer Cyclical");
    expect(groupOf("Steel")).toBe("Materials");
    expect(groupOf("Regulated Electric")).toBe("Utilities");
  });

  it("contains future unknown values in one final group", () => {
    expect(groupOf("A future FMP industry")).toBe("Other");
  });

  it("sorts members and counts active companies", () => {
    const groups = buildGroups([
      { industry: "Software - Services", names: 1 },
      { industry: "Software - Infrastructure", names: 9 },
      { industry: "Semiconductors", names: 2 },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe("Technology");
    expect(groups[0].members.map((member) => member.industry)).toEqual([
      "Semiconductors",
      "Software - Infrastructure",
      "Software - Services",
    ]);
    expect(groups[0].companies).toBe(12);
  });
});
