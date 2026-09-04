import { listLedgerOut, type LedgerOutRow } from "../supabase.ts";
import { FLAGS, monthsBefore, toNumber, type Coverage, type SpendContext, type SpendItemInput } from "../types.ts";

/**
 * Property outgoings from the ledger mirror already in this schema. Only rows
 * where money left the account are spend; rent in and open gaps are not. The
 * loan repayment is included because the cash went out; the Property tab is
 * where the interest and paydown split lives.
 */

const PAYEE_FALLBACK: Record<string, string> = {
  loan_repayment: "Home loan",
  management_fee: "Property agent",
  body_corporate: "Body corporate",
  council_rates: "Council rates",
  water: "Water",
  insurance: "Insurance",
  purchase_cost: "Purchase costs",
  legal: "Legal",
  repairs: "Repairs",
};

export function mapLedgerOut(row: LedgerOutRow): SpendItemInput | null {
  const amount = toNumber(row.amount_aud);
  if (!row.external_ref || !row.occurred_on) return null;
  const merchant = row.payee?.trim() || PAYEE_FALLBACK[row.category] || row.sheet_category || "Property";
  return {
    user_id: row.user_id,
    source: "property_ledger",
    source_ref: row.external_ref,
    occurred_on: row.occurred_on,
    merchant,
    merchant_key: "",
    registry_key: null,
    item: row.description,
    category: `property_${row.category}`,
    scope: "property",
    scope_reason: "ledger",
    kind: "charge",
    amount: amount == null ? null : Math.abs(amount),
    currency: "AUD",
    amount_usd: null,
    fx_rate: null,
    fx_date: null,
    fx_source: null,
    evidence: "Cost ledger",
    payment_method: null,
    account_email: null,
    confidence: row.confidence,
    invoice_ref: null,
    message_id: null,
    dedupe_key: "",
    superseded_by_ref: null,
    possible_duplicate_of_ref: null,
    flags: amount == null ? [FLAGS.unpriced] : [],
    hidden: false,
    detail: { ledgerCategory: row.category, sheetCategory: row.sheet_category },
  };
}

export async function collectPropertyLedger(context: SpendContext, monthsBack = 13): Promise<{ items: SpendItemInput[]; coverage: Coverage }> {
  const started = performance.now();
  const rows = await listLedgerOut(context.userId, monthsBefore(context.runOn, monthsBack));
  const items = rows.map(mapLedgerOut).filter((row): row is SpendItemInput => row != null);
  const latest = items.reduce((carry, row) => row.occurred_on > carry ? row.occurred_on : carry, "");
  return {
    items,
    coverage: { provider: "Property ledger", status: "available", sourceDate: latest || undefined, latencyMs: Math.round(performance.now() - started) },
  };
}
