import { classify, matchRegistry, merchantKey, needleMatches } from "./engines/classify.ts";
import { dedupeItems, extractGmailId, FUZZY_SUPERSEDES } from "./engines/dedupe.ts";
import { buildFxTable, rateOnOrBefore, toUsd } from "./engines/fx.ts";
import { buildMerchants, classifyAndPrice } from "./main.ts";
import { assertBillsHeader, BILLS_HEADER, findHeaderRow, mapBillRow, mapBillRows, parseSignedAmount, toBillItems } from "./providers/billsSheet.ts";
import { confidenceWord, mapInvoice } from "./providers/controlCenter.ts";
import { mapLedgerOut } from "./providers/propertyLedger.ts";
import { parseFxRates } from "./providers/rbaFx.ts";
import { readPublic } from "./supabase.ts";
import type { FxRate, RegistryRow, SpendItemInput } from "./types.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function item(partial: Partial<SpendItemInput> & Pick<SpendItemInput, "source" | "source_ref" | "occurred_on" | "merchant">): SpendItemInput {
  return {
    user_id: "u",
    merchant_key: merchantKey(partial.merchant),
    registry_key: null,
    item: null,
    category: null,
    scope: "personal",
    scope_reason: "default",
    kind: "charge",
    amount: 10,
    currency: "USD",
    amount_usd: null,
    fx_rate: null,
    fx_date: null,
    fx_source: null,
    evidence: null,
    payment_method: null,
    account_email: null,
    confidence: null,
    invoice_ref: null,
    message_id: null,
    dedupe_key: "",
    superseded_by_ref: null,
    possible_duplicate_of_ref: null,
    flags: [],
    hidden: false,
    detail: {},
    ...partial,
  };
}

const registry: RegistryRow[] = [
  { key: "anthropic", display_name: "Anthropic", category: "llm", vendor_match: ["anthropic", "claude"], included_usd: null, overage_trigger_usd: null, cycle_usd: null, cycle_start: null, cycle_end: null, balance: null, balance_unit: null, top_up_url: null, active: true },
  { key: "n8n", display_name: "n8n", category: "infra", vendor_match: ["n8n"], included_usd: null, overage_trigger_usd: null, cycle_usd: null, cycle_start: null, cycle_end: null, balance: null, balance_unit: null, top_up_url: null, active: true },
  { key: "google-play", display_name: "Google Play", category: "media", vendor_match: ["googleplay", "google play"], included_usd: null, overage_trigger_usd: null, cycle_usd: null, cycle_start: null, cycle_end: null, balance: null, balance_unit: null, top_up_url: null, active: true },
  { key: "tranco", display_name: "Tranco", category: "data", vendor_match: ["tranco"], included_usd: null, overage_trigger_usd: null, cycle_usd: null, cycle_start: null, cycle_end: null, balance: null, balance_unit: null, top_up_url: null, active: true },
  { key: "apify", display_name: "Apify", category: "data", vendor_match: ["apify"], included_usd: 29, overage_trigger_usd: 20, cycle_usd: 83, cycle_start: "2026-08-15", cycle_end: "2026-09-15", balance: null, balance_unit: null, top_up_url: null, active: true },
];

const F11 = [
  "F11.1  EXCHANGE RATES",
  "Title,A$1=USD,Trade-weighted Index,A$1=EUR,A$1=GBP",
  "Units,USD,Index,EUR,GBP",
  "Series ID,FXRUSD,FXRTWI,FXREUR,FXRUKPS",
  "01-Sep-2026,0.6600,61.4,0.6000,0.5000",
  "02-Sep-2026,0.6700,61.5,0.6100,0.5100",
  "04-Sep-2026,0.6800,61.6,0.6200,0.5200",
].join("\n");

Deno.test("bills header sits under a title row and must match", () => {
  const rows = [["2026 BILLS (432 rows)"], BILLS_HEADER, ["2026-01-02", "", "Anthropic", "Claude Max", "Software & AI", "200.00", "USD"]];
  assert(findHeaderRow(rows) === 1, "header row not found under the title");
  assertBillsHeader([...BILLS_HEADER, "Extra"]);
  let threw = false;
  try { assertBillsHeader(["Date", "Merchant"]); } catch { threw = true; }
  assert(threw, "a renamed header should stop the sync");
});

