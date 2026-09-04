import { parse } from "@std/csv";
import { rest } from "../supabase.ts";
import { mapLedgerRows, toLedgerInputs } from "./providers/ledgerSheet.ts";
import { upsertLedgerRows, upsertObservations } from "./supabase.ts";
import type { Observation } from "./types.ts";

/**
 * One-off and occasional imports of personal facts. Runs from the owner's
 * shell with the service role; nothing here is ever committed with values.
 *
 *   deno task property:import --kind properties  --file seed/local/properties.csv
 *   deno task property:import --kind loans       --file seed/local/loans.csv
 *   deno task property:import --kind rates       --file seed/local/rates.csv
 *   deno task property:import --kind rents       --file seed/local/rents.csv
 *   deno task property:import --kind observations --file seed/local/observations.csv
 *   deno task property:import --kind ledger      --file seed/local/ledger.csv --property gladstone-9
 *
 * Every kind is idempotent: re-running the same file changes nothing.
 * Add --dry-run to print the normalised rows without writing.
 */

type Kind = "properties" | "loans" | "rates" | "rents" | "observations" | "ledger";

type Row = Record<string, string>;

function required(row: Row, name: string): string {
  const value = (row[name] ?? "").trim();
  if (!value) throw new Error(`Column "${name}" is required`);
  return value;
}

function optional(row: Row, name: string): string | null {
  const value = (row[name] ?? "").trim();
  return value ? value : null;
}

function number(row: Row, name: string): number {
  const value = Number(required(row, name).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(value)) throw new Error(`Column "${name}" must be a number`);
  return value;
}

function optionalNumber(row: Row, name: string): number | null {
  const raw = optional(row, name);
  if (raw == null) return null;
  const value = Number(raw.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(value)) throw new Error(`Column "${name}" must be a number`);
  return value;
}

