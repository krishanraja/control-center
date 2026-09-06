import { readPublic } from "../supabase.ts";
import {
  daysBefore,
  FLAGS,
  monthsBefore,
  round2,
  toNumber,
  type Coverage,
  type MeterRowInput,
  type RegistryRow,
  type SpendContext,
  type SpendItemInput,
} from "../types.ts";

/**
 * Control Center's own spend feed, read through the GET-only door. Invoices
 * are candidate items (the sheet wins when both saw the receipt). The meter is
 * a breakdown of where operating-system money went and never adds to a total.
 * The registry is the list of vendors that count as the operating system.
 */

export interface InvoiceRow {
  gmail_message_id: string;
  vendor_raw: string;
  service_key: string | null;
  amount: number | string | null;
  currency: string | null;
  amount_usd: number | string | null;
  fx_rate: number | string | null;
  kind: "charge" | "refund";
  paid_at: string | null;
  period_end: string | null;
  cadence: string | null;
  plan_label: string | null;
  parse_confidence: number | string | null;
  needs_review: boolean | null;
  created_at: string;
}

export function confidenceWord(value: number | string | null): string | null {
  const parsed = toNumber(value);
  if (parsed == null) return null;
  return parsed >= 0.8 ? "High" : parsed >= 0.6 ? "Medium" : "Low";
}

export function mapInvoice(row: InvoiceRow, userId: string): SpendItemInput | null {
  if (!/^[0-9a-f]{16}$/i.test(row.gmail_message_id) || !row.vendor_raw) return null;
  const flags: string[] = [];
  const occurredOn = row.paid_at ?? row.created_at.slice(0, 10);
  if (!row.paid_at) flags.push(FLAGS.undated);
  if (row.needs_review) flags.push(FLAGS.needsReview);
  const amount = toNumber(row.amount);
  const currency = row.currency && /^[A-Za-z]{3}$/.test(row.currency) ? row.currency.toUpperCase() : null;
  const usd = toNumber(row.amount_usd);
  if (amount == null || !currency) flags.push(FLAGS.unpriced);
  return {
    user_id: userId,
    source: "cc_invoices",
    source_ref: row.gmail_message_id.toLowerCase(),
    occurred_on: occurredOn,
    merchant: row.vendor_raw,
    merchant_key: "",
    registry_key: row.service_key,
    item: row.plan_label,
    category: null,
    scope: "personal",
    scope_reason: "default",
    kind: row.kind === "refund" ? "refund" : "charge",
    amount: amount == null ? null : Math.abs(amount),
    currency,
    amount_usd: usd == null ? null : round2(Math.abs(usd)),
    fx_rate: usd == null ? null : toNumber(row.fx_rate),
    fx_date: null,
    fx_source: usd == null ? null : "control_center",
    evidence: "Inbox receipt",
    payment_method: null,
    account_email: null,
    confidence: confidenceWord(row.parse_confidence),
    invoice_ref: null,
    message_id: row.gmail_message_id.toLowerCase(),
    dedupe_key: "",
    superseded_by_ref: null,
    possible_duplicate_of_ref: null,
    flags,
    hidden: false,
    detail: { cadence: row.cadence, periodEnd: row.period_end, serviceKey: row.service_key },
  };
}

export async function collectInvoices(context: SpendContext, monthsBack = 13): Promise<{ items: SpendItemInput[]; coverage: Coverage }> {
  const started = performance.now();
  const since = monthsBefore(context.runOn, monthsBack);
  const rows = await readPublic<InvoiceRow[]>(
    `spend_invoices?select=gmail_message_id,vendor_raw,service_key,amount,currency,amount_usd,fx_rate,kind,paid_at,period_end,cadence,plan_label,parse_confidence,needs_review,created_at&or=(paid_at.gte.${since},and(paid_at.is.null,created_at.gte.${since}))&order=paid_at.desc.nullslast&limit=5000`,
  );
  const items = rows.map((row) => mapInvoice(row, context.userId)).filter((row): row is SpendItemInput => row != null);
  const latest = items.reduce((carry, row) => row.occurred_on > carry ? row.occurred_on : carry, "");
  return {
    items,
    coverage: { provider: "Control Center invoices", status: "available", sourceDate: latest || undefined, latencyMs: Math.round(performance.now() - started) },
  };
}

interface MeterRow {
  provider: string;
  unit_kind: string;
  unit_key: string;
  day: string;
  bucket: string | null;
  unit_label: string | null;
  category: string | null;
  usd: number | string | null;
  runs: number | string | null;
  failed: number | string | null;
  units: number | string | null;
  unit_name: string | null;
}

export function mapMeter(row: MeterRow): MeterRowInput {
  return {
    provider: row.provider,
    unit_kind: row.unit_kind,
    unit_key: row.unit_key,
    day: row.day,
    bucket: row.bucket ?? "",
    unit_label: row.unit_label,
    category: row.category,
    usd: toNumber(row.usd) ?? 0,
    runs: toNumber(row.runs) ?? 0,
    failed: toNumber(row.failed) ?? 0,
    units: toNumber(row.units) ?? 0,
    unit_name: row.unit_name,
  };
}

export async function collectMeter(context: SpendContext, days = 90): Promise<{ since: string; rows: MeterRowInput[]; coverage: Coverage }> {
  const started = performance.now();
  const since = daysBefore(context.runOn, days);
  const rows = await readPublic<MeterRow[]>(
    `meter_daily?select=provider,unit_kind,unit_key,day,bucket,unit_label,category,usd,runs,failed,units,unit_name&day=gte.${since}&order=day.desc&limit=20000`,
  );
  const mapped = rows.map(mapMeter);
  const latest = mapped.reduce((carry, row) => row.day > carry ? row.day : carry, "");
  return {
    since,
    rows: mapped,
    coverage: { provider: "Control Center meter", status: "available", sourceDate: latest || undefined, latencyMs: Math.round(performance.now() - started) },
  };
}

export async function collectRegistry(context: SpendContext): Promise<{ rows: RegistryRow[]; coverage: Coverage }> {
  const started = performance.now();
  const rows = await readPublic<RegistryRow[]>(
    "service_registry?select=key,display_name,category,vendor_match,included_usd,overage_trigger_usd,cycle_usd,cycle_start,cycle_end,balance,balance_unit,top_up_url,active&order=key.asc&limit=500",
  );
  void context;
  return {
    rows,
    coverage: { provider: "Control Center registry", status: "available", sourceDate: undefined, latencyMs: Math.round(performance.now() - started) },
  };
}
