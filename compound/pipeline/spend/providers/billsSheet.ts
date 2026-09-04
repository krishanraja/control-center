import { readSheetRows, type ServiceAccount } from "../../property/google.ts";
import { externalRef } from "../../property/providers/ledgerSheet.ts";
import { extractGmailId } from "../engines/dedupe.ts";
import { FLAGS, type Coverage, type Kind, type SpendContext, type SpendItemInput } from "../types.ts";

/**
 * The bills and receipts tab. A Gmail-driven routine rewrites it on the 9th of
 * each month; COMPOUND mirrors it read-only. Rows are keyed by their Gmail
 * message id when the sheet has one and by their content otherwise, so a
 * re-sort or a wording change never creates a duplicate.
 */

export const BILLS_HEADER = [
  "Bill Date", "Email Received At", "Merchant", "Service / Item", "Category", "Amount", "Currency",
  "Evidence Type", "Payment Method", "Account Email", "Email Subject", "Source URL / Identifier",
  "Invoice / Transaction ID", "Confidence",
];

/** Row 1 is a title line, so the header is wherever "Bill Date" starts a row within the first few. */
export function findHeaderRow(rows: string[][]): number {
  for (let index = 0; index < Math.min(rows.length, 5); index += 1) {
    if ((rows[index]?.[0] ?? "").trim().toLowerCase() === "bill date") return index;
  }
  return -1;
}

export function assertBillsHeader(row: string[]): void {
  const actual = row.slice(0, BILLS_HEADER.length).map((cell) => (cell ?? "").trim().toLowerCase().replace(/\s+/g, " "));
  const expected = BILLS_HEADER.map((cell) => cell.toLowerCase());
  if (actual.join("|") !== expected.join("|")) {
    throw new Error(`Bills tab header is "${row.slice(0, BILLS_HEADER.length).join(" | ")}", expected "${BILLS_HEADER.join(" | ")}"`);
  }
}

export function parseBillDate(raw: string): string | null {
  const text = raw.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return null;
}

/** Signed amount. Brackets and a leading minus both mean a refund. Blank stays blank. */
export function parseSignedAmount(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const negative = /^\(.*\)$/.test(text) || /-/.test(text.replace(/[A-Za-z$€£\s]/g, "").slice(0, 2));
  const cleaned = text.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round((negative ? -value : value) * 100) / 100;
}

export interface MappedBill {
  occurredOn: string;
  receivedAt: string | null;
  merchant: string;
  item: string | null;
  category: string | null;
  amount: number | null;
  kind: Kind;
  currency: string | null;
  evidence: string | null;
  paymentMethod: string | null;
  accountEmail: string | null;
  subject: string | null;
  sourceUrl: string | null;
  messageId: string | null;
  invoiceRef: string | null;
  confidence: string | null;
  sheetRow: number;
  keyMaterial: string;
  sheetDuplicate: boolean;
}

/** Pure mapping of one sheet row. Returns null for the title, header, blank and undated rows. */
export function mapBillRow(cells: string[], sheetRow: number): MappedBill | null {
  const [date = "", received = "", merchant = "", item = "", category = "", amountRaw = "", currencyRaw = "", evidence = "", payment = "", account = "", subject = "", sourceUrl = "", invoice = "", confidence = ""] =
    cells.map((cell) => (cell ?? "").trim());
  const occurredOn = parseBillDate(date);
  if (!occurredOn || !merchant) return null;
  const signed = parseSignedAmount(amountRaw);
  const currency = /^[A-Za-z]{3}$/.test(currencyRaw) ? currencyRaw.toUpperCase() : null;
  const messageId = extractGmailId(sourceUrl);
  const amount = signed == null ? null : Math.abs(signed);
  return {
    occurredOn,
    receivedAt: received || null,
    merchant,
    item: item || null,
    category: category || null,
    amount,
    kind: signed != null && signed < 0 ? "refund" : "charge",
    currency,
    evidence: evidence || null,
    paymentMethod: payment || null,
    accountEmail: account.toLowerCase() || null,
    subject: subject || null,
    sourceUrl: sourceUrl || null,
    messageId,
    invoiceRef: invoice || null,
    confidence: confidence || null,
    sheetRow,
    keyMaterial: messageId
      ? `gm:${messageId}`
      : [occurredOn, merchant.toLowerCase(), amount ?? "", currency ?? "", account.toLowerCase(), invoice.toLowerCase()].join("|"),
    sheetDuplicate: false,
  };
}

