import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import demoSpend from "virtual:compound-demo-spend";
import type { CompoundConfig } from "../env";
import { parseSpendDay, type SpendDay } from "./schema";

export type SpendLoad =
  | { state: "loading" }
  | { state: "ready"; day: SpendDay }
  | { state: "none"; message: string }
  | { state: "error"; message: string };

export function loadDemoSpendDay(): SpendDay {
  if (demoSpend == null) throw new Error("Demo spend data is available only when VITE_COMPOUND_DEMO_MODE=true.");
  return parseSpendDay(demoSpend as unknown);
}

function messageOf(body: unknown, fallback: string): string {
  return body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : fallback;
}

export async function fetchSpendDay(accessToken: string, signal?: AbortSignal): Promise<SpendLoad> {
  const response = await fetch("/api/spend/latest", {
    cache: "no-store",
    signal,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (response.status === 404) return { state: "none", message: messageOf(body, "No spend has been synced yet.") };
  if (!response.ok) return { state: "error", message: messageOf(body, "The spend data could not be read.") };
  return { state: "ready", day: parseSpendDay(body) };
}

/** Loads the spend day for the tab. Demo mode is synchronous and offline. */
export function useSpendDay(config: CompoundConfig, session: Session | null): SpendLoad {
  const [load, setLoad] = useState<SpendLoad>(() => {
    if (config.mode === "demo") {
      try {
        return { state: "ready", day: loadDemoSpendDay() };
      } catch (reason: unknown) {
        return { state: "error", message: reason instanceof Error ? reason.message : "Demo spend data is unavailable." };
      }
    }
    return { state: "loading" };
  });

  useEffect(() => {
    if (config.mode === "demo") return;
    if (!session?.access_token) {
      setLoad({ state: "error", message: "Sign in to read your spend." });
      return;
    }
    const controller = new AbortController();
    setLoad({ state: "loading" });
    void fetchSpendDay(session.access_token, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setLoad(result); })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({ state: "error", message: reason instanceof Error ? reason.message : "The spend data could not be read." });
      });
    return () => controller.abort();
  }, [config.mode, session?.access_token]);

  return load;
}
