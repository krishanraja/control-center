import { rest } from "../supabase.ts";
import type { FxRate, MerchantInput, MeterRowInput, OverrideRow, SpendItemInput, SpendSource } from "./types.ts";

interface RunRow {
  id: string;
  status: "running" | "complete" | "partial" | "failed" | "skipped";
}

/**
 * Control Center tables live in `public`. The spend pipeline reads three of
 * them and writes none, and this is the only door: anything but a GET is
 * refused before it reaches the network.
 */
export async function readPublic<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET") throw new Error(`readPublic refuses ${method}; Control Center tables are read-only from COMPOUND`);
  return await rest<T>(path, { ...init, method: "GET" }, "public");
}

export async function beginSpendRun(options: { runOn: string; mode: "scheduled" | "manual"; attempt: number }): Promise<RunRow> {
  const rows = await rest<RunRow[]>("spend_runs?on_conflict=run_on,mode,attempt", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify({ run_on: options.runOn, mode: options.mode, attempt: options.attempt, status: "running" }),
  });
  if (rows?.[0]?.id) return rows[0];
  const existing = await rest<RunRow[]>(
    `spend_runs?select=id,status&run_on=eq.${options.runOn}&mode=eq.${options.mode}&attempt=eq.${options.attempt}&limit=1`,
  );
  if (!existing[0]?.id) throw new Error("Unable to create or recover spend run");
  return existing[0];
}

export async function finishSpendRun(runId: string, values: {
  status: "complete" | "partial" | "failed" | "skipped";
  providerResults?: Record<string, unknown>;
  errorSummary?: string;
}): Promise<void> {
  await rest(`spend_runs?id=eq.${runId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: values.status,
      finished_at: new Date().toISOString(),
      provider_results: values.providerResults ?? {},
      error_summary: values.errorSummary ?? null,
    }),
  });
}

export async function listOverrides(userId: string): Promise<OverrideRow[]> {
  return await rest<OverrideRow[]>(`spend_merchant_overrides?select=merchant_key,scope,display_name&user_id=eq.${userId}&limit=1000`);
}

async function postBatches(path: string, rows: unknown[], prefer: string): Promise<void> {
  for (let index = 0; index < rows.length; index += 200) {
    await rest(path, { method: "POST", headers: { Prefer: prefer }, body: JSON.stringify(rows.slice(index, index + 200)) });
  }
}

export async function upsertSpendItems(rows: SpendItemInput[], syncedAt: string): Promise<number> {
  if (rows.length === 0) return 0;
  await postBatches(
    "spend_items?on_conflict=user_id,source,source_ref",
    rows.map((row) => ({ ...row, synced_at: syncedAt })),
    "return=minimal,resolution=merge-duplicates",
  );
  return rows.length;
}

/** Rows a source no longer returns are hidden, never deleted, so history keeps its shape. */
export async function hideVanished(userId: string, source: SpendSource, syncedBefore: string): Promise<void> {
  await rest(`spend_items?user_id=eq.${userId}&source=eq.${source}&synced_at=lt.${encodeURIComponent(syncedBefore)}&hidden=is.false`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ hidden: true }),
  });
}

export async function replaceMerchants(userId: string, rows: MerchantInput[], runStartedAt: string): Promise<void> {
  if (rows.length > 0) {
    await postBatches("spend_merchants?on_conflict=user_id,merchant_key", rows, "return=minimal,resolution=merge-duplicates");
  }
  await rest(`spend_merchants?user_id=eq.${userId}&updated_at=lt.${encodeURIComponent(runStartedAt)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

export async function upsertFxRates(rates: FxRate[]): Promise<number> {
  if (rates.length === 0) return 0;
  await postBatches("spend_fx_rates?on_conflict=rate_on,currency", rates, "return=minimal,resolution=merge-duplicates");
  return rates.length;
}

export async function replaceMeterWindow(since: string, rows: MeterRowInput[], runStartedAt: string): Promise<void> {
  if (rows.length > 0) {
    await postBatches(
      "spend_meter_daily?on_conflict=provider,unit_kind,unit_key,day,bucket",
      rows.map((row) => ({ ...row, synced_at: runStartedAt })),
      "return=minimal,resolution=merge-duplicates",
    );
  }
  await rest(`spend_meter_daily?day=gte.${since}&synced_at=lt.${encodeURIComponent(runStartedAt)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

export interface LedgerOutRow {
  user_id: string;
  external_ref: string;
  occurred_on: string;
  category: string;
  sheet_category: string;
  amount_aud: number | string | null;
  description: string | null;
  payee: string | null;
  confidence: string | null;
}

export async function listLedgerOut(userId: string, since: string): Promise<LedgerOutRow[]> {
  return await rest<LedgerOutRow[]>(
    `property_ledger?select=user_id,external_ref,occurred_on,category,sheet_category,amount_aud,description,payee,confidence&user_id=eq.${userId}&direction=eq.out&occurred_on=gte.${since}&order=occurred_on.asc&limit=5000`,
  );
}