/** Maps every data row, keeps identical rows apart with an ordinal, and marks both halves of a pair. */
export function mapBillRows(rows: string[][]): MappedBill[] {
  const headerAt = findHeaderRow(rows);
  if (headerAt < 0) throw new Error("Bills tab has no header row starting with Bill Date");
  assertBillsHeader(rows[headerAt]);
  const mapped: MappedBill[] = [];
  for (let index = headerAt + 1; index < rows.length; index += 1) {
    const row = mapBillRow(rows[index], index + 1);
    if (row) mapped.push(row);
  }
  const seen = new Map<string, MappedBill[]>();
  for (const row of mapped) {
    const group = seen.get(row.keyMaterial) ?? [];
    group.push(row);
    seen.set(row.keyMaterial, group);
  }
  for (const group of seen.values()) {
    if (group.length < 2) continue;
    group.forEach((row, index) => {
      row.sheetDuplicate = true;
      if (index > 0) row.keyMaterial = `${row.keyMaterial}#${index}`;
    });
  }
  return mapped;
}

export async function toBillItems(rows: MappedBill[], userId: string): Promise<SpendItemInput[]> {
  const items: SpendItemInput[] = [];
  for (const row of rows) {
    const flags: string[] = [];
    if (row.amount == null || !row.currency) flags.push(FLAGS.unpriced);
    if (row.sheetDuplicate) flags.push(FLAGS.sheetDuplicate);
    items.push({
      user_id: userId,
      source: "bills_sheet",
      source_ref: await externalRef(row.keyMaterial),
      occurred_on: row.occurredOn,
      merchant: row.merchant,
      merchant_key: "",
      registry_key: null,
      item: row.item,
      category: row.category,
      scope: "personal",
      scope_reason: "default",
      kind: row.kind,
      amount: row.amount,
      currency: row.currency,
      amount_usd: null,
      fx_rate: null,
      fx_date: null,
      fx_source: null,
      evidence: row.evidence,
      payment_method: row.paymentMethod,
      account_email: row.accountEmail,
      confidence: row.confidence,
      invoice_ref: row.invoiceRef,
      message_id: row.messageId,
      dedupe_key: "",
      superseded_by_ref: null,
      possible_duplicate_of_ref: null,
      flags,
      hidden: false,
      detail: { sheetRow: row.sheetRow, subject: row.subject, receivedAt: row.receivedAt, sourceUrl: row.sourceUrl },
    });
  }
  return items;
}

export interface BillsCollection {
  items: SpendItemInput[];
  coverage: Coverage;
}

export async function collectBillsSheet(context: SpendContext): Promise<BillsCollection> {
  const started = performance.now();
  const [email, privateKey, ownSheetId, ledgerSheetId, gidRaw] = await Promise.all([
    context.secret("PROPERTY_GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    context.secret("PROPERTY_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"),
    context.secret("SPEND_BILLS_SHEET_ID"),
    context.secret("PROPERTY_LEDGER_SHEET_ID"),
    context.secret("SPEND_BILLS_SHEET_GID"),
  ]);
  const sheetId = ownSheetId ?? ledgerSheetId;
  const gid = Number(gidRaw);
  if (!email || !privateKey || !sheetId || !Number.isInteger(gid)) {
    return {
      items: [],
      coverage: {
        provider: "Bills sheet",
        status: "not_configured",
        limitation: "Google service account or bills tab details are not configured; the bills mirror was skipped.",
      },
    };
  }
  const account: ServiceAccount = { email, privateKey };
  const rows = await readSheetRows(account, sheetId, gid, context.signal, "A:N");
  const mapped = mapBillRows(rows);
  const items = await toBillItems(mapped, context.userId);
  const latest = items.reduce((carry, row) => row.occurred_on > carry ? row.occurred_on : carry, "");
  return {
    items,
    coverage: { provider: "Bills sheet", status: "available", sourceDate: latest || undefined, latencyMs: Math.round(performance.now() - started) },
  };
}
