import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CompoundConfig } from "./env";

let client: SupabaseClient | null = null;

export function getSupabase(config: CompoundConfig): SupabaseClient {
  if (config.mode !== "live" || !config.supabaseUrl || !config.supabasePublishableKey) {
    throw new Error(config.error ?? "Supabase is unavailable in demo mode.");
  }

  if (!client) {
    client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export function resetSupabaseForTests(): void {
  client = null;
}
