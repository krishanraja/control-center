import type { BriefStory, WorldContext } from "./model.ts";
import { readContextCache, writeContextCache } from "./supabase.ts";

const MAX_SUMMARY = 280;
const MAX_CITATIONS = 4;

function cleanText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^\s)]+\)/g, "$1")
    .replace(/\s*\[\d+\]/g, "")
    .replace(/[*_`~#]/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SUMMARY);
}

function validUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function citationsFrom(payload: Record<string, unknown>): Array<{ title: string; url: string }> {
  const results = Array.isArray(payload.search_results) ? payload.search_results : [];
  const resultCitations = results.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const url = validUrl(row.url);
    return url ? [{ title: cleanText(String(row.title ?? new URL(url).hostname)), url }] : [];
  });
  const urlCitations = Array.isArray(payload.citations)
    ? payload.citations.flatMap((item) => {
      const url = validUrl(item);
      return url ? [{ title: new URL(url).hostname.replace(/^www\./, ""), url }] : [];
    })
    : [];
  const seen = new Set<string>();
  return [...resultCitations, ...urlCitations]
    .filter((item) => !seen.has(item.url) && seen.add(item.url))
    .slice(0, MAX_CITATIONS);
}

async function perplexity(story: BriefStory, asOf: string): Promise<WorldContext | undefined> {
  const key = Deno.env.get("PERPLEXITY_API_KEY")?.trim();
  if (!key) return undefined;
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar",
      temperature: 0,
      max_tokens: 140,
      messages: [
        {
          role: "system",
          content:
            "Add current world context to a supplied, evidence-backed market verdict. Return at most two plain-text sentences. Do not add numbers or claims beyond cited reporting. Prefer primary sources. If reporting disagrees, say so.",
        },
        { role: "user", content: `${story.title}. ${story.verdict}. Context as of ${asOf}.` },
      ],
    }),
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) return undefined;
  const payload = await response.json() as Record<string, unknown>;
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  const summary = typeof first?.message?.content === "string" ? cleanText(first.message.content) : "";
  const citations = citationsFrom(payload);
  return summary && citations.length ? { summary, citations, asOf, via: "perplexity" } : undefined;
}

async function exa(story: BriefStory, asOf: string): Promise<WorldContext | undefined> {
  const key = Deno.env.get("EXA_API_KEY")?.trim();
  if (!key) return undefined;
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `${story.title}: recent primary reporting and material disagreement as of ${asOf}`,
      numResults: 4,
      type: "auto",
      contents: { highlights: { numSentences: 2, highlightsPerUrl: 1 } },
    }),
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) return undefined;
  const payload = await response.json() as { results?: Array<Record<string, unknown>> };
  const rows = payload.results ?? [];
  const citations = rows.flatMap((row) => {
    const url = validUrl(row.url);
    return url ? [{ title: cleanText(String(row.title ?? new URL(url).hostname)), url }] : [];
  }).slice(0, MAX_CITATIONS);
  const text = rows.flatMap((row) => {
    if (Array.isArray(row.highlights)) {
      return row.highlights.filter((item): item is string => typeof item === "string");
    }
    return typeof row.text === "string" ? [row.text] : [];
  })[0];
  const summary = text ? cleanText(text) : "";
  return summary && citations.length ? { summary, citations, asOf, via: "exa" } : undefined;
}

export async function addWorldContext(options: {
  userId: string;
  snapshotDate: string;
  stories: [BriefStory, BriefStory, BriefStory];
}): Promise<[BriefStory, BriefStory, BriefStory]> {
  const contextualized: BriefStory[] = [];
  for (const story of options.stories) {
    let cached: WorldContext | undefined;
    try {
      cached = await readContextCache<WorldContext>(options.userId, options.snapshotDate, story.id);
    } catch {
      cached = undefined;
    }
    let worldContext = cached;
    if (!worldContext) {
      try {
        worldContext = await perplexity(story, options.snapshotDate) ??
          await exa(story, options.snapshotDate);
      } catch {
        worldContext = undefined;
      }
      if (worldContext) {
        try {
          await writeContextCache(
            options.userId,
            options.snapshotDate,
            story.id,
            worldContext as unknown as Record<string, unknown>,
          );
        } catch {
          // Context is optional. A cache write must never block the evidence-backed brief.
        }
      }
    }
    contextualized.push({ ...story, worldContext });
  }
  return contextualized as [BriefStory, BriefStory, BriefStory];
}
