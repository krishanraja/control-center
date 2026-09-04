import type { ArchivedSnapshot } from "./model.ts";

interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

interface MemberRow {
  user_id: string;
  display_name: string | null;
}

interface SnapshotRow {
  id: string;
  snapshot_date: string;
  published_at: string;
  origin: ArchivedSnapshot["origin"];
  status: ArchivedSnapshot["status"];
}

interface RunRow {
  id: string;
  status: "running" | "complete" | "partial" | "failed" | "skipped";
}

function config(): SupabaseConfig {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return { url: url.replace(/\/$/, ""), serviceRoleKey };
}

export async function rest<T>(
  path: string,
  init: RequestInit = {},
  profile = "compound",
): Promise<T> {
  const { url, serviceRoleKey } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Profile": profile,
      "Content-Profile": profile,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase ${response.status}: ${body.slice(0, 500)}`);
  }
  // `Prefer: return=minimal` answers 201 or 204 with no body; only parse when there is one.
  const text = await response.text();
  if (response.status === 204 || text.trim() === "") return undefined as T;
  return JSON.parse(text) as T;
}

export async function listMembers(): Promise<MemberRow[]> {
  return await rest<MemberRow[]>("members?select=user_id,display_name&order=created_at.asc");
}

export async function beginRun(options: {
  userId: string;
  snapshotDate: string;
  mode: "scheduled" | "manual" | "backfill";
  attempt: number;
}): Promise<RunRow> {
  const rows = await rest<RunRow[]>("snapshot_runs", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify({
      user_id: options.userId,
      snapshot_date: options.snapshotDate,
      mode: options.mode,
      attempt: options.attempt,
      status: "running",
    }),
  });
  if (rows[0]?.id) return rows[0];
  const existing = await rest<RunRow[]>(
    `snapshot_runs?select=id,status&user_id=eq.${options.userId}&snapshot_date=eq.${options.snapshotDate}&mode=eq.${options.mode}&attempt=eq.${options.attempt}&limit=1`,
  );
  if (!existing[0]?.id) throw new Error("Unable to create or recover snapshot run");
  return existing[0];
}

export async function finishRun(runId: string, values: {
  status: "complete" | "partial" | "failed" | "skipped";
  providerResults?: Record<string, unknown>;
  errorSummary?: string;
  snapshotId?: string;
}): Promise<void> {
  await rest(`snapshot_runs?id=eq.${runId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: values.status,
      finished_at: new Date().toISOString(),
      provider_results: values.providerResults ?? {},
      error_summary: values.errorSummary ?? null,
      snapshot_id: values.snapshotId ?? null,
    }),
  });
}

export async function findPublishedSnapshot(
  userId: string,
  snapshotDate: string,
  horizon: "3m" | "1y",
): Promise<SnapshotRow | undefined> {
  const rows = await rest<SnapshotRow[]>(
    `daily_snapshots?select=id,snapshot_date,published_at,origin,status&user_id=eq.${userId}&snapshot_date=eq.${snapshotDate}&horizon=eq.${horizon}&origin=in.(captured,reconstructed)&limit=1`,
  );
  return rows[0];
}

export async function latestSuccessfulSnapshot(userId: string): Promise<SnapshotRow | undefined> {
  const rows = await rest<SnapshotRow[]>(
    `daily_snapshots?select=id,snapshot_date,published_at,origin,status&user_id=eq.${userId}&origin=in.(captured,reconstructed)&status=in.(complete,partial,quiet)&order=snapshot_date.desc,published_at.desc&limit=1`,
  );
  return rows[0];
}

export async function publishSnapshot(userId: string, snapshot: ArchivedSnapshot): Promise<string> {
  const existing = await findPublishedSnapshot(userId, snapshot.snapshotDate, snapshot.horizon);
  if (existing) return existing.id;
  const rows = await rest<Array<{ id: string }>>("daily_snapshots", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: userId,
      as_of: snapshot.origin === "captured" ? snapshot.publishedAt : `${snapshot.snapshotDate}T23:59:59.999Z`,
      horizon: snapshot.horizon,
      status: snapshot.status,
      payload: snapshot,
      snapshot_date: snapshot.snapshotDate,
      published_at: snapshot.publishedAt,
      schema_version: snapshot.schemaVersion,
      engine_version: snapshot.engineVersion,
      origin: snapshot.origin,
      coverage: snapshot.coverage,
      brief: snapshot.brief,
    }),
  });
  if (!rows[0]?.id) throw new Error("Snapshot publication returned no id");
  return rows[0].id;
}

export async function readContextCache<T>(
  userId: string,
  snapshotDate: string,
  storyKey: string,
): Promise<T | undefined> {
  const rows = await rest<Array<{ response: T }>>(
    `snapshot_context_cache?select=response&user_id=eq.${userId}&snapshot_date=eq.${snapshotDate}&story_key=eq.${
      encodeURIComponent(storyKey)
    }&limit=1`,
  );
  return rows[0]?.response;
}

export async function writeContextCache(
  userId: string,
  snapshotDate: string,
  storyKey: string,
  response: Record<string, unknown>,
): Promise<void> {
  await rest("snapshot_context_cache", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
    body: JSON.stringify({ user_id: userId, snapshot_date: snapshotDate, story_key: storyKey, response }),
  });
}

export async function memberEmail(userId: string): Promise<string | undefined> {
  const { url, serviceRoleKey } = config();
  const response = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok) throw new Error(`Supabase Auth returned ${response.status}`);
  const user = await response.json() as { email?: string };
  return user.email;
}

export async function markAlertSent(runId: string): Promise<boolean> {
  const rows = await rest<Array<{ id: string }>>(`snapshot_runs?id=eq.${runId}&alert_sent_at=is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ alert_sent_at: new Date().toISOString() }),
  });
  return rows.length === 1;
}

export async function upsertBackfillCheckpoint(options: {
  userId: string;
  rangeStart: string;
  rangeEnd: string;
  nextDate: string;
  status: "pending" | "running" | "complete" | "failed";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await rest("snapshot_backfill_checkpoints?on_conflict=user_id,range_start,range_end", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: options.userId,
      range_start: options.rangeStart,
      range_end: options.rangeEnd,
      next_date: options.nextDate,
      status: options.status,
      metadata: options.metadata ?? {},
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function readBackfillCheckpoint(options: {
  userId: string;
  rangeStart: string;
  rangeEnd: string;
}): Promise<{ next_date: string; status: string } | undefined> {
  const rows = await rest<Array<{ next_date: string; status: string }>>(
    `snapshot_backfill_checkpoints?select=next_date,status&user_id=eq.${options.userId}&range_start=eq.${options.rangeStart}&range_end=eq.${options.rangeEnd}&limit=1`,
  );
  return rows[0];
}
