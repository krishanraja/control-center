/**
 * Real-world context for an insight. The dashboard already fuses the numbers
 * into one claim; this adds the layer the numbers cannot see — what the wider
 * world is saying right now — and always names where it came from. It is one
 * short, cited paragraph woven into the insight, never a separate "news" feed.
 *
 * This file is the pure part: build one tight query per insight, and turn a
 * provider's reply into a trimmed summary plus deduped citations. The network
 * call and the key live in the serverless endpoint (api/context.js), so nothing
 * here touches a secret and every branch is unit-testable.
 */

export interface Citation {
  title: string;
  url: string;
}

export interface InsightContext {
  /** One or two plain sentences, no citation brackets. */
  summary: string;
  citations: Citation[];
  /** ISO date the context was gathered, shown next to it. */
  asOf: string;
  /** Which provider answered, for the source line. */
  via: "perplexity" | "exa" | "demo";
}

const MAX_CITATIONS = 4;
const MAX_SUMMARY = 360;

/** Bare hostname for a citation with no title of its own. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** One tight query per insight so the provider call stays small and on-topic. */
export function contextQuery(topic: string): string {
  return `${topic.trim()}: the most important news, analyst views and risks in the last two weeks`;
}

/** Drop citation markers like [1], collapse whitespace, and cap the length. */
export function cleanSummary(text: string): string {
  const stripped = text.replace(/\s*\[\d+\]/g, "").replace(/\s+/g, " ").trim();
  if (stripped.length <= MAX_SUMMARY) return stripped;
  const cut = stripped.slice(0, MAX_SUMMARY);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return (lastStop > 120 ? cut.slice(0, lastStop + 1) : cut).trim();
}

function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const citation of citations) {
    if (!citation.url || seen.has(citation.url)) continue;
    seen.add(citation.url);
    out.push({ url: citation.url, title: citation.title?.trim() || hostOf(citation.url) });
    if (out.length >= MAX_CITATIONS) break;
  }
  return out;
}

interface PerplexityShape {
  choices?: Array<{ message?: { content?: unknown } }>;
  citations?: unknown;
  search_results?: unknown;
}

/** Perplexity `sonar`: content plus either `search_results` or `citations`. */
export function normalizePerplexity(payload: unknown, asOf: string): InsightContext | null {
  const data = payload as PerplexityShape;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) return null;

  const results = Array.isArray(data.search_results) ? data.search_results : [];
  const fromResults: Citation[] = results
    .map((item) => item as { title?: unknown; url?: unknown })
    .filter((item) => typeof item.url === "string")
    .map((item) => ({ title: typeof item.title === "string" ? item.title : "", url: item.url as string }));

  const fromUrls: Citation[] = Array.isArray(data.citations)
    ? data.citations.filter((url): url is string => typeof url === "string").map((url) => ({ title: "", url }))
    : [];

  return {
    summary: cleanSummary(content),
    citations: dedupeCitations(fromResults.length ? fromResults : fromUrls),
    asOf,
    via: "perplexity",
  };
}

interface ExaShape {
  results?: Array<{ title?: unknown; url?: unknown; text?: unknown; highlights?: unknown; summary?: unknown }>;
}

/** Exa `/search` with contents: build a summary from the top result snippets. */
export function normalizeExa(payload: unknown, asOf: string): InsightContext | null {
  const results = (payload as ExaShape)?.results;
  if (!Array.isArray(results) || !results.length) return null;

  const citations = dedupeCitations(
    results
      .filter((item) => typeof item.url === "string")
      .map((item) => ({ title: typeof item.title === "string" ? item.title : "", url: item.url as string })),
  );

  const snippet = results
    .map((item) => {
      if (typeof item.summary === "string") return item.summary;
      if (Array.isArray(item.highlights)) return item.highlights.filter((h): h is string => typeof h === "string").join(" ");
      return typeof item.text === "string" ? item.text : "";
    })
    .find((text) => text.trim().length > 0);

  if (!snippet && !citations.length) return null;
  return {
    summary: snippet ? cleanSummary(snippet) : `Recent coverage from ${citations.map((c) => c.title).slice(0, 2).join(" and ")}.`,
    citations,
    asOf,
    via: "exa",
  };
}
