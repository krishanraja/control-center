import { rest } from "../supabase.ts";
import type { Observation, PropertyRow } from "./types.ts";

interface RunRow {
  id: string;
  status: "running" | "complete" | "partial" | "failed" | "skipped";
}

export async function beginPropertyRun(options: {
  runOn: string;
  mode: "scheduled" | "manual" | "import";
  attempt: number;
}): Promise<RunRow> {
  const rows = await rest<RunRow[]>("property_runs", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify({ run_on: options.runOn, mode: options.mode, attempt: options.attempt, status: "running" }),
  });
  if (rows[0]?.id) return rows[0];
  const existing = await rest<RunRow[]>(
    `property_runs?select=id,status&run_on=eq.${options.runOn}&mode=eq.${options.mode}&attempt=eq.${options.attempt}&limit=1`,
  );
  if (!existing[0]?.id) throw new Error("Unable to create or recover property run");
  return existing[0];
}

export async function finishPropertyRun(runId: string, values: {
  status: "complete" | "partial" | "failed" | "skipped";
  providerResults?: Record<string, unknown>;
  errorSummary?: string;
}): Promise<void> {
  await rest(`property_runs?id=eq.${runId}`, {
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

export async function listActiveProperties(): Promise<PropertyRow[]> {
  return await rest<PropertyRow[]>(
    "properties?select=id,user_id,slug,suburb,postcode,dwelling_type,bedrooms,bathrooms,car_spaces,purchase_price_aud,settled_on&active=is.true&order=created_at.asc",
  );
}

/** Vault-backed runtime secret. Returns undefined when the secret is absent. */
export async function readVaultSecret(name: string): Promise<string | undefined> {
  try {
    const value = await rest<string | null>("rpc/read_secret", {
      method: "POST",
      body: JSON.stringify({ secret_name: name }),
    });
    return typeof value === "string" && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Environment first, then Vault, so GitHub secrets and Vault entries both work. */
export async function resolveSecret(name: string): Promise<string | undefined> {
  const fromEnv = Deno.env.get(name)?.trim();
  if (fromEnv) return fromEnv;
  return await readVaultSecret(name.toLowerCase());
}

function observationRow(observation: Observation) {
  return {
    source: observation.source,
    area_kind: observation.areaKind,
    area_code: observation.areaCode,
    dwelling_type: observation.dwellingType,
    bedrooms: observation.bedrooms,
    metric: observation.metric,
    period_start: observation.periodStart,
    period_end: observation.periodEnd,
    value: observation.value,
    unit: observation.unit,
    source_url: observation.sourceUrl ?? null,
    source_date: observation.sourceDate ?? null,
    detail: observation.detail ?? {},
    observed_at: new Date().toISOString(),
  };
}

const OBSERVATION_CONFLICT = "on_conflict=source,area_kind,area_code,dwelling_type,bedrooms,metric,period_start,period_end";

export async function upsertObservations(observations: Observation[]): Promise<number> {
  if (observations.length === 0) return 0;
  // The natural key is an expression index (coalesce on nullable columns), which
  // PostgREST cannot target directly, so rows are written one by one with a
  // read-before-write. Volumes are small (tens of rows a week).
  let written = 0;
  for (const observation of observations) {
    const params = new URLSearchParams({
      select: "id",
      source: `eq.${observation.source}`,
      area_kind: `eq.${observation.areaKind}`,
      area_code: `eq.${observation.areaCode}`,
      metric: `eq.${observation.metric}`,
      period_start: `eq.${observation.periodStart}`,
      period_end: `eq.${observation.periodEnd}`,
      dwelling_type: observation.dwellingType == null ? "is.null" : `eq.${observation.dwellingType}`,
      bedrooms: observation.bedrooms == null ? "is.null" : `eq.${observation.bedrooms}`,
    });
    const ref = observation.detail?.ref;
    if (ref != null) params.set("detail->>ref", `eq.${String(ref)}`);
    const existing = await rest<Array<{ id: string }>>(`property_market_observations?${params.toString()}&limit=1`);
    if (existing[0]?.id) {
      await rest(`property_market_observations?id=eq.${existing[0].id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(observationRow(observation)),
      });
    } else {
      await rest("property_market_observations", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(observationRow(observation)),
      });
    }
    written += 1;
  }
  return written;
}

export { OBSERVATION_CONFLICT };

export interface ObservationRow {
  source: string;
  area_kind: string;
  area_code: string;
  dwelling_type: string | null;
  bedrooms: number | null;
  metric: string;
  period_start: string;
  period_end: string;
  value: number;
  unit: string;
  source_url: string | null;
  source_date: string | null;
  detail: Record<string, unknown>;
}

export async function listObservations(options: { since: string }): Promise<Observation[]> {
  const rows = await rest<ObservationRow[]>(
    `property_market_observations?select=source,area_kind,area_code,dwelling_type,bedrooms,metric,period_start,period_end,value,unit,source_url,source_date,detail&period_end=gte.${options.since}&order=period_end.asc&limit=5000`,
  );
  return rows.map((row) => ({
    source: row.source as Observation["source"],
    areaKind: row.area_kind as Observation["areaKind"],
    areaCode: row.area_code,
    dwellingType: row.dwelling_type as Observation["dwellingType"],
    bedrooms: row.bedrooms,
    metric: row.metric,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    value: Number(row.value),
    unit: row.unit,
    sourceUrl: row.source_url ?? undefined,
    sourceDate: row.source_date ?? undefined,
    detail: row.detail ?? {},
  }));
}

export async function writeValuation(row: {
  userId: string;
  propertyId: string;
  estimatedOn: string;
  method: "purchase_price" | "hedonic_lite_v1" | "index_from_purchase_v1" | "manual";
  low: number | null;
  mid: number;
  high: number | null;
  confidence: "low" | "medium" | "high";
  inputs: Record<string, unknown>;
  engineVersion: string;
  runId?: string;
}): Promise<void> {
  await rest("property_valuations?on_conflict=property_id,estimated_on,method", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: row.userId,
      property_id: row.propertyId,
      estimated_on: row.estimatedOn,
      method: row.method,
      low_aud: row.low,
      mid_aud: row.mid,
      high_aud: row.high,
      confidence: row.confidence,
      inputs: row.inputs,
      engine_version: row.engineVersion,
      run_id: row.runId ?? null,
    }),
  });
}

export async function replaceRankings(runOn: string, rows: Array<Record<string, unknown>>): Promise<void> {
  await rest(`property_suburb_rankings?run_on=eq.${runOn}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  if (rows.length === 0) return;
  await rest("property_suburb_rankings", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
}

export interface LedgerRowInput {
  user_id: string;
  property_id: string;
  occurred_on: string;
  sheet_category: string;
  category: string;
  direction: "in" | "out" | "gap" | "milestone";
  amount_aud: number | null;
  description: string | null;
  payee: string | null;
  confidence: string | null;
  source_note: string | null;
  external_ref: string;
  source: "google_sheet" | "manual";
  sheet_row: number | null;
}

export async function upsertLedgerRows(rows: LedgerRowInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const stamped = rows.map((row) => ({ ...row, synced_at: new Date().toISOString() }));
  for (let index = 0; index < stamped.length; index += 200) {
    await rest("property_ledger?on_conflict=user_id,external_ref", {
      method: "POST",
      headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
      body: JSON.stringify(stamped.slice(index, index + 200)),
    });
  }
  return rows.length;
}
