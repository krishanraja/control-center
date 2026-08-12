import { sendFinalFailureAlert } from "./alert.ts";
import { addWorldContext } from "./context.ts";
import { buildDailyBrief } from "./intelligence.ts";
import { type ArchivedSnapshot, ENGINE_VERSION, SNAPSHOT_SCHEMA_VERSION } from "./model.ts";
import { collectEvidence } from "./providers/collect.ts";
import { deriveCandidates } from "./rules.ts";
import { easternClock, isDailyPublicationWindow } from "./schedule.ts";
import { beginRun, finishRun, listMembers, publishSnapshot } from "./supabase.ts";

type PipelineMode = "scheduled" | "manual" | "backfill";

export interface RunDateOptions {
  date: string;
  mode: PipelineMode;
  attempt: number;
  dryRun?: boolean;
}

function providerResults(result: Awaited<ReturnType<typeof collectEvidence>>): Record<string, unknown> {
  return {
    successes: result.successes.map((item) => ({ provider: item.provider, latencyMs: item.latencyMs })),
    failures: result.failures.map((item) => ({
      provider: item.provider,
      domains: item.domains,
      latencyMs: item.latencyMs,
      error: item.error,
    })),
    coverage: result.coverage,
  };
}

async function buildSnapshots(
  userId: string,
  options: RunDateOptions,
  collection: Awaited<ReturnType<typeof collectEvidence>>,
): Promise<ArchivedSnapshot[]> {
  const publishedAt = new Date().toISOString();
  const origin = options.mode === "backfill" ? "reconstructed" as const : "captured" as const;
  const snapshots: ArchivedSnapshot[] = [];

  for (const horizon of ["3m", "1y"] as const) {
    const set = deriveCandidates(collection.evidence, publishedAt, horizon);
    let brief = buildDailyBrief({
      asOf: options.date,
      generatedAt: publishedAt,
      candidates: set.candidates,
      stableCheckpoints: set.stableCheckpoints,
      coverageLimitations: collection.coverage.limitations,
    });
    if (origin === "captured" && !options.dryRun) {
      brief = {
        ...brief,
        stories: await addWorldContext({ userId, snapshotDate: options.date, stories: brief.stories }),
      };
    }
    const status = brief.state === "quiet"
      ? "quiet" as const
      : collection.failures.length > 0
      ? "partial" as const
      : "complete" as const;
    snapshots.push({
      snapshotDate: options.date,
      publishedAt,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      origin,
      status,
      horizon,
      coverage: collection.coverage,
      brief,
      evidence: {
        metrics: collection.evidence.metrics,
        industries: collection.evidence.industries,
        providerMetadata: collection.evidence.raw,
      },
    });
  }
  return snapshots;
}

export async function runDate(options: RunDateOptions): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) throw new Error("date must use YYYY-MM-DD");
  if (!Number.isInteger(options.attempt) || options.attempt < 1 || options.attempt > 3) {
    throw new Error("attempt must be 1, 2, or 3");
  }

  const members = options.dryRun ? [{ user_id: "dry-run", display_name: "Dry run" }] : await listMembers();
  if (members.length === 0) throw new Error("No approved COMPOUND members are configured");

  for (const member of members) {
    const run = options.dryRun ? undefined : await beginRun({
      userId: member.user_id,
      snapshotDate: options.date,
      mode: options.mode,
      attempt: options.attempt,
    });
    if (run && ["complete", "partial", "skipped"].includes(run.status)) {
      console.log(`COMPOUND ${options.date} already finished for ${member.user_id}; skipping`);
      continue;
    }

    let failedFeeds: string[] = [];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);
      const collection = await collectEvidence({
        asOf: options.date,
        reconstructed: options.mode === "backfill",
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      failedFeeds = collection.failures.map((failure) => failure.provider);
      const snapshots = await buildSnapshots(member.user_id, options, collection);

      if (options.dryRun) {
        console.log(JSON.stringify({ snapshots, providerResults: providerResults(collection) }, null, 2));
        continue;
      }

      const snapshotIds: string[] = [];
      for (const snapshot of snapshots) {
        snapshotIds.push(await publishSnapshot(member.user_id, snapshot));
      }
      const runStatus = snapshots.some((snapshot) => snapshot.status === "partial") ? "partial" : "complete";
      await finishRun(run!.id, {
        status: runStatus,
        providerResults: { ...providerResults(collection), snapshotIds },
        snapshotId: snapshotIds[0],
      });
      console.log(`Published COMPOUND ${options.date} (${runStatus}) for ${member.user_id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (run) {
        await finishRun(run.id, {
          status: "failed",
          errorSummary: message,
          providerResults: { failedFeeds },
        });
        if (options.attempt === 3 && options.mode === "scheduled") {
          await sendFinalFailureAlert({
            runId: run.id,
            userId: member.user_id,
            snapshotDate: options.date,
            failedFeeds,
          });
        }
      }
      throw error;
    }
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
  const mode = (values.get("mode") ?? "manual") as PipelineMode;
  if (!["scheduled", "manual", "backfill"].includes(mode)) throw new Error("unsupported mode");
  const now = new Date();
  if (mode === "scheduled" && !isDailyPublicationWindow(now) && values.get("force") !== "true") {
    console.log("Skipping duplicate UTC cron outside the 06:30 Eastern publication window");
    Deno.exit(0);
  }
  const date = values.get("date") ?? easternClock(now).date;
  await runDate({
    date,
    mode,
    attempt: Number(values.get("attempt") ?? "1"),
    dryRun: values.get("dry-run") === "true",
  });
}
