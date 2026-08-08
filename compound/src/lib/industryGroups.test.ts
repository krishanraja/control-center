import { describe, expect, it } from "vitest";
import { buildGroups, groupOf } from "./industryGroups";

describe("groupOf", () => {
  it("splits FMP names on the family delimiter", () => {
    expect(groupOf("Software - Infrastructure")).toBe("Software");
    expect(groupOf("REIT - Retail")).toBe("REIT");
    expect(groupOf("Apparel - Retail")).toBe("Apparel");
    expect(groupOf("Drug Manufacturers - General")).toBe("Drug Manufacturers");
  });

  it("rolls up families that share a prefix instead of a delimiter", () => {
    expect(groupOf("Oil & Gas Midstream")).toBe("Oil & Gas");
    expect(groupOf("Oil & Gas Refining & Marketing")).toBe("Oil & Gas");
  });

  it("gathers scattered names into a named family", () => {
    expect(groupOf("Regulated Electric")).toBe("Utilities");
    expect(groupOf("Renewable Utilities")).toBe("Utilities");
    expect(groupOf("Steel")).toBe("Metals & Mining");
    expect(groupOf("Gold")).toBe("Metals & Mining");
  });

  it("leaves a standalone industry as its own group", () => {
    expect(groupOf("Semiconductors")).toBe("Semiconductors");
    expect(groupOf("Restaurants")).toBe("Restaurants");
  });
});

describe("buildGroups", () => {
  it("collects members, counts companies and sorts both levels", () => {
    const groups = buildGroups([
      { industry: "Software - Services", names: 1 },
      { industry: "Software - Infrastructure", names: 9 },
      { industry: "Semiconductors", names: 9 },
      { industry: "Software - Application", names: 1 },
    ]);

    expect(groups.map((group) => group.group)).toEqual(["Semiconductors", "Software"]);
    const software = groups.find((group) => group.group === "Software");
    expect(software?.members.map((member) => member.industry)).toEqual([
      "Software - Application",
      "Software - Infrastructure",
      "Software - Services",
    ]);
    expect(software?.companies).toBe(11);
  });
});
