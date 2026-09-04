import { describe, expect, it } from "vitest";
import { composePropertyDay, propertyQueries } from "./propertyApi.js";

describe("property API composition", () => {
  it("returns null without a property row", () => {
    expect(composePropertyDay({ property: null })).toBeNull();
  });

  it("maps database columns to browser keys and coerces numerics", () => {
    const day = composePropertyDay({
      property: { id: "p", slug: "s", label: "L", address: "A", suburb: "S", state: "QLD", postcode: "4101", dwelling_type: "unit", bedrooms: "2", bathrooms: 2, car_spaces: 1, purchase_price_aud: "600000", settled_on: "2024-11-14" },
      loans: [{ id: "l", lender: "B", purpose: "investment", principal_aud: "480000", term_months: 360, repayment_type: "principal_and_interest", first_repayment_on: "2024-12-13", repayment_aud: "3034.12", offset_balance_aud: "0" }],
      rates: [{ effective_from: "2024-12-13", rate_pct: "6.5", source: "settlement" }],
      rents: [],
      valuations: [{ estimated_on: "2024-11-14", method: "purchase_price", mid_aud: "600000", confidence: "high", inputs: {}, engine_version: "v" }],
      ledger: [{ occurred_on: "2025-03-08", sheet_category: "Mortgage", category: "loan_repayment", direction: "out", amount_aud: "3034.12", synced_at: "2026-09-04T00:00:00Z" }],
      observations: [],
      rankings: [{ run_on: "2026-09-01", suburb: "X", postcode: "4101", score: "61.5", rank: 1, missing: null, inputs: null }],
      cashRate: { value: "3.6", period_end: "2026-08-31" },
      run: { run_on: "2026-09-01", status: "partial", finished_at: null, provider_results: { coverage: [{ provider: "RBA", status: "available" }] } },
    });
    expect(day.property.purchasePriceAud).toBe(600000);
    expect(day.loan.repaymentAud).toBe(3034.12);
    expect(day.rates[0].ratePct).toBe(6.5);
    expect(day.valuations[0].lowAud).toBeNull();
    expect(day.ledger[0].amountAud).toBe(3034.12);
    expect(day.rankings[0].missing).toEqual([]);
    expect(day.cashRate.value).toBe(3.6);
    expect(day.lastRun.coverage).toHaveLength(1);
  });

  it("scopes every query to the property and never widens beyond the compound schema tables", () => {
    const queries = propertyQueries({ id: "abc", postcode: "4101" });
    expect(queries.ledger).toContain("property_id=eq.abc");
    expect(queries.observations).toContain("area_code.eq.4101");
    for (const query of Object.values(queries)) expect(query.startsWith("property_")).toBe(true);
  });
});
