#!/usr/bin/env node
/**
 * Writes src/demo/spend.json: thirteen months of made-up outgoings across the
 * three scopes with invented merchants and round figures. Deterministic, so
 * re-running it changes nothing unless this file changes. Never real data.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const AS_OF = "2026-09-04";
const months = [];
for (let back = 12; back >= 0; back -= 1) {
  const value = new Date("2026-09-01T00:00:00Z");
  value.setUTCMonth(value.getUTCMonth() - back);
  months.push(value.toISOString().slice(0, 7));
}

let counter = 0;
const ref = () => (counter += 1).toString(16).padStart(16, "0");
const items = [];
function add(partial) {
  const amountUsd = partial.amountUsd ?? (partial.currency === "USD" ? partial.amount : partial.currency === "AUD" ? Math.round(partial.amount * 0.66 * 100) / 100 : partial.currency === "EUR" ? Math.round(partial.amount * 1.1 * 100) / 100 : null);
  items.push({
    source: "bills_sheet",
    sourceRef: ref(),
    merchantKey: partial.merchant.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    registryKey: null,
    item: null,
    category: null,
    scopeReason: partial.scope === "os" ? "registry" : partial.scope === "property" ? "ledger" : "default",
    kind: "charge",
    fxRate: partial.currency === "USD" ? 1 : partial.currency === "AUD" ? 0.66 : 1.1,
    fxDate: partial.currency === "USD" ? null : `${partial.occurredOn.slice(0, 7)}-01`,
    fxSource: partial.currency === "USD" ? null : "rba",
    evidence: "Receipt",
    accountEmail: partial.scope === "os" ? "demo@example.com" : "demo@example.net",
    confidence: "High",
    invoiceRef: null,
    supersededByRef: null,
    possibleDuplicateOfRef: null,
    flags: [],
    syncedAt: `${AS_OF}T20:45:00.000Z`,
    ...partial,
    amountUsd: partial.amount == null ? null : amountUsd,
  });
}

for (const [index, month] of months.entries()) {
  const day = (n) => `${month}-${String(n).padStart(2, "0")}`;
  // Operating system: a model bill that grows, a scraper plan, a cloud host, a workflow tool.
  add({ occurredOn: day(2), merchant: "Sample AI", item: "Max plan", category: "Software & AI", scope: "os", amount: 200 + (index >= 9 ? 100 : 0), currency: "USD", registryKey: "sample-ai" });
  add({ occurredOn: day(6), merchant: "Demo Cloud", item: "Pro", category: "Cloud & Workspace", scope: "os", amount: 25, currency: "USD", registryKey: "demo-cloud" });
  add({ occurredOn: day(15), merchant: "Scrapewell", item: "Starter", category: "Software & AI", scope: "os", amount: 49, currency: "USD", registryKey: "scrapewell" });
  if (index % 2 === 0) add({ occurredOn: day(11), merchant: "Flowmatic", item: "Cloud starter", category: "Software & AI", scope: "os", amount: 24, currency: "EUR", registryKey: "flowmatic" });
  // Personal: streaming, phone, groceries, the odd flight.
  add({ occurredOn: day(4), merchant: "Streamflix", item: "Standard", category: "Entertainment & Streaming", scope: "personal", amount: 22.99, currency: "AUD" });
  add({ occurredOn: day(9), merchant: "Telco Mobile", item: "Plan", category: "Telecom & Internet", scope: "personal", amount: 65, currency: "AUD" });
  add({ occurredOn: day(18), merchant: "Fresh Grocer", item: null, category: "Shopping & Memberships", scope: "personal", amount: 180 + (index % 3) * 20, currency: "AUD" });
  if (index === 3 || index === 10) add({ occurredOn: day(21), merchant: "Skyhop Airlines", item: "Flight", category: "Travel & Transport", scope: "personal", amount: 640, currency: "AUD" });
  if (index <= 5) add({ occurredOn: day(12), merchant: "Old Gym", item: "Membership", category: "Health & Wellness", scope: "personal", amount: 59, currency: "AUD" });
  // Property: loan, agent, and a body corporate levy every third month.
  add({ source: "property_ledger", occurredOn: day(13), merchant: "Home loan", item: "Monthly repayment", category: "property_loan_repayment", scope: "property", amount: 3034.12, currency: "AUD", evidence: "Cost ledger", accountEmail: null });
  add({ source: "property_ledger", occurredOn: day(17), merchant: "Sample Realty", item: "Management fee", category: "property_management_fee", scope: "property", amount: 101.24, currency: "AUD", evidence: "Cost ledger", accountEmail: null });
  if (index % 3 === 1) add({ source: "property_ledger", occurredOn: day(20), merchant: "Sample Body Corporate", item: "Quarterly levy", category: "property_body_corporate", scope: "property", amount: 1800 + index * 40, currency: "AUD", evidence: "Cost ledger", accountEmail: null });
}
// A yearly bill, a refund, an unpriced row, a flagged pair and a superseded inbox copy.
add({ occurredOn: "2025-10-03", merchant: "Domain Names Co", item: "Annual renewal", category: "Cloud & Workspace", scope: "os", amount: 36, currency: "USD", registryKey: "domain-names-co" });
add({ occurredOn: "2026-08-22", merchant: "Streamflix", item: "Refund", category: "Entertainment & Streaming", scope: "personal", amount: 22.99, currency: "AUD", kind: "refund" });
add({ occurredOn: "2026-08-28", merchant: "Mystery Shop", item: "Receipt with no total", category: "Other", scope: "personal", amount: null, currency: null, flags: ["unpriced"], confidence: "Low" });
add({ occurredOn: "2026-08-30", merchant: "Demo Cloud", item: "Pro", category: "Cloud & Workspace", scope: "os", amount: 25, currency: "USD", registryKey: "demo-cloud", flags: ["possible_duplicate"], possibleDuplicateOfRef: "cc_invoices:0000000000000f01" });
add({ source: "cc_invoices", sourceRef: "0000000000000f01", occurredOn: "2026-09-01", merchant: "Demo Cloud", item: "Pro", scope: "os", amount: 25.25, currency: "USD", registryKey: "demo-cloud", flags: ["possible_duplicate"], possibleDuplicateOfRef: "bills_sheet:00000000000000ff", evidence: "Inbox receipt", accountEmail: null });
add({ source: "cc_invoices", sourceRef: "0000000000000f02", occurredOn: "2026-09-02", merchant: "Sample AI", item: "Max plan", scope: "os", amount: 300, currency: "USD", registryKey: "sample-ai", supersededByRef: `bills_sheet:${items.find((row) => row.occurredOn === "2026-09-02" && row.merchant === "Sample AI").sourceRef}`, flags: ["matched_by_amount"], evidence: "Inbox receipt", accountEmail: null });

const merchants = [
  { merchantKey: "sample-ai", displayName: "Sample AI", registryKey: "sample-ai", category: "llm", scopeDefault: "os", includedUsd: null, overageTriggerUsd: null, cycleUsd: null, cycleStart: null, cycleEnd: null, topUpUrl: null, active: true, itemCount: 13, firstSeenOn: months[0] + "-02", lastSeenOn: "2026-09-02" },
  { merchantKey: "scrapewell", displayName: "Scrapewell", registryKey: "scrapewell", category: "data", scopeDefault: "os", includedUsd: 49, overageTriggerUsd: 20, cycleUsd: 63, cycleStart: "2026-08-15", cycleEnd: "2026-09-15", topUpUrl: null, active: true, itemCount: 13, firstSeenOn: months[0] + "-15", lastSeenOn: "2026-08-15" },
  { merchantKey: "demo-cloud", displayName: "Demo Cloud", registryKey: "demo-cloud", category: "infra", scopeDefault: "os", includedUsd: null, overageTriggerUsd: null, cycleUsd: null, cycleStart: null, cycleEnd: null, topUpUrl: null, active: true, itemCount: 14, firstSeenOn: months[0] + "-06", lastSeenOn: "2026-09-01" },
  { merchantKey: "flowmatic", displayName: "Flowmatic", registryKey: "flowmatic", category: "infra", scopeDefault: "os", includedUsd: null, overageTriggerUsd: null, cycleUsd: null, cycleStart: null, cycleEnd: null, topUpUrl: null, active: true, itemCount: 7, firstSeenOn: months[0] + "-11", lastSeenOn: "2026-09-11", },
  { merchantKey: "streamflix", displayName: "Streamflix", registryKey: null, category: "Entertainment & Streaming", scopeDefault: "personal", includedUsd: null, overageTriggerUsd: null, cycleUsd: null, cycleStart: null, cycleEnd: null, topUpUrl: null, active: true, itemCount: 14, firstSeenOn: months[0] + "-04", lastSeenOn: "2026-09-04" },
];

const meterDays = [];
const meterUnits = [
  { provider: "anthropic", unitKind: "model", unitKey: "model-large", label: "Large model", category: null, usd: 0, usd7d: 0, runs: 0, failed: 0, units: 0, unitName: "tokens" },
  { provider: "apify", unitKind: "actor", unitKey: "scraper-a", label: "Listing scraper", category: "collect", usd: 0, usd7d: 0, runs: 0, failed: 0, units: 0, unitName: "results" },
  { provider: "n8n", unitKind: "workflow", unitKey: "wf-1", label: "Morning brief", category: null, usd: 0, usd7d: 0, runs: 0, failed: 0, units: 0, unitName: "executions" },
];
for (let back = 29; back >= 0; back -= 1) {
  const value = new Date(`${AS_OF}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - back);
  const day = value.toISOString().slice(0, 10);
  const perUnit = [6.5, 1.8, 0.4];
  let total = 0;
  meterUnits.forEach((unit, index) => {
    const usd = perUnit[index];
    unit.usd = Math.round((unit.usd + usd) * 100) / 100;
    if (back <= 6) unit.usd7d = Math.round((unit.usd7d + usd) * 100) / 100;
    unit.runs += index === 0 ? 40 : 3;
    unit.units += index === 0 ? 900000 : 120;
    total += usd;
  });
  meterDays.push({ day, usd: Math.round(total * 100) / 100 });
}

const day = {
  generatedAt: `${AS_OF}T21:00:00.000Z`,
  items,
  merchants,
  overrides: [{ merchantKey: "domain-names-co", scope: "os", displayName: "Domain Names Co", note: "Registrar for the operating system domains" }],
  meter: { since: meterDays[0].day, units: meterUnits, days: meterDays, silent: [] },
  cycles: [{ key: "scrapewell", name: "Scrapewell", includedUsd: 49, overageTriggerUsd: 20, cycleUsd: 63, cycleStart: "2026-08-15", cycleEnd: "2026-09-15", state: "over_prepaid", overUsd: 14, headroomUsd: -14, topUpUrl: null }],
  fxAsOf: [
    { currency: "EUR", rateOn: "2026-09-03", perAud: 0.6 },
    { currency: "GBP", rateOn: "2026-09-03", perAud: 0.5 },
    { currency: "USD", rateOn: "2026-09-03", perAud: 0.66 },
  ],
  lastRun: {
    runOn: AS_OF,
    status: "complete",
    finishedAt: `${AS_OF}T20:46:00.000Z`,
    coverage: [
      { provider: "RBA exchange rates", status: "available", sourceDate: "2026-09-03" },
      { provider: "Control Center registry", status: "available" },
      { provider: "Bills sheet", status: "available", sourceDate: "2026-09-03" },
      { provider: "Control Center invoices", status: "available", sourceDate: "2026-09-02" },
      { provider: "Property ledger", status: "available", sourceDate: "2026-08-31" },
      { provider: "Control Center meter", status: "available", sourceDate: AS_OF },
    ],
    counts: { items: items.length },
    dedupe: { exact: 0, tier1: 1, tier2: 1 },
    limitation: null,
  },
  // A round made-up balance so the runway line shows in demo mode.
  cash: { asOf: "2026-09-03", amountUsd: 42000 },
};

const target = fileURLToPath(new URL("../src/demo/spend.json", import.meta.url));
writeFileSync(target, `${JSON.stringify(day, null, 2)}\n`);
console.log(`Wrote ${items.length} demo spend items to ${target}`);
