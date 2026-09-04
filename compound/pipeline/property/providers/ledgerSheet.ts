import { readSheetRows, type ServiceAccount } from "../google.ts";
import type { LedgerRowInput } from "../supabase.ts";
import type { Coverage, ProviderContext } from "../types.ts";

/**
 * The cost ledger lives in a Google Sheet that a Gmail-driven routine appends
 * to every month. COMPOUND mirrors that one tab read-only. Rows are keyed by
 * their content, not their position, so re-sorting the sheet or editing a
 * description never creates a duplicate.
 */

export const SHEET_HEADER = ["Date", "Category", "Description", "Payee", "Amount AUD", "Direction", "Confidence", "Source"];

const CATEGORY_MAP: Record<string, LedgerRowInput["category"]> = {
  "rental income": "rent_received",
  "agent": "management_fee",
  "mortgage": "loan_repayment",
  "council rates": "council_rates",
  "body corporate": "body_corporate",
  "water": "water",
  "insurance": "insurance",
  "purchase & setup": "purchase_cost",
  "purchase and setup": "purchase_cost",
  "legal": "legal",
  "repairs": "repairs",
};

const DIRECTION_MAP: Record<string, LedgerRowInput["direction"]> = {
  cost: "out",
  income: "in",
  gap: "gap",
  milestone: "milestone",
};

/** The tab must still be the ledger. A different header means a renamed or repurposed tab; stop rather than mirror junk. */
export function assertLedgerHeader(row: string[]): void {
  const actual = row.slice(0, SHEET_HEADER.length).map((cell) => (cell ?? "").trim().toLowerCase());
  const expected = SHEET_HEADER.map((cell) => cell.toLowerCase());
  if (actual.join("|") !== expected.join("|")) {
    throw new Error(`Ledger tab header is "${row.slice(0, 8).join(" | ")}", expected "${SHEET_HEADER.join(" | ")}"`);
  }
}

export function mapCategory(sheetCategory: string): LedgerRowInput["category"] {
  return CATEGORY_MAP[sheetCategory.trim().toLowerCase()] ?? "other";
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface MappedLedgerRow {
  occurredOn: string;
  sheetCategory: string;
  category: LedgerRowInput["category"];
  direction: LedgerRowInput["direction"];
  amount: number | null;
  description: string | null;
  payee: string | null;
  confidence: string | null;
  sourceNote: string | null;
  sheetRow: number;
  keyMaterial: string;
}

/** Pure mapping of one sheet row. Returns null for header, blank and non-dated rows. */
export function mapLedgerRow(cells: string[], sheetRow: number): MappedLedgerRow | null {
  const [date = "", category = "", description = "", payee = "", amountRaw = "", directionRaw = "", confidence = "", source = ""] =
    cells.map((cell) => (cell ?? "").trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const direction = DIRECTION_MAP[directionRaw.toLowerCase()];
  if (!direction) return null;
  const amount = parseAmount(amountRaw);
  if ((direction === "in" || direction === "out") && amount == null) return null;
  return {
    occurredOn: date,
    sheetCategory: category,
    category: mapCategory(category),
    direction,
    amount: direction === "in" || direction === "out" ? amount : null,
    description: description || null,
    payee: payee || null,
    confidence: confidence || null,
    sourceNote: source || null,
    sheetRow,
    keyMaterial: [date, category.toLowerCase(), payee.toLowerCase(), amount ?? "", direction].join("|"),
  };
}

/** Assigns stable external refs, disambiguating identical rows by order of appearance. */
export async function mapLedgerRows(rows: string[][]): Promise<MappedLedgerRow[]> {
  const mapped: MappedLedgerRow[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = mapLedgerRow(rows[index], index + 1);
    if (row) mapped.push(row);
  }
  const seen = new Map<string, number>();
  for (const row of mapped) {
    const count = seen.get(row.keyMaterial) ?? 0;
    seen.set(row.keyMaterial, count + 1);
    row.keyMaterial = count === 0 ? row.keyMaterial : `${row.keyMaterial}#${count}`;
  }
  return mapped;
}

export async function externalRef(keyMaterial: string): Promise<string> {
  return (await sha256Hex(keyMaterial)).slice(0, 16);
}

export async function toLedgerInputs(
  rows: MappedLedgerRow[],
  ids: { userId: string; propertyId: string },
  source: LedgerRowInput["source"] = "google_sheet",
): Promise<LedgerRowInput[]> {
  const inputs: LedgerRowInput[] = [];
  for (const row of rows) {
    inputs.push({
      user_id: ids.userId,
      property_id: ids.propertyId,
      occurred_on: row.occurredOn,
      sheet_category: row.sheetCategory,
      category: row.category,
      direction: row.direction,
      amount_aud: row.amount,
      description: row.description,
      payee: row.payee,
      confidence: row.confidence,
      source_note: row.sourceNote,
      external_ref: await externalRef(row.keyMaterial),
      source,
      sheet_row: row.sheetRow,
    });
  }
  return inputs;
}

export interface LedgerSync {
  rows: LedgerRowInput[];
  coverage: Coverage;
}

/** Reads the configured tab and maps it. Missing configuration is reported, not thrown. */
export async function collectLedgerSheet(
  context: ProviderContext,
  ids: { userId: string; propertyId: string },
): Promise<LedgerSync> {
  const started = performance.now();
  const [email, privateKey, sheetId, gidRaw] = await Promise.all([
    context.secret("PROPERTY_GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    context.secret("PROPERTY_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"),
    context.secret("PROPERTY_LEDGER_SHEET_ID"),
    context.secret("PROPERTY_LEDGER_SHEET_GID"),
  ]);
  const gid = Number(gidRaw);
  if (!email || !privateKey || !sheetId || !Number.isInteger(gid)) {
    return {
      rows: [],
      coverage: {
        provider: "Ledger sheet",
        status: "not_configured",
        limitation: "Google service account or sheet details are not configured; the ledger mirror was skipped.",
      },
    };
  }
  const account: ServiceAccount = { email, privateKey };
  const sheetRows = await readSheetRows(account, sheetId, gid, context.signal);
  assertLedgerHeader(sheetRows[0] ?? []);
  const mapped = await mapLedgerRows(sheetRows);
  const rows = await toLedgerInputs(mapped, ids);
  const latest = rows.reduce((carry, row) => row.occurred_on > carry ? row.occurred_on : carry, "");
  return {
    rows,
    coverage: {
      provider: "Ledger sheet",
      status: "available",
      sourceDate: latest || undefined,
      latencyMs: Math.round(performance.now() - started),
    },
  };
}