Deno.test("bill rows map amounts, currencies, refunds and Gmail ids", () => {
  const base = ["2026-01-02", "2026-01-02 09:00", "Anthropic, PBC", "Claude Max", "Software & AI", "US$ 200.00", "USD", "Receipt", "Visa", "krish@example.com", "Your receipt", "18f0a1b2c3d4e5f6", "in_123", "High"];
  const row = mapBillRow(base, 3);
  assert(row?.amount === 200 && row.kind === "charge" && row.currency === "USD", "plain USD charge");
  assert(row?.messageId === "18f0a1b2c3d4e5f6" && row.keyMaterial === "gm:18f0a1b2c3d4e5f6", "Gmail id keys the row");
  assert(row?.accountEmail === "krish@example.com", "mailbox kept lowercase");
  const refund = mapBillRow([...base.slice(0, 5), "-41.80", "AUD", ...base.slice(7)], 4);
  assert(refund?.kind === "refund" && refund.amount === 41.8, "negative is a refund with a positive amount");
  const brackets = mapBillRow([...base.slice(0, 5), "(1,250.00)", "GBP", ...base.slice(7)], 5);
  assert(brackets?.kind === "refund" && brackets.amount === 1250, "brackets are a refund and commas are dropped");
  const blank = mapBillRow([...base.slice(0, 5), "", "", ...base.slice(7, 11), "", "", ""], 6);
  assert(blank != null && blank.amount == null && blank.currency == null && blank.keyMaterial.startsWith("2026-01-02|anthropic, pbc|"), "blank amount keeps the row and keys by content");
  const dmy = mapBillRow(["03/09/2026", "", "Coles", "", "", "12.50", "AUD"], 7);
  assert(dmy?.occurredOn === "2026-09-03", "DD/MM/YYYY is read");
  assert(mapBillRow(["Total", "", "", "", "", "9,999"], 8) === null, "undated rows are skipped");
  assert(parseSignedAmount("€12.00") === 12 && parseSignedAmount("-£9.99") === -9.99, "symbols are stripped");
});

Deno.test("identical sheet rows both survive and both carry the duplicate flag", async () => {
  const dup = ["2026-02-01", "", "Netflix", "Standard", "Entertainment & Streaming", "22.99", "AUD", "Receipt", "Visa", "a@b.com", "", "", "", "High"];
  const mapped = mapBillRows([["title"], BILLS_HEADER, dup, dup, ["2026-02-02", "", "Spotify", "", "", "12.99", "AUD"]]);
  assert(mapped.length === 3, "three data rows");
  assert(mapped[0].sheetDuplicate && mapped[1].sheetDuplicate && !mapped[2].sheetDuplicate, "pair flagged, single not");
  assert(mapped[1].keyMaterial.endsWith("#1"), "second of the pair gets an ordinal");
  const items = await toBillItems(mapped, "u");
  assert(new Set(items.map((row) => row.source_ref)).size === 3, "refs are distinct");
  assert(items[0].flags.includes("sheet_duplicate"), "flag reaches the item");
});

Deno.test("Gmail ids come out of bare ids and Gmail URLs, never Outlook or other tokens", () => {
  assert(extractGmailId("18F0A1B2C3D4E5F6") === "18f0a1b2c3d4e5f6", "bare id lowercased");
  assert(extractGmailId("https://mail.google.com/mail/u/0/#all/18f0a1b2c3d4e5f6") === "18f0a1b2c3d4e5f6", "#all URL");
  assert(extractGmailId("https://mail.google.com/mail/u/1/#inbox/18f0a1b2c3d4e5f6?compose=new") === "18f0a1b2c3d4e5f6", "#inbox URL with query");
  assert(extractGmailId("https://outlook.office.com/mail/id/AAMkADk3M2Q0YjQ5LTg3ZjEtNDk4Zi1hY2Rk") === null, "Outlook URL");
  assert(extractGmailId("invoice-18f0a1b2c3d4e5f6-final") === null, "16 hex inside another token");
  assert(extractGmailId("") === null && extractGmailId(null) === null, "blank");
});

