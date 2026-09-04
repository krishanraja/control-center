import { listMembers } from "../supabase.ts";
import { resolveSecret } from "../property/supabase.ts";
import { classify, merchantKey } from "./engines/classify.ts";
import { dedupeItems, FUZZY_SUPERSEDES } from "./engines/dedupe.ts";
import { buildFxTable, toUsd } from "./engines/fx.ts";
import { collectBillsSheet } from "./providers/billsSheet.ts";
import { collectInvoices, collectMeter, collectRegistry } from "./providers/controlCenter.ts";
import { collectPropertyLedger } from "./providers/propertyLedger.ts";
import { collectFx } from "./providers/rbaFx.ts";
import {
  beginSpendRun,
  finishSpendRun,
  hideVanished,
  listOverrides,
  replaceMerchants,
  replaceMeterWindow,
  upsertFxRates,
  upsertSpendItems,
} from "./supabase.ts";
import {
  FLAGS,
  toNumber,
  type Coverage,
  type FxRate,
  type MerchantInput,
  type OverrideRow,
  type RegistryRow,
  type Scope,
  type SpendContext,
  type SpendItemInput,
  type SpendSource,
} from "./types.ts";

type Mode = "scheduled" | "manual";

export interface RunOptions {
  runOn: string;
  mode: Mode;
  attempt: number;
  dryRun?: boolean;
}

/** Fills merchant, scope and USD on every item. Pure; returns the same array. */
export function classifyAndPrice(items: SpendItemInput[], registry: RegistryRow[], overrides: OverrideRow[], rates: FxRate[]): SpendItemInput[] {
  const table = buildFxTable(rates);
  for (const item of items) {
    const subject = typeof item.detail.subject === "string" ? item.detail.subject : null;
    const decided = classify({ ...item, service_key: item.registry_key, subject }, registry, overrides);
    item.merchant_key = decided.merchant_key;
    item.registry_key = decided.registry_key;
    item.scope = decided.scope;
    item.scope_reason = decided.scope_reason;
    if (item.amount_usd == null && item.amount != null && item.currency) {
      const priced = toUsd(item.amount, item.currency, item.occurred_on, table);
      item.amount_usd = priced.amount_usd;
      item.fx_rate = priced.fx_rate;
      item.fx_date = priced.fx_date;
      item.fx_source = priced.fx_source;
    }
    if (item.amount_usd == null && !item.flags.includes(FLAGS.unpriced)) item.flags.push(FLAGS.unpriced);
    item.dedupe_key = [item.merchant_key, item.currency ?? "", item.amount ?? "", item.occurred_on].join("|");
  }
  return items;
}

function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** The registry mirrored, plus every merchant the items discovered. */
export function buildMerchants(userId: string, registry: RegistryRow[], items: SpendItemInput[]): MerchantInput[] {
  const byKey = new Map<string, MerchantInput>();
  for (const row of registry) {
    const key = merchantKey(row.key);
    byKey.set(key, {
      user_id: userId,
      merchant_key: key,
      display_name: row.display_name,
      registry_key: row.key,
      category: row.category,
      scope_default: "os",
      vendor_match: row.vendor_match ?? [],
      included_usd: toNumber(row.included_usd),
      overage_trigger_usd: toNumber(row.overage_trigger_usd),
      cycle_usd: toNumber(row.cycle_usd),
      cycle_start: row.cycle_start,
      cycle_end: row.cycle_end,
      balance: toNumber(row.balance),
      balance_unit: row.balance_unit,
      top_up_url: row.top_up_url,
      active: row.active !== false,
      first_seen_on: null,
      last_seen_on: null,
      item_count: 0,
    });
  }
  const grouped = new Map<string, SpendItemInput[]>();
  for (const item of items) {
    if (item.hidden || item.superseded_by_ref) continue;
    const key = item.registry_key ? merchantKey(item.registry_key) : item.merchant_key;
    const group = grouped.get(key) ?? [];
    group.push(item);
    grouped.set(key, group);
  }
  for (const [key, group] of grouped) {
    const dates = group.map((item) => item.occurred_on).sort();
    const existing = byKey.get(key);
    if (existing) {
      existing.first_seen_on = dates[0];
      existing.last_seen_on = dates.at(-1) ?? null;
      existing.item_count = group.length;
      continue;
    }
    byKey.set(key, {
      user_id: userId,
      merchant_key: key,
      display_name: mostCommon(group.map((item) => item.merchant)) ?? key,
      registry_key: group[0].registry_key,
      category: mostCommon(group.map((item) => item.category).filter((value): value is string => value != null)) ?? null,
      scope_default: (mostCommon(group.map((item) => item.scope)) ?? "personal") as Scope,
      vendor_match: [],
      included_usd: null,
      overage_trigger_usd: null,
      cycle_usd: null,
      cycle_start: null,
      cycle_end: null,
      balance: null,
      balance_unit: null,
      top_up_url: null,
      active: true,
      first_seen_on: dates[0],
      last_seen_on: dates.at(-1) ?? null,
      item_count: group.length,
    });
  }
  return [...byKey.values()];
}

interface Collected<T> {
  value: T | null;
  coverage: Coverage;
}

async function attempt<T>(provider: string, work: () => Promise<{ coverage: Coverage } & T>): Promise<Collected<T>> {
  try {
    const result = await work();
    return { value: result, coverage: result.coverage };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { value: null, coverage: { provider, status: "failed", limitation: message } };
  }
}

