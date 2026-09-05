import { describe, expect, it } from "vitest";
import { composeSpendDay, cyclesFrom, meterFrom, spendQueries } from "./spendApi.js";

describe("spend API composition", () => {
  it("maps database columns to browser keys and coerces numerics", () => {
    const day = composeSpendDay({
      items: [{ source: "bills_sheet", source_ref: "abcd1234abcd1234", occurred_on: "2026-09-02", merchant: "Sample AI", merchant_key: "sample-ai", scope: "os", scope_reason: "registry", kind: "charge", amount: "200.00", currency: "USD", amount_usd: "200", fx_rate: "1", flags: null, synced_at: "2026-09-04T20:45:00Z" }],
      merchants: [{ merchant_key: "sample-ai", display_name: "Sample AI", registry_key: "sample-ai", scope_default: "os", included_usd: "29", overage_trigger_usd: "20", cycle_usd: "83", cycle_start: "2026-08-15", cycle_end: "2026-09-15", item_count: "3" }],
      overrides: [{ merchant_key: "demo-cloud", scope: "os" }],
      meter: [
        { provider: "apify", unit_kind: "actor", unit_key: "a1", day: "2026-09-03", bucket: "", unit_label: "Scraper", usd: "1.5", runs: 2, failed: 0, units: 10 },
        { provider: "apify", unit_kind: "actor", unit_key: "a1", day: "2026-08-10", bucket: "", unit_label: "Scraper", usd: "2.5", runs: 1, failed: 1, units: 5 },
      ],
      fx: [{ rate_on: "2026-09-03", currency: "USD", per_aud: "0.66" }, { rate_on: "2026-09-02", currency: "USD", per_aud: "0.65" }],
      run: { run_on: "2026-09-04", status: "complete", finished_at: null, provider_results: { coverage: [{ provider: "Bills sheet", status: "available" }], dedupe: { exact: "3", tier1: 10, tier2: 1 } } },
    }, { now: "2026-09-04T21:00:00.000Z" });
    expect(day.items[0].amountUsd).toBe(200);
    expect(day.items[0].flags).toEqual([]);
    expect(day.merchants[0].itemCount).toBe(3);
    expect(day.overrides[0].scope).toBe("os");
    expect(day.meter.units[0]).toMatchObject({ label: "Scraper", usd: 4, usd7d: 1.5, runs: 3, failed: 1 });
    expect(day.meter.days).toHaveLength(2);
    expect(day.meter.silent).toEqual(["anthropic", "n8n"]);
    expect(day.fxAsOf).toEqual([{ currency: "USD", rateOn: "2026-09-03", perAud: 0.66 }]);
    expect(day.cycles[0]).toMatchObject({ key: "sample-ai", state: "charging_early", overUsd: 54, headroomUsd: -54 });
    expect(day.lastRun.dedupe).toEqual({ exact: 3, tier1: 10, tier2: 1 });
    expect(day.lastRun.limitation).toBeNull();
  });

  it("walks the cycle ladder from within to charging early", () => {
    const base = { display_name: "X", merchant_key: "x", included_usd: 29, overage_trigger_usd: 20 };
    expect(cyclesFrom([{ ...base, cycle_usd: 10 }])[0].state).toBe("within");
    expect(cyclesFrom([{ ...base, cycle_usd: 35 }])[0].state).toBe("over_prepaid");
    expect(cyclesFrom([{ ...base, cycle_usd: 46 }])[0].state).toBe("near_trigger");
    expect(cyclesFrom([{ ...base, cycle_usd: 60 }])[0].state).toBe("charging_early");
    expect(cyclesFrom([{ ...base, cycle_usd: null, balance: 4, balance_unit: "usd" }])[0]).toMatchObject({ state: "within", cycleUsd: 25 });
    expect(cyclesFrom([{ ...base, cycle_usd: null }])[0].state).toBe("unknown");
    expect(cyclesFrom([{ ...base, included_usd: null }])).toEqual([]);
  });

  it("keeps the twenty biggest meter units", () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({ provider: "anthropic", unit_kind: "model", unit_key: `m${index}`, day: "2026-09-01", bucket: "", usd: index }));
    const meter = meterFrom(rows, "2026-09-04", "2026-08-06");
    expect(meter.units).toHaveLength(20);
    expect(meter.units[0].unitKey).toBe("m29");
  });

  it("scopes every query to spend tables in the compound schema", () => {
    const queries = spendQueries({ asOf: "2026-09-04" });
    expect(queries.since).toBe("2025-09-01");
    expect(queries.meterSince).toBe("2026-08-06");
    expect(queries.items).toContain("hidden=is.false");
    for (const key of ["items", "merchants", "overrides", "meter", "fx", "run"]) expect(queries[key].startsWith("spend_")).toBe(true);
    expect(queries.cash).toBe("cash_balances?select=as_of,amount_usd&order=as_of.desc&limit=1");
  });

  it("surfaces the latest cash balance, or null before one is entered", () => {
    const base = { items: [], merchants: [], overrides: [], meter: [], fx: [], run: null };
    expect(composeSpendDay({ ...base, cash: { as_of: "2026-09-03", amount_usd: "42000" } }, { now: "2026-09-04T21:00:00.000Z" }).cash)
      .toEqual({ asOf: "2026-09-03", amountUsd: 42000 });
    expect(composeSpendDay({ ...base, cash: null }, { now: "2026-09-04T21:00:00.000Z" }).cash).toBeNull();
    expect(composeSpendDay(base, { now: "2026-09-04T21:00:00.000Z" }).cash).toBeNull();
    expect(composeSpendDay({ ...base, cash: { as_of: "2026-09-03", amount_usd: "not a number" } }, { now: "2026-09-04T21:00:00.000Z" }).cash).toBeNull();
  });
});