Deno.test("merchant keys fold spelling, legal suffixes and card descriptors", () => {
  assert(merchantKey("Anthropic, PBC") === "anthropic", `Anthropic, PBC -> ${merchantKey("Anthropic, PBC")}`);
  assert(merchantKey("ANTHROPIC") === "anthropic", "upper case");
  assert(merchantKey("n8n (Paddle)") === "n8n-paddle", `paddle -> ${merchantKey("n8n (Paddle)")}`);
  assert(merchantKey("Apollo.io Inc.") === "apollo", `apollo -> ${merchantKey("Apollo.io Inc.")}`);
  assert(merchantKey("UBER *TRIP 8H2K9Q3L1") === "uber-trip", `uber -> ${merchantKey("UBER *TRIP 8H2K9Q3L1")}`);
  assert(merchantKey("Café Zürich") === "cafe-zurich", "diacritics dropped");
  assert(merchantKey("") === "unknown", "empty falls back");
});

Deno.test("registry needles match whole words only", () => {
  assert(needleMatches("paddle n8n cloud", "n8n"), "plain hit");
  assert(!needleMatches("antranco pty", "tranco"), "substring inside a word is not a hit");
  assert(needleMatches("tranco list", "tranco"), "word hit");
  assert(matchRegistry(registry, { source: "bills_sheet", merchant: "Claude by Anthropic", item: null, account_email: null })?.key === "anthropic", "registry hit by needle");
});

Deno.test("classification precedence: override, alias, registry, default", () => {
  const overrides = [{ merchant_key: "hetzner", scope: "os" as const, display_name: null }];
  const hetzner = classify({ source: "bills_sheet", merchant: "Hetzner Online GmbH", item: null, account_email: null }, registry, overrides);
  assert(hetzner.scope === "os" && hetzner.scope_reason === "override" && hetzner.merchant_key === "hetzner", "override wins");
  const play = classify({ source: "bills_sheet", merchant: "Google Play", item: "YouTube Premium", account_email: "a@gmail.com" }, registry, []);
  assert(play.scope === "personal" && play.scope_reason === "alias", "Google Play is personal despite the registry needle");
  const workspaceOs = classify({ source: "bills_sheet", merchant: "Google Workspace", item: "Business Starter", account_email: "krish@themindmaker.ai" }, registry, []);
  const workspacePersonal = classify({ source: "bills_sheet", merchant: "Google Workspace", item: "Business Starter", account_email: "krish@gmail.com" }, registry, []);
  assert(workspaceOs.scope === "os" && workspacePersonal.scope === "personal", "Workspace follows the mailbox");
  const paddle = classify({ source: "bills_sheet", merchant: "n8n (Paddle)", item: null, account_email: null }, registry, []);
  assert(paddle.merchant_key === "n8n" && paddle.registry_key === "n8n" && paddle.scope === "os", "Paddle descriptor maps to n8n");
  const claude = classify({ source: "cc_invoices", merchant: "Anthropic", item: "Claude Max", account_email: null, service_key: "anthropic" }, registry, []);
  assert(claude.scope === "os" && claude.scope_reason === "registry" && claude.registry_key === "anthropic", "registry match");
  const coles = classify({ source: "bills_sheet", merchant: "Coles", item: null, account_email: null }, registry, []);
  assert(coles.scope === "personal" && coles.scope_reason === "default", "unknown merchant is personal");
  const ledger = classify({ source: "property_ledger", merchant: "Body corporate", item: null, account_email: null }, registry, []);
  assert(ledger.scope === "property" && ledger.scope_reason === "ledger", "ledger rows are property");
});

Deno.test("F11.1 parses three currencies and prices on or before a date", () => {
  const rates = parseFxRates(F11, "2026-09-01");
  assert(rates.length === 9, `expected 9 rates, got ${rates.length}`);
  const table = buildFxTable(rates);
  assert(rateOnOrBefore(table, "USD", "2026-09-03")?.rate_on === "2026-09-02", "gap day takes the day before");
  assert(rateOnOrBefore(table, "USD", "2026-09-20") === null, "eleven days past the last rate is unpriced");
  assert(rateOnOrBefore(table, "USD", "2026-08-01") === null, "before the first rate is unpriced");
  const aud = toUsd(100, "AUD", "2026-09-01", table);
  assert(aud.amount_usd === 66 && aud.fx_source === "rba" && aud.fx_date === "2026-09-01", `AUD -> ${JSON.stringify(aud)}`);
  const eur = toUsd(12, "EUR", "2026-09-04", table);
  assert(eur.amount_usd === Math.round(12 / 0.62 * 0.68 * 100) / 100, `EUR -> ${JSON.stringify(eur)}`);
  const gbp = toUsd(10, "gbp", "2026-09-02", table);
  assert(gbp.amount_usd === Math.round(10 / 0.51 * 0.67 * 100) / 100, "GBP through AUD");
  const usd = toUsd(20, "USD", "2026-09-02", table);
  assert(usd.amount_usd === 20 && usd.fx_rate === 1 && usd.fx_source === null, "USD untouched");
  assert(toUsd(20, null, "2026-09-02", table).amount_usd === null, "blank currency is never assumed");
  assert(toUsd(20, "JPY", "2026-09-02", table).amount_usd === null, "unsupported currency is unpriced");
});

