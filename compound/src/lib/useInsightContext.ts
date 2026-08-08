import { useEffect, useState } from "react";
import type { CompoundConfig } from "./env";
import type { InsightContext } from "./context";
import { DEMO_CONTEXT } from "./contextDemo";

/** One insight that wants real-world context: a stable id and a plain topic. */
export interface ContextTopic {
  id: string;
  topic: string;
}

type ContextMap = Record<string, InsightContext>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function cacheKey(topic: string): string {
  return `compound.ctx.${today()}.${topic}`;
}

function readCache(topic: string): InsightContext | null {
  try {
    const raw = window.sessionStorage.getItem(cacheKey(topic));
    return raw ? (JSON.parse(raw) as InsightContext) : null;
  } catch {
    return null;
  }
}

function writeCache(topic: string, context: InsightContext): void {
  try {
    window.sessionStorage.setItem(cacheKey(topic), JSON.stringify(context));
  } catch {
    // A full or blocked store just means we ask again next time.
  }
}

function demoMap(topics: ContextTopic[]): ContextMap {
  const map: ContextMap = {};
  for (const topic of topics) {
    const hit = DEMO_CONTEXT[topic.id];
    if (hit) map[topic.id] = hit;
  }
  return map;
}

/**
 * Real-world context for a handful of insights. Demo mode returns bundled,
 * cited fixtures so the layer works offline; live mode asks /api/context once
 * per topic and caches the answer for the day. A topic that returns nothing is
 * simply left out, so the insight falls back to its numbers rather than showing
 * an empty "news" slot.
 */
export function useInsightContext(config: CompoundConfig, topics: ContextTopic[]): ContextMap {
  const [map, setMap] = useState<ContextMap>(() => (config.mode === "demo" ? demoMap(topics) : {}));
  const signature = topics.map((entry) => `${entry.id}:${entry.topic}`).join("|");

  useEffect(() => {
    if (config.mode === "demo") {
      setMap(demoMap(topics));
      return;
    }
    if (typeof window === "undefined" || topics.length === 0) return;

    const controller = new AbortController();
    let active = true;
    void (async () => {
      const found: ContextMap = {};
      for (const { id, topic } of topics) {
        const cached = readCache(topic);
        if (cached) {
          found[id] = cached;
          continue;
        }
        try {
          const response = await fetch(`/api/context?id=${encodeURIComponent(id)}&q=${encodeURIComponent(topic)}`, {
            signal: controller.signal,
          });
          if (!response.ok) continue;
          const context = (await response.json()) as InsightContext;
          if (context?.summary) {
            found[id] = context;
            writeCache(topic, context);
          }
        } catch {
          // Network or provider trouble: leave this insight on its numbers.
        }
      }
      if (active && Object.keys(found).length) setMap((current) => ({ ...current, ...found }));
    })();

    return () => {
      active = false;
      controller.abort();
    };
    // signature captures the topic set; config.mode gates demo vs live.
  }, [config.mode, signature]);

  return map;
}