function date(row: Row, name: string): string {
  const value = required(row, name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Column "${name}" must be YYYY-MM-DD`);
  return value;
}

export function parsePropertyRow(row: Row, userId: string) {
  return {
    user_id: userId,
    slug: required(row, "slug"),
    label: required(row, "label"),
    address: required(row, "address"),
    suburb: required(row, "suburb"),
    state: optional(row, "state") ?? "QLD",
    postcode: required(row, "postcode"),
    dwelling_type: required(row, "dwelling_type"),
    bedrooms: number(row, "bedrooms"),
    bathrooms: number(row, "bathrooms"),
    car_spaces: number(row, "car_spaces"),
    floor_note: optional(row, "floor_note"),
    purchase_price_aud: number(row, "purchase_price_aud"),
    contract_on: optional(row, "contract_on"),
    settled_on: date(row, "settled_on"),
    active: true,
  };
}

export function parseLoanRow(row: Row, userId: string, propertyId: string) {
  return {
    user_id: userId,
    property_id: propertyId,
    lender: required(row, "lender"),
    product: optional(row, "product"),
    purpose: required(row, "purpose"),
    principal_aud: number(row, "principal_aud"),
    term_months: number(row, "term_months"),
    repayment_type: required(row, "repayment_type"),
    first_repayment_on: date(row, "first_repayment_on"),
    repayment_aud: optionalNumber(row, "repayment_aud"),
    offset_balance_aud: optionalNumber(row, "offset_balance_aud") ?? 0,
    active: true,
  };
}

export function parseRateRow(row: Row, userId: string, loanId: string) {
  return {
    user_id: userId,
    loan_id: loanId,
    effective_from: date(row, "effective_from"),
    rate_pct: number(row, "rate_pct"),
    source: required(row, "source"),
    note: optional(row, "note"),
  };
}

export function parseRentRow(row: Row, userId: string, propertyId: string) {
  return {
    user_id: userId,
    property_id: propertyId,
    effective_from: date(row, "effective_from"),
    amount_aud: number(row, "amount_aud"),
    period: required(row, "period"),
    management_fee_pct: optionalNumber(row, "management_fee_pct"),
    lease_ends_on: optional(row, "lease_ends_on"),
    kind: optional(row, "kind") ?? "unknown_prior",
    note: optional(row, "note"),
  };
}

export function parseObservationRow(row: Row): Observation {
  const detail: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith("detail_") && value.trim()) {
      const numeric = Number(value);
      detail[key.slice(7)] = Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(value.trim()) ? numeric : value.trim();
    }
  }
  return {
    source: (optional(row, "source") ?? "manual") as Observation["source"],
    areaKind: required(row, "area_kind") as Observation["areaKind"],
    areaCode: required(row, "area_code"),
    dwellingType: (optional(row, "dwelling_type") ?? null) as Observation["dwellingType"],
    bedrooms: optionalNumber(row, "bedrooms"),
    metric: required(row, "metric"),
    periodStart: date(row, "period_start"),
    periodEnd: date(row, "period_end"),
    value: number(row, "value"),
    unit: required(row, "unit"),
    sourceUrl: optional(row, "source_url") ?? undefined,
    sourceDate: optional(row, "source_date") ?? undefined,
    detail,
  };
}

async function readCsv(path: string): Promise<Row[]> {
  const text = await Deno.readTextFile(path);
  return parse(text, { skipFirstRow: true }) as Row[];
}

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function propertyIdBySlug(userId: string, slug: string): Promise<string> {
  const rows = await rest<Array<{ id: string }>>(`properties?select=id&user_id=eq.${userId}&slug=eq.${slug}&limit=1`);
  if (!rows[0]?.id) throw new Error(`No property with slug "${slug}"`);
  return rows[0].id;
}

async function loanIdForProperty(userId: string, propertyId: string): Promise<string> {
  const rows = await rest<Array<{ id: string }>>(`property_loans?select=id&user_id=eq.${userId}&property_id=eq.${propertyId}&active=is.true&order=first_repayment_on.desc&limit=1`);
  if (!rows[0]?.id) throw new Error("No active loan for that property");
  return rows[0].id;
}

async function upsert(table: string, conflict: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return;
  await rest(`${table}?on_conflict=${conflict}`, {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
}

export async function runImport(options: { kind: Kind; file: string; property?: string; dryRun: boolean }): Promise<void> {
  const userId = env("COMPOUND_MEMBER_USER_ID");
  const csv = await readCsv(options.file);
  const propertySlug = options.property ?? csv[0]?.property_slug ?? csv[0]?.slug;

  if (options.kind === "properties") {
    const rows = csv.map((row) => parsePropertyRow(row, userId));
    if (options.dryRun) return console.log(JSON.stringify(rows, null, 2));
    return await upsert("properties", "user_id,slug", rows);
  }
  if (options.kind === "observations") {
    const rows = csv.map(parseObservationRow);
    if (options.dryRun) return console.log(JSON.stringify(rows, null, 2));
    console.log(`wrote ${await upsertObservations(rows)} observations`);
    return;
  }
  if (!propertySlug) throw new Error("Pass --property <slug> or include a property_slug column");
  const propertyId = options.dryRun ? "dry-run" : await propertyIdBySlug(userId, propertySlug);

  if (options.kind === "loans") {
    const rows = csv.map((row) => parseLoanRow(row, userId, propertyId));
    if (options.dryRun) return console.log(JSON.stringify(rows, null, 2));
    return await upsert("property_loans", "user_id,property_id,lender,first_repayment_on", rows);
  }
  if (options.kind === "rates") {
    const loanId = options.dryRun ? "dry-run" : await loanIdForProperty(userId, propertyId);
    const rows = csv.map((row) => parseRateRow(row, userId, loanId));
    if (options.dryRun) return console.log(JSON.stringify(rows, null, 2));
    return await upsert("property_loan_rates", "loan_id,effective_from", rows);
  }
  if (options.kind === "rents") {
    const rows = csv.map((row) => parseRentRow(row, userId, propertyId));
    if (options.dryRun) return console.log(JSON.stringify(rows, null, 2));
    return await upsert("property_rents", "property_id,effective_from", rows);
  }
  // ledger: the sheet tab exported as CSV with its eight columns.
  const raw = parse(await Deno.readTextFile(options.file)) as string[][];
  const mapped = await mapLedgerRows(raw);
  const rows = await toLedgerInputs(mapped, { userId, propertyId }, "google_sheet");
  if (options.dryRun) return console.log(JSON.stringify(rows.slice(0, 5), null, 2), `... ${rows.length} rows`);
  console.log(`wrote ${await upsertLedgerRows(rows)} ledger rows`);
}

function args(): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < Deno.args.length; index += 1) {
    const item = Deno.args[index];
    if (!item.startsWith("--")) continue;
    const next = Deno.args[index + 1];
    values.set(item.slice(2), next && !next.startsWith("--") ? next : "true");
    if (next && !next.startsWith("--")) index += 1;
  }
  return values;
}

if (import.meta.main) {
  const values = args();
  const kind = values.get("kind") as Kind | undefined;
  const file = values.get("file");
  if (!kind || !["properties", "loans", "rates", "rents", "observations", "ledger"].includes(kind)) throw new Error("--kind is required");
  if (!file) throw new Error("--file is required");
  await runImport({ kind, file, property: values.get("property"), dryRun: values.get("dry-run") === "true" });
}
