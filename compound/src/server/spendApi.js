/**
 * Pure composition of the spend day from PostgREST rows. No I/O, so it is
 * tested directly. Column names are the database's; keys are the browser's.
 * The meter block is a breakdown for the operating-system section and is never
 * summed into a total here or in the browser.
 */

const METER_PROVIDERS = ["anthropic", "apify", "n8n"];

function number(value) {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function required(value) {
  const parsed = number(value);
  return parsed == null ? 0 : parsed;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function daysBefore(iso, days) {
  const value = new Date(`${iso}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function firstOfMonthMonthsBack(iso, months) {
  const value = new Date(`${iso}T00:00:00Z`);
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() - months);
  return value.toISOString().slice(0, 10);
}

/** Port of the Control Center cycle ladder, over the mirrored merchant rows. */
export function cyclesFrom(merchants) {
  return (merchants ?? [])
    .filter((row) => row.included_usd != null)
    .map((row) => {
      const included = required(row.included_usd);
      const trigger = number(row.overage_trigger_usd);
      const used = row.cycle_usd != null
        ? required(row.cycle_usd)
        : row.balance != null && row.balance_unit === "usd"
        ? included - required(row.balance)
        : null;
      const over = used == null ? 0 : Math.max(0, round2(used - included));
      const state = used == null
        ? "unknown"
        : over <= 0
        ? "within"
        : trigger != null && over >= trigger
        ? "charging_early"
        : trigger != null && over >= trigger * 0.8
        ? "near_trigger"
        : "over_prepaid";
      return {
        key: row.registry_key ?? row.merchant_key,
        name: row.display_name,
        includedUsd: included,
        overageTriggerUsd: trigger,
        cycleUsd: used == null ? null : round2(used),
        cycleStart: row.cycle_start ?? null,
        cycleEnd: row.cycle_end ?? null,
        state,
        overUsd: over,
        headroomUsd: used == null ? null : round2(included - used),
        topUpUrl: row.top_up_url ?? null,
      };
    })
    .sort((a, b) => b.overUsd - a.overUsd || a.name.localeCompare(b.name));
}

/** Top meter units over the window with a seven day figure, plus a per-day total. */
export function meterFrom(rows, asOf, since) {
  const sevenDaysAgo = daysBefore(asOf, 6);
  const units = new Map();
  const days = new Map();
  const providers = new Set();
  for (const row of rows ?? []) {
    const usd = required(row.usd);
    providers.add(row.provider);
    const unitKey = `${row.provider}|${row.unit_kind}|${row.unit_key}`;
    const unit = units.get(unitKey) ?? {
      provider: row.provider,
      unitKind: row.unit_kind,
      unitKey: row.unit_key,
      label: row.unit_label ?? row.unit_key,
      category: row.category ?? null,
      usd: 0,
      usd7d: 0,
      runs: 0,
      failed: 0,
      units: 0,
      unitName: row.unit_name ?? null,
    };
    unit.usd = round2(unit.usd + usd);
    if (row.day >= sevenDaysAgo) unit.usd7d = round2(unit.usd7d + usd);
    unit.runs += required(row.runs);
    unit.failed += required(row.failed);
    unit.units += required(row.units);
    if (!unit.label && row.unit_label) unit.label = row.unit_label;
    units.set(unitKey, unit);
    days.set(row.day, round2((days.get(row.day) ?? 0) + usd));
  }
  return {
    since,
    units: [...units.values()].sort((a, b) => b.usd - a.usd || a.label.localeCompare(b.label)).slice(0, 20),
    days: [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, usd]) => ({ day, usd })),
    silent: METER_PROVIDERS.filter((provider) => !providers.has(provider)),
  };
}

export function composeSpendDay(rows, options = {}) {
  const generatedAt = options.now ?? new Date().toISOString();
  const asOf = generatedAt.slice(0, 10);
  const items = (rows.items ?? []).map((row) => ({
    source: row.source,
    sourceRef: row.source_ref,
    occurredOn: row.occurred_on,
    merchant: row.merchant,
    merchantKey: row.merchant_key,
    registryKey: row.registry_key ?? null,
    item: row.item ?? null,
    category: row.category ?? null,
    scope: row.scope,
    scopeReason: row.scope_reason,
    kind: row.kind,
    amount: number(row.amount),
    currency: row.currency ?? null,
    amountUsd: number(row.amount_usd),
    fxRate: number(row.fx_rate),
    fxDate: row.fx_date ?? null,
    fxSource: row.fx_source ?? null,
    evidence: row.evidence ?? null,
    accountEmail: row.account_email ?? null,
    confidence: row.confidence ?? null,
    invoiceRef: row.invoice_ref ?? null,
    supersededByRef: row.superseded_by_ref ?? null,
    possibleDuplicateOfRef: row.possible_duplicate_of_ref ?? null,
    flags: Array.isArray(row.flags) ? row.flags : [],
    syncedAt: row.synced_at,
  }));
  const merchants = (rows.merchants ?? []).map((row) => ({
    merchantKey: row.merchant_key,
    displayName: row.display_name,
    registryKey: row.registry_key ?? null,
    category: row.category ?? null,
    scopeDefault: row.scope_default,
    includedUsd: number(row.included_usd),
    overageTriggerUsd: number(row.overage_trigger_usd),
    cycleUsd: number(row.cycle_usd),
    cycleStart: row.cycle_start ?? null,
    cycleEnd: row.cycle_end ?? null,
    topUpUrl: row.top_up_url ?? null,
    active: row.active !== false,
    itemCount: required(row.item_count),
    firstSeenOn: row.first_seen_on ?? null,
    lastSeenOn: row.last_seen_on ?? null,
  }));
  const latestFx = new Map();
  for (const row of rows.fx ?? []) {
    if (!latestFx.has(row.currency) || latestFx.get(row.currency).rateOn < row.rate_on) {
      latestFx.set(row.currency, { currency: row.currency, rateOn: row.rate_on, perAud: required(row.per_aud) });
    }
  }
  const run = rows.run ?? null;
  const limited = items.length >= (options.itemCap ?? 3000);
  return {
    generatedAt,
    items,
    merchants,
    overrides: (rows.overrides ?? []).map((row) => ({
      merchantKey: row.merchant_key,
      scope: row.scope,
      displayName: row.display_name ?? null,
      note: row.note ?? null,
    })),
    meter: meterFrom(rows.meter ?? [], asOf, options.meterSince ?? daysBefore(asOf, 29)),
    cycles: cyclesFrom(rows.merchants ?? []),
    fxAsOf: [...latestFx.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    lastRun: run
      ? {
        runOn: run.run_on,
        status: run.status,
        finishedAt: run.finished_at ?? null,
        coverage: Array.isArray(run.provider_results?.coverage) ? run.provider_results.coverage : [],
        counts: run.provider_results?.counts ?? null,
        dedupe: run.provider_results?.dedupe
          ? { exact: required(run.provider_results.dedupe.exact), tier1: required(run.provider_results.dedupe.tier1), tier2: required(run.provider_results.dedupe.tier2) }
          : null,
        limitation: limited ? "Only the most recent 3,000 items are shown." : null,
      }
      : null,
  };
}

/** The PostgREST queries for one member's spend, in the order the route runs them. */
export function spendQueries({ asOf, months = 12, meterDays = 29, fxDays = 10 } = {}) {
  const today = asOf ?? new Date().toISOString().slice(0, 10);
  const since = firstOfMonthMonthsBack(today, months);
  const meterSince = daysBefore(today, meterDays);
  const fxSince = daysBefore(today, fxDays);
  return {
    since,
    meterSince,
    items: `spend_items?select=source,source_ref,occurred_on,merchant,merchant_key,registry_key,item,category,scope,scope_reason,kind,amount,currency,amount_usd,fx_rate,fx_date,fx_source,evidence,account_email,confidence,invoice_ref,superseded_by_ref,possible_duplicate_of_ref,flags,synced_at&hidden=is.false&occurred_on=gte.${since}&order=occurred_on.desc,merchant.asc&limit=3000`,
    merchants: `spend_merchants?select=merchant_key,display_name,registry_key,category,scope_default,included_usd,overage_trigger_usd,cycle_usd,cycle_start,cycle_end,balance,balance_unit,top_up_url,active,item_count,first_seen_on,last_seen_on&order=display_name.asc&limit=500`,
    overrides: `spend_merchant_overrides?select=merchant_key,scope,display_name,note&limit=500`,
    meter: `spend_meter_daily?select=provider,unit_kind,unit_key,day,bucket,unit_label,category,usd,runs,failed,units,unit_name&day=gte.${meterSince}&limit=10000`,
    fx: `spend_fx_rates?select=rate_on,currency,per_aud&rate_on=gte.${fxSince}&order=rate_on.desc&limit=60`,
    run: `spend_runs?select=run_on,status,finished_at,provider_results&status=in.(complete,partial)&order=run_on.desc,started_at.desc&limit=1`,
  };
}
