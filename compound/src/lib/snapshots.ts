import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { DashboardSnapshot, Horizon } from "../types";

interface SnapshotRow {
  id: string;
  as_of: string;
  horizon: Horizon;
  status: DashboardSnapshot["status"];
  payload: unknown;
}

const dashboardSnapshotSchema: z.ZodType<DashboardSnapshot> = z.object({
  id: z.string(),
  asOf: z.string(),
  dateLabel: z.string(),
  horizon: z.enum(["3m", "1y"]),
  status: z.enum(["representative", "partial", "quiet", "stale"]),
  verdict: z.object({ lead: z.string(), signal: z.string(), tail: z.string() }),
  freshness: z.object({ title: z.string(), detail: z.array(z.string()) }),
  facts: z.array(z.object({ label: z.string(), value: z.string(), attention: z.boolean().optional() })),
  dial: z.object({ count: z.string(), label: z.string(), detail: z.array(z.string()) }),
  review: z.object({
    badge: z.string(),
    title: z.string(),
    call: z.string(),
    holdingValue: z.string(),
    changed: z.string(),
    changedSource: z.string(),
    countercase: z.string(),
    countercaseSource: z.string(),
    serious: z.string(),
    seriousSource: z.string(),
  }),
  holdings: z.array(z.object({
    name: z.string(),
    share: z.string(),
    summary: z.string(),
    status: z.string(),
    attention: z.boolean().optional(),
    latest: z.string(),
  })),
  movements: z.array(z.object({ label: z.string(), detail: z.string(), status: z.string(), attention: z.boolean().optional() })),
  warning: z.object({ feed: z.string(), detail: z.string(), status: z.string() }),
  evidence: z.array(z.object({
    id: z.string(),
    label: z.string(),
    detail: z.string(),
    source: z.string(),
    checkedAt: z.string(),
    current: z.boolean(),
  })),
});

export async function loadLatestSnapshot(client: SupabaseClient, horizon: Horizon): Promise<DashboardSnapshot> {
  const { data, error } = await client
    .schema("compound")
    .from("daily_snapshots")
    .select("id,as_of,horizon,status,payload")
    .eq("horizon", horizon)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle<SnapshotRow>();

  if (error) throw new Error(`Today's COMPOUND view could not be loaded: ${error.message}`);
  if (!data) throw new Error("There is no COMPOUND update for this time period yet.");
  const parsed = dashboardSnapshotSchema.safeParse(data.payload);
  if (!parsed.success) throw new Error("Today's COMPOUND update has an unexpected format.");

  return { ...parsed.data, id: data.id, asOf: data.as_of, horizon: data.horizon, status: data.status };
}
