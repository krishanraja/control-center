import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { latestBalance, loadLatestBalance, saveBalance } from "./cash";

/** A chainable stand-in for the PostgREST builder that records every call. */
function mockClient(read: { data: unknown; error: { message: string } | null }, write: { error: { message: string } | null } = { error: null }) {
  const calls: Record<string, unknown[][]> = {};
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ["schema", "from", "select", "eq", "order", "limit"]) {
    chain[name] = vi.fn((...args: unknown[]) => {
      (calls[name] ??= []).push(args);
      return chain;
    });
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(read));
  chain.upsert = vi.fn((...args: unknown[]) => {
    (calls.upsert ??= []).push(args);
    return Promise.resolve(write);
  });
  return { client: chain as unknown as SupabaseClient, calls };
}

describe("cash on hand", () => {
  it("reads the latest row for the member from the compound schema", async () => {
    const { client, calls } = mockClient({ data: { as_of: "2026-09-03", amount_usd: "42000" }, error: null });
    await expect(loadLatestBalance(client, "user-1")).resolves.toEqual({ asOf: "2026-09-03", amountUsd: 42000 });
    expect(calls.schema).toEqual([["compound"]]);
    expect(calls.from).toEqual([["cash_balances"]]);
    expect(calls.eq).toEqual([["user_id", "user-1"]]);
    expect(calls.order).toEqual([["as_of", { ascending: false }]]);
    expect(calls.limit).toEqual([[1]]);
  });

  it("returns null before the first balance is entered", async () => {
    const { client } = mockClient({ data: null, error: null });
    await expect(loadLatestBalance(client, "user-1")).resolves.toBeNull();
  });

  it("says plainly when the read fails", async () => {
    const { client } = mockClient({ data: null, error: { message: "permission denied" } });
    await expect(loadLatestBalance(client, "user-1")).rejects.toThrow("Your cash balance could not be read: permission denied");
  });

  it("upserts on the member and the date", async () => {
    const { client, calls } = mockClient({ data: null, error: null });
    await saveBalance(client, "user-1", { asOf: "2026-09-03", amountUsd: 42000 });
    expect(calls.upsert).toEqual([[
      { user_id: "user-1", as_of: "2026-09-03", amount_usd: 42000, note: null },
      { onConflict: "user_id,as_of" },
    ]]);
  });

  it("refuses a bad date or a negative amount before touching the network", async () => {
    const { client, calls } = mockClient({ data: null, error: null });
    await expect(saveBalance(client, "user-1", { asOf: "3 September", amountUsd: 10 })).rejects.toThrow(/real day/);
    await expect(saveBalance(client, "user-1", { asOf: "2026-09-03", amountUsd: -1 })).rejects.toThrow(/zero or more/);
    expect(calls.upsert).toBeUndefined();
  });

  it("says plainly when the write fails", async () => {
    const { client } = mockClient({ data: null, error: null }, { error: { message: "row level security" } });
    await expect(saveBalance(client, "user-1", { asOf: "2026-09-03", amountUsd: 10 })).rejects.toThrow("That balance was not saved to your account: row level security");
  });

  it("picks the most recent of two balances, the saved one on a tie", () => {
    const older = { asOf: "2026-09-01", amountUsd: 1 };
    const newer = { asOf: "2026-09-03", amountUsd: 2 };
    const sameDay = { asOf: "2026-09-03", amountUsd: 3 };
    expect(latestBalance(null, null)).toBeNull();
    expect(latestBalance(older, null)).toBe(older);
    expect(latestBalance(null, newer)).toBe(newer);
    expect(latestBalance(newer, older)).toBe(newer);
    expect(latestBalance(older, newer)).toBe(newer);
    expect(latestBalance(newer, sameDay)).toBe(sameDay);
  });
});
