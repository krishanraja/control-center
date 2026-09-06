import { collectMarket } from "./collect.ts";
import { estimateValue } from "./engines/valuation.ts";
import { rankSuburbs } from "./engines/ranking.ts";
import { collectLedgerSheet } from "./providers/ledgerSheet.ts";
import {
  beginPropertyRun,
  finishPropertyRun,
  listActiveProperties,
  listObservations,
  replaceRankings,
  resolveSecret,
  upsertLedgerRows,
  upsertObservations,
  writeValuation,
} from "./supabase.ts";
import { ENGINE_VERSION, TARGET_SUBURBS } from "./targets.ts";
import type { Coverage, PropertyRow } from "./types.ts";

type Mode = "scheduled" | "manual" | "import";

export interface RunOptions {
  runOn: string;
  mode: Mode;
  attempt: number;
  dryRun?: boolean;
}

function buildingKey(property: PropertyRow): string {
  // Building sales are recorded against the street address without the unit,
  // so any unit in the block shares the key. The import CLI writes the same form.
  return `${property.slug}`;
}

function daysBefore(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export async function runProperty(options: RunOptions): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.runOn)) throw new Error("run date must use YYYY-MM-DD");
  const properties = options.dryRun
    ? [{
      id: "dry-run", user_id: "dry-run", slug: "dry-run", suburb: "Highgate Hill", postcode: "4101", dwelling_type: "unit" as const,
      bedrooms: 2, bathrooms: 2, car_spaces: 1, purchase_price_aud: 600000, settled_on: "2024-11-14",
    }]
    : await listActiveProperties();
  if (properties.length === 0) throw new Error("No active property is configured");
  const subject = properties[0];

  const run = options.dryRun ? undefined : await beginPropertyRun({ runOn: options.runOn, mode: options.mode, attempt: options.attempt });
  // A scheduled retry stops once the day is complete. A partial day is worth
  // another go, and a manual dispatch always runs.
  if (run && run.status === "complete" && options.mode === "scheduled") {
    console.log(`Property run ${options.runOn} already complete; skipping`);
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 240_000);
  const coverage: Coverage[] = [];
  try {
    const context = {
      runOn: options.runOn,
      targets: TARGET_SUBURBS,
      subjectPostcode: subject.postcode,
      subjectBedrooms: subject.bedrooms,
      signal: controller.signal,
      secret: resolveSecret,
    };

    const market = await collectMarket(context);
    coverage.push(...market.coverage);
    let observationsWritten = 0;
    if (!options.dryRun) observationsWritten = await upsertObservations(market.evidence.observations);

    const ledgerResults: Record<string, unknown> = {};
    for (const property of properties) {
      try {
        const ledger = await collectLedgerSheet(context, { userId: property.user_id, propertyId: property.id });
        coverage.push(ledger.coverage);
        if (!options.dryRun && ledger.rows.length > 0) await upsertLedgerRows(ledger.rows);
        ledgerResults[property.slug] = { rows: ledger.rows.length, status: ledger.coverage.status };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        coverage.push({ provider: "Ledger sheet", status: "failed", limitation: message });
        ledgerResults[property.slug] = { rows: 0, status: "failed", error: message };
      }
    }

    const observations = options.dryRun ? market.evidence.observations : await listObservations({ since: daysBefore(options.runOn, 3 * 365) });
    const valuations: Record<string, unknown> = {};
    for (const property of properties) {
      const result = estimateValue({
        postcode: property.postcode,
        bedrooms: property.bedrooms,
        carSpaces: property.car_spaces,
        purchasePrice: Number(property.purchase_price_aud),
        settledOn: property.settled_on,
        buildingKey: buildingKey(property),
      }, observations, options.runOn);
      valuations[property.slug] = { mid: result.mid, low: result.low, high: result.high, confidence: result.confidence };
      if (!options.dryRun) {
        await writeValuation({
          userId: property.user_id,
          propertyId: property.id,
          estimatedOn: property.settled_on,
          method: "purchase_price",
          low: null,
          mid: Number(property.purchase_price_aud),
          high: null,
          confidence: "high",
          inputs: { method: "purchase price at settlement" },
          engineVersion: ENGINE_VERSION,
          runId: run?.id,
        });
        await writeValuation({
          userId: property.user_id,
          propertyId: property.id,
          estimatedOn: options.runOn,
          method: "hedonic_lite_v1",
          low: result.low,
          mid: result.mid,
          high: result.high,
          confidence: result.confidence,
          inputs: result.inputs,
          engineVersion: ENGINE_VERSION,
          runId: run?.id,
        });
      }
    }

    const ranking = rankSuburbs(observations, TARGET_SUBURBS, subject.bedrooms);
    if (!options.dryRun) {
      await replaceRankings(options.runOn, ranking.map((row) => ({
        run_on: options.runOn,
        suburb: row.suburb,
        postcode: row.postcode,
        dwelling_type: "unit",
        bedrooms: subject.bedrooms,
        score: row.score,
        rank: row.rank,
        gross_yield_pct: row.grossYieldPct,
        rent_growth_pct: row.rentGrowthPct,
        price_growth_pct: row.priceGrowthPct,
        listing_count: row.listingCount,
        median_sold_price_aud: row.medianSoldPriceAud,
        median_weekly_rent_aud: row.medianWeeklyRentAud,
        inputs: row.inputs,
        missing: row.missing,
        engine_version: ENGINE_VERSION,
      })));
    }

    const providerResults = {
      coverage,
      observationsWritten,
      ledger: ledgerResults,
      valuations,
      rankingRows: ranking.length,
    };
    if (options.dryRun) {
      console.log(JSON.stringify({ providerResults, ranking, sampleObservations: observations.slice(0, 5) }, null, 2));
      return;
    }
    const degraded = coverage.some((source) => source.status === "failed" || source.status === "not_configured");
    await finishPropertyRun(run!.id, { status: degraded ? "partial" : "complete", providerResults });
    console.log(`Property run ${options.runOn} ${degraded ? "partial" : "complete"}: ${observationsWritten} observations, ${ranking.length} ranked suburbs`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (run) await finishPropertyRun(run.id, { status: "failed", errorSummary: message, providerResults: { coverage } });
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
  if (!["scheduled", "manual", "import"].includes(mode)) throw new Error("unsupported mode");
  await runProperty({
    runOn: values.get("date") ?? new Date().toISOString().slice(0, 10),
    mode,
    attempt: Number(values.get("attempt") ?? "1"),
    dryRun: values.get("dry-run") === "true",
  });
}