Deno.test("dedupe: exact id, then amount within three days, then a loose flag", () => {
  const sheet = [
    item({ source: "bills_sheet", source_ref: "s1", occurred_on: "2026-08-02", merchant: "Anthropic", message_id: "18f0a1b2c3d4e5f6", amount: 200 }),
    item({ source: "bills_sheet", source_ref: "s2", occurred_on: "2026-08-10", merchant: "Vercel", amount: 20 }),
    item({ source: "bills_sheet", source_ref: "s3", occurred_on: "2026-08-10", merchant: "Supabase", amount: 25 }),
    item({ source: "bills_sheet", source_ref: "s4", occurred_on: "2026-08-20", merchant: "Apify", amount: 49 }),
  ];
  const inbox = [
    item({ source: "cc_invoices", source_ref: "18f0a1b2c3d4e5f6", occurred_on: "2026-08-02", merchant: "Anthropic, PBC", amount: 200 }),
    item({ source: "cc_invoices", source_ref: "aaaaaaaaaaaaaaa1", occurred_on: "2026-08-12", merchant: "VERCEL", amount: 20 }),
    item({ source: "cc_invoices", source_ref: "aaaaaaaaaaaaaaa2", occurred_on: "2026-08-24", merchant: "Supabase", amount: 25 }),
    item({ source: "cc_invoices", source_ref: "aaaaaaaaaaaaaaa3", occurred_on: "2026-08-26", merchant: "Apify", amount: 49.5 }),
  ];
  const stats = dedupeItems([...sheet, ...inbox]);
  assert(stats.exact === 1 && inbox[0].superseded_by_ref === "bills_sheet:s1", "exact id supersedes");
  assert(stats.tier1 === 1, `one amount match, got ${stats.tier1}`);
  if (FUZZY_SUPERSEDES) assert(inbox[1].superseded_by_ref === "bills_sheet:s2" && inbox[1].flags.includes("matched_by_amount"), "tier 1 supersedes and says so");
  assert(inbox[2].superseded_by_ref == null && !inbox[2].flags.includes("possible_duplicate"), "fourteen days apart is not a match");
  assert(stats.tier2 === 1 && inbox[3].flags.includes("possible_duplicate") && sheet[3].flags.includes("possible_duplicate"), "one percent off within ten days is flagged on both");
  assert(inbox[3].superseded_by_ref == null, "tier 2 still counts");
});

Deno.test("dedupe is one to one when two inbox rows fit one sheet row", () => {
  const sheet = item({ source: "bills_sheet", source_ref: "s1", occurred_on: "2026-08-10", merchant: "Vercel", amount: 20 });
  const a = item({ source: "cc_invoices", source_ref: "aaaaaaaaaaaaaaa1", occurred_on: "2026-08-12", merchant: "Vercel", amount: 20 });
  const b = item({ source: "cc_invoices", source_ref: "aaaaaaaaaaaaaaa2", occurred_on: "2026-08-11", merchant: "Vercel", amount: 20 });
  dedupeItems([sheet, a, b]);
  assert(b.superseded_by_ref === "bills_sheet:s1" && a.superseded_by_ref == null, "the closer date wins");
});

