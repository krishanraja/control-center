/**
 * Spend pipeline contracts. One item is one outgoing from one named source,
 * priced in USD with the rate that priced it, and tagged with the merchant and
 * scope the classifier chose and why. Every figure on the tab traces back to
 * rows of this shape.
 */

import type { Coverage } from "../property/types.ts";

export type { Coverage };

export type Scope = "personal" | "os" | "property";
export type ScopeReason = "override" | "alias" | "registry" | "ledger" | "default";
export type SpendSource = "bills_sheet" | "cc_invoices" | "property_ledger";
export type Kind = "charge" | "refund";
export type FxSource = "rba" | "control_center" | "none";
export type Currency = "USD" | "EUR" | "GBP";

export const FLAGS = {
  unpriced: "unpriced",
  sheetDuplicate: "sheet_duplicate",
  possibleDuplicate: "possible_duplicate",
  matchedByAmount: "matched_by_amount",
  needsReview: "needs_review",
  undated: "undated",
} as const;

export interface SpendItemInput {
  user_id: string;
  source: SpendSource;
  source_ref: string;
  occurred_on: string;
  merchant: string;
  merchant_key: string;
  registry_key: string | null;
  item: string | null;
  category: string | null;
  scope: Scope;
  scope_reason: ScopeReason;
  kind: Kind;
  amount: number | null;
  currency: string | null;
  amount_usd: number | null;
  fx_rate: number | null;
  fx_date: string | null;
  fx_source: FxSource | null;
  evidence: string | null;
  payment_method: string | null;
  account_email: string | null;
  confidence: string | null;
  invoice_ref: string | null;
  message_id: string | null;
  dedupe_key: string;
  superseded_by_ref: string | null;
  possible_duplicate_of_ref: string | null;
  flags: string[];
  hidden: boolean;
  detail: Record<string, unknown>;
}

/** The Control Center service registry, as read from `public.service_registry`. */
export interface RegistryRow {
  key: string;
  display_name: string;
  category: string | null;
  vendor_match: string[] | null;
  included_usd: number | string | null;
  overage_trigger_usd: number | string | null;
  cycle_usd: number | string | null;
  cycle_start: string | null;
  cycle_end: string | null;
  balance: number | string | null;
  balance_unit: string | null;
  top_up_url: string | null;
  active: boolean | null;
}

export interface OverrideRow {
  merchant_key: string;
  scope: Scope;
  display_name: string | null;
}

export interface MerchantInput {
  user_id: string;
  merchant_key: string;
  display_name: string;
  registry_key: string | null;
  category: string | null;
  scope_default: Scope;
  vendor_match: string[];
  included_usd: number | null;
  overage_trigger_usd: number | null;
  cycle_usd: number | null;
  cycle_start: string | null;
  cycle_end: string | null;
  balance: number | null;
  balance_unit: string | null;
  top_up_url: string | null;
  active: boolean;
  first_seen_on: string | null;
  last_seen_on: string | null;
  item_count: number;
}

export interface FxRate {
  rate_on: string;
  currency: Currency;
  per_aud: number;
}

export interface MeterRowInput {
  provider: string;
  unit_kind: string;
  unit_key: string;
  day: string;
  bucket: string;
  unit_label: string | null;
  category: string | null;
  usd: number;
  runs: number;
  failed: number;
  units: number;
  unit_name: string | null;
}

export interface SpendContext {
  runOn: string;
  userId: string;
  signal: AbortSignal;
  /** Resolves a runtime secret from the environment first, then Supabase Vault. */
  secret: (name: string) => Promise<string | undefined>;
}

/** Fields the classifier and pricer need; everything else rides along. */
export type Classifiable = Pick<SpendItemInput, "source" | "merchant" | "item" | "account_email"> & { service_key?: string | null; subject?: string | null };

export function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function daysBefore(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export function monthsBefore(date: string, months: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() - months);
  return value.toISOString().slice(0, 10);
}
