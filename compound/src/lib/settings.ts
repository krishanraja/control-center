import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Industry exclusions apply across every tab, so they belong to the member, not
 * the browser. The local copy is written first so a toggle never waits on the
 * network, then the row is upserted. If the write fails the caller is told,
 * because silently keeping a setting only on one device is worse than saying so.
 */

const LOCAL_KEY = "compound.excludedIndustries";

function localKey(userId: string | null): string {
  return userId ? `${LOCAL_KEY}.${userId}` : LOCAL_KEY;
}

export function readLocalExclusions(userId: string | null): string[] {
  try {
    const raw = window.localStorage.getItem(localKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function writeLocalExclusions(userId: string | null, industries: string[]): void {
  try {
    window.localStorage.setItem(localKey(userId), JSON.stringify(industries));
  } catch {
    // Private browsing can refuse storage. The Supabase row is the real record.
  }
}

interface SettingsRow {
  excluded_industries: string[] | null;
}

export async function loadExclusions(client: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await client
    .schema("compound")
    .from("view_settings")
    .select("excluded_industries")
    .eq("user_id", userId)
    .maybeSingle<SettingsRow>();

  if (error) throw new Error(`Your saved settings could not be read: ${error.message}`);
  return data?.excluded_industries ?? [];
}

export async function saveExclusions(client: SupabaseClient, userId: string, industries: string[]): Promise<void> {
  const { error } = await client
    .schema("compound")
    .from("view_settings")
    .upsert({ user_id: userId, excluded_industries: industries }, { onConflict: "user_id" });

  if (error) throw new Error(`That setting was not saved to your account: ${error.message}`);
}

export function toggleIn(industries: string[], industry: string): string[] {
  return industries.includes(industry)
    ? industries.filter((item) => item !== industry)
    : [...industries, industry].sort();
}
