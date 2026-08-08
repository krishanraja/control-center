import { useEffect, useState } from "react";
import type { CompoundConfig } from "./env";
import { sanitizeInsightContext, type InsightContext } from "./context";
import { DEMO_CONTEXT } from "./contextDemo";

/** One insight that wants real-world context: a stable id and a plain topic. */
export interface ContextTopic {
  id: string;
  topic: string;
}

type ContextMap = Record<string, InsightContext>;
const MAX_TOPICS = 3;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function cacheKey(topic: string): string {
  return `compound.ctx.${today()}.${topic}`;
}

/** Undefined means no cache entry. Null is a cached, intentionally empty result. */
function readCache(topic: string): InsightContext | null | undefined {
  try {
    const raw = window.sessionStorage.getItem(cacheKey(topic));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && (parsed as { empty?: unknown }).empty === true) return null;
    return sanitizeInsightContext(parsed) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeCache(topic: string, context: InsightContext | null): void {
  try {
    window.sessionStorage.setItem(cacheKey(topic), JSON.stringify(context ?? { empty: true }));
  } catch {
    // A full or blocked store only removes the cache optimization.
  }
}

function demoMap(topics: ContextTopic[]): ContextMap {
  const map: ContextMap = {};
  for (const topic of topics.slice(0, MAX_TOPICS)) {
    const hit = DEMO_CONTEXT[topic.id];
    const context = sanitizeInsightContext(hit);
    if (context) map[topic.id] = context;
  }
  return map;
}

/**
 * Real-world context for at most three insights. Demo mode returns bundled,
 * cited fixtures. Live mode asks once per topic, in parallel, and caches both
 * useful and intentionally empty responses for the day.
 */
export function useInsightContext(config: CompoundConfig, topics: ContextTopic[]): ContextMap {
  const [map, setMap] = useState<ContextMap>(() => (config.mode === "demo" ? demoMap(topics) : {}));
  const signature = topics.map((entry) => `${entry.id}:${entry.topic}`).join("|");

  useEffect(() => {
    const selected = topics.slice(0, MAX_TOPICS);
    if (config.mode === "demo") {
      setMap(demoMap(selected));
      return;
    }
    if (typeof window === "undefined" || selected.length === 0) {
      setMap({});
      return;
    }

    const controller = new AbortController();
    let active = true;
    void (async () => {
      const pairs = await Promise.all(selected.map(async ({ id, topic }) => {
        const cached = readCache(topic);
        if (cached !== undefined) return [id, cached] as const;

        try {
          const response = await fetch(`/api/context?q=${encodeURIComponent(topic)}`, { signal: controller.signal });
          if (!response.ok) return [id, null] as const;
          const context = sanitizeInsightContext(await response.json());
          if (context) {
            writeCache(topic, context);
            return [id, context] as const;
          }
          writeCache(topic, null);
        } catch {
          // Provider or network trouble remains retryable on a later mount.
        }
        return [id, null] as const;
      }));

      if (!active) return;
      const found: ContextMap = {};
      for (const [id, context] of pairs) if (context) found[id] = context;
      setMap(found);
    })();

    return () => {
      active = false;
      controller.abort();
    };
    // signature captures the topic set; config.mode gates demo versus live.
  }, [config.mode, signature]);

  return map;
}
