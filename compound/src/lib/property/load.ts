import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import demoProperty from "virtual:compound-demo-property";
import type { CompoundConfig } from "../env";
import { parsePropertyDay, type PropertyDay } from "./schema";

export type PropertyLoad =
  | { state: "loading" }
  | { state: "ready"; day: PropertyDay }
  | { state: "none"; message: string }
  | { state: "error"; message: string };

export function loadDemoPropertyDay(): PropertyDay {
  if (demoProperty == null) throw new Error("Demo property data is available only when VITE_COMPOUND_DEMO_MODE=true.");
  return parsePropertyDay(demoProperty as unknown);
}

export async function fetchPropertyDay(accessToken: string, signal?: AbortSignal): Promise<PropertyLoad> {
  const response = await fetch("/api/property/latest", {
    cache: "no-store",
    signal,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (response.status === 404) {
    const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "No property is set up yet.";
    return { state: "none", message };
  }
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "The property data could not be read.";
    return { state: "error", message };
  }
  return { state: "ready", day: parsePropertyDay(body) };
}

/** Loads the property day for the tab. Demo mode is synchronous and offline. */
export function usePropertyDay(config: CompoundConfig, session: Session | null): PropertyLoad {
  const [load, setLoad] = useState<PropertyLoad>(() => {
    if (config.mode === "demo") {
      try {
        return { state: "ready", day: loadDemoPropertyDay() };
      } catch (reason: unknown) {
        return { state: "error", message: reason instanceof Error ? reason.message : "Demo property data is unavailable." };
      }
    }
    return { state: "loading" };
  });

  useEffect(() => {
    if (config.mode === "demo") return;
    if (!session?.access_token) {
      setLoad({ state: "error", message: "Sign in to read your property." });
      return;
    }
    const controller = new AbortController();
    setLoad({ state: "loading" });
    void fetchPropertyDay(session.access_token, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setLoad(result); })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({ state: "error", message: reason instanceof Error ? reason.message : "The property data could not be read." });
      });
    return () => controller.abort();
  }, [config.mode, session?.access_token]);

  return load;
}