Deno.test("classifyAndPrice fills scope and USD; control-center pricing is kept", () => {
  const rates: FxRate[] = [{ rate_on: "2026-09-01", currency: "USD", per_aud: 0.66 }];
  const rows = [
    item({ source: "bills_sheet", source_ref: "s1", occurred_on: "2026-09-02", merchant: "Anthropic", amount: 200, currency: "USD" }),
    item({ source: "bills_sheet", source_ref: "s2", occurred_on: "2026-09-02", merchant: "Coles", amount: 100, currency: "AUD" }),
    item({ source: "cc_invoices", source_ref: "aaaaaaaaaaaaaaa1", occurred_on: "2026-09-02", merchant: "Apify", amount: 49, currency: "USD", amount_usd: 49, fx_source: "control_center", registry_key: "apify" }),
    item({ source: "bills_sheet", source_ref: "s3", occurred_on: "2026-09-02", merchant: "Mystery", amount: 5, currency: null }),
  ];
  classifyAndPrice(rows, registry, [], rates);
  assert(rows[0].scope === "os" && rows[0].amount_usd === 200, "USD OS row");
  assert(rows[1].scope === "personal" && rows[1].amount_usd === 66 && rows[1].fx_source === "rba", "AUD personal row priced");
  assert(rows[2].fx_source === "control_center" && rows[2].amount_usd === 49 && rows[2].scope === "os", "cc pricing kept");
  assert(rows[3].amount_usd === null && rows[3].flags.includes("unpriced"), "no currency stays unpriced");
  assert(rows[0].dedupe_key === "anthropic|USD|200|2026-09-02", "dedupe key shape");
});

Deno.test("merchants mirror the registry and add discovered ones with counts", () => {
  const rows = [
    item({ source: "bills_sheet", source_ref: "s1", occurred_on: "2026-08-02", merchant: "Anthropic", registry_key: "anthropic", scope: "os" }),
    item({ source: "bills_sheet", source_ref: "s2", occurred_on: "2026-09-02", merchant: "Anthropic, PBC", registry_key: "anthropic", scope: "os" }),
    item({ source: "bills_sheet", source_ref: "s3", occurred_on: "2026-09-03", merchant: "Coles", scope: "personal" }),
    item({ source: "cc_invoices", source_ref: "aaaaaaaaaaaaaaa1", occurred_on: "2026-09-03", merchant: "Coles", scope: "personal", superseded_by_ref: "bills_sheet:s3" }),
  ];
  const merchants = buildMerchants("u", registry, rows);
  const anthropic = merchants.find((row) => row.merchant_key === "anthropic");
  assert(anthropic?.registry_key === "anthropic" && anthropic.item_count === 2 && anthropic.first_seen_on === "2026-08-02", "registry merchant carries counts");
  const coles = merchants.find((row) => row.merchant_key === "coles");
  assert(coles?.scope_default === "personal" && coles.item_count === 1 && coles.display_name === "Coles", "discovered merchant ignores superseded rows");
  assert(merchants.find((row) => row.merchant_key === "apify")?.included_usd === 29, "cycle fields mirrored");
});

Deno.test("control-center rows and ledger rows map to items", () => {
  const invoice = mapInvoice({
    gmail_message_id: "18F0A1B2C3D4E5F6", vendor_raw: "Apify", service_key: "apify", amount: "49.00", currency: "usd", amount_usd: "49", fx_rate: "1",
    kind: "charge", paid_at: null, period_end: "2026-09-30", cadence: "monthly", plan_label: "Starter", parse_confidence: "0.72", needs_review: true, created_at: "2026-09-02T07:15:00Z",
  }, "u");
  assert(invoice?.source_ref === "18f0a1b2c3d4e5f6" && invoice.occurred_on === "2026-09-02", "undated invoice falls back to when it was seen");
  assert(invoice?.flags.includes("undated") && invoice.flags.includes("needs_review") && invoice.confidence === "Medium", "flags and confidence word");
  assert(confidenceWord(0.9) === "High" && confidenceWord(null) === null, "confidence buckets");
  const ledger = mapLedgerOut({ user_id: "u", external_ref: "abcd1234abcd1234", occurred_on: "2026-08-13", category: "loan_repayment", sheet_category: "Mortgage", amount_aud: "3034.12", description: "Monthly transfer", payee: null, confidence: "Confirmed" });
  assert(ledger?.merchant === "Home loan" && ledger.currency === "AUD" && ledger.amount === 3034.12 && ledger.category === "property_loan_repayment", "ledger mapping");
});

Deno.test("readPublic refuses anything but GET before touching the network", async () => {
  let threw = "";
  try { await readPublic("spend_invoices", { method: "POST" }); } catch (error) { threw = error instanceof Error ? error.message : String(error); }
  assert(threw.includes("refuses POST"), `expected refusal, got: ${threw}`);
});
