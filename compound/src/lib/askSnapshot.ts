import type { SupabaseClient } from "@supabase/supabase-js";
import type { Horizon } from "./horizon";

/**
 * Live answers stream through the existing COMPOUND Edge Function, which needs
 * the id of a stored snapshot row so the answer and its evidence are pinned to
 * one dataset. The market data on screen comes from `latest.json`; this is only
 * the handle the answer is recorded against.
 */
export async function loadAskSnapshotId(client: SupabaseClient, horizon: Horizon): Promise<string | null> {
  const { data, error } = await client
    .schema("compound")
    .from("daily_snapshots")
    .select("id")
    .eq("horizon", horizon)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(`Live answers are unavailable: ${error.message}`);
  return data?.id ?? null;
}