export async function runSpend(options: RunOptions): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.runOn)) throw new Error("run date must use YYYY-MM-DD");
  const members = options.dryRun && !Deno.env.get("SUPABASE_URL") ? [{ user_id: "dry-run", display_name: null }] : await listMembers();
  if (members.length === 0) throw new Error("No COMPOUND member is configured");
  const member = members[0];

  const run = options.dryRun ? undefined : await beginSpendRun({ runOn: options.runOn, mode: options.mode, attempt: options.attempt });
  if (run && run.status === "complete" && options.mode === "scheduled") {
    console.log(`Spend run ${options.runOn} already complete; skipping`);
    return;
  }
  const runStartedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 240_000);
  const coverage: Coverage[] = [];
  try {
    const context: SpendContext = { runOn: options.runOn, userId: member.user_id, signal: controller.signal, secret: resolveSecret };
    const hasDatabase = Boolean(Deno.env.get("SUPABASE_URL"));

    const fx = await attempt("RBA exchange rates", () => collectFx(context));
    const registry = hasDatabase ? await attempt("Control Center registry", () => collectRegistry(context)) : { value: null, coverage: { provider: "Control Center registry", status: "not_configured" as const, limitation: "No database in a dry run." } };
    const bills = await attempt("Bills sheet", () => collectBillsSheet(context));
    const invoices = hasDatabase ? await attempt("Control Center invoices", () => collectInvoices(context)) : { value: null, coverage: { provider: "Control Center invoices", status: "not_configured" as const, limitation: "No database in a dry run." } };
    const ledger = hasDatabase ? await attempt("Property ledger", () => collectPropertyLedger(context)) : { value: null, coverage: { provider: "Property ledger", status: "not_configured" as const, limitation: "No database in a dry run." } };
    const meter = hasDatabase ? await attempt("Control Center meter", () => collectMeter(context)) : { value: null, coverage: { provider: "Control Center meter", status: "not_configured" as const, limitation: "No database in a dry run." } };
    coverage.push(fx.coverage, registry.coverage, bills.coverage, invoices.coverage, ledger.coverage, meter.coverage);

    const overrides = hasDatabase && !options.dryRun ? await listOverrides(member.user_id) : hasDatabase ? await listOverrides(member.user_id).catch(() => []) : [];
    const items = [...(bills.value?.items ?? []), ...(invoices.value?.items ?? []), ...(ledger.value?.items ?? [])];
    classifyAndPrice(items, registry.value?.rows ?? [], overrides, fx.value?.rates ?? []);
    const dedupe = dedupeItems(items);
    const merchants = buildMerchants(member.user_id, registry.value?.rows ?? [], items);

    const counts = {
      items: items.length,
      bySource: Object.fromEntries((["bills_sheet", "cc_invoices", "property_ledger"] as SpendSource[]).map((source) => [source, items.filter((item) => item.source === source).length])),
      superseded: items.filter((item) => item.superseded_by_ref).length,
      unpriced: items.filter((item) => item.flags.includes(FLAGS.unpriced)).length,
      byScope: Object.fromEntries((["personal", "os", "property"] as Scope[]).map((scope) => [scope, items.filter((item) => item.scope === scope && !item.superseded_by_ref).length])),
      merchants: merchants.length,
      fxRates: fx.value?.rates.length ?? 0,
      meterRows: meter.value?.rows.length ?? 0,
    };
    const providerResults = { coverage, counts, dedupe: { ...dedupe, fuzzySupersedes: FUZZY_SUPERSEDES, pairs: dedupe.pairs.slice(0, 200) } };

    if (options.dryRun) {
      console.log(JSON.stringify({ providerResults, sampleItems: items.slice(0, 5) }, null, 2));
      return;
    }

    if (fx.value) await upsertFxRates(fx.value.rates);
    await upsertSpendItems(items, runStartedAt);
    for (const [source, collected] of [["bills_sheet", bills], ["cc_invoices", invoices], ["property_ledger", ledger]] as Array<[SpendSource, Collected<unknown>]>) {
      // A source that failed to read must not hide its rows; they are simply not refreshed today.
      if (collected.value) await hideVanished(member.user_id, source, runStartedAt);
    }
    await replaceMerchants(member.user_id, merchants, runStartedAt);
    if (meter.value) await replaceMeterWindow(meter.value.since, meter.value.rows, runStartedAt);

    const degraded = coverage.some((source) => source.status === "failed" || source.status === "not_configured");
    await finishSpendRun(run!.id, { status: degraded ? "partial" : "complete", providerResults });
    console.log(`Spend run ${options.runOn} ${degraded ? "partial" : "complete"}: ${items.length} items, ${counts.superseded} superseded, ${merchants.length} merchants`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (run) await finishSpendRun(run.id, { status: "failed", errorSummary: message, providerResults: { coverage } });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
  const mode = (values.get("mode") ?? "manual") as Mode;
  if (!["scheduled", "manual"].includes(mode)) throw new Error("unsupported mode");
  await runSpend({
    runOn: values.get("date") ?? new Date().toISOString().slice(0, 10),
    mode,
    attempt: Number(values.get("attempt") ?? "1"),
    dryRun: values.get("dry-run") === "true",
  });
}
