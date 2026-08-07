export interface CompoundConfig {
  mode: "demo" | "live";
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  error?: string;
}

export function readConfig(env: ImportMetaEnv = import.meta.env): CompoundConfig {
  if (env.VITE_COMPOUND_DEMO_MODE === "true") return { mode: "demo" };

  const supabaseUrl = env.VITE_SUPABASE_URL?.trim();
  const supabasePublishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl || !supabasePublishableKey) {
    return {
      mode: "live",
      error: "COMPOUND is not connected yet. Add the Supabase public URL and publishable key to this project's environment settings.",
    };
  }

  return { mode: "live", supabaseUrl, supabasePublishableKey };
}
