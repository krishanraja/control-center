/** Pure normalization and display helpers for cited world context. */

export interface Citation {
  title: string;
  url: string;
}

export interface InsightContext {
  /** One or two plain sentences, no citation markers or Markdown. */
  summary: string;
  citations: Citation[];
  /** ISO date the context was gathered. */
  asOf: string;
  /** Which provider answered. */
  via: "perplexity" | "exa" | "demo";
}

const MAX_CITATIONS = 4;
const MAX_SUMMARY = 360;
const MAX_PREVIEW = 160;
const DEFERRED_SOURCE_HOSTS = new Set([
  "facebook.com",
  "instagram.com",
  "reddit.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtu.be",
  "youtube.com",
]);

function plainText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^\s)]+\)/g, "$1")
    .replace(/\s*\[\d+\]/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Truncate at a word boundary. An unbroken overlong token is unusable. */
export function truncateWords(text: string, limit: number): string {
  const clean = text.trim();
  if (clean.length <= limit) return clean;
  const contentLimit = Math.max(1, limit - 1);
  const boundary = clean.slice(0, contentLimit + 1).search(/\s+\S*$/);
  if (boundary <= 0) return "";
  return `${clean.slice(0, boundary).trim()}…`;
}

/** Bare hostname, or an empty string when the citation URL is unsafe. */
export function hostOf(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** One tight query per insight so the provider call stays small and on-topic. */
export function contextQuery(topic: string): string {
  return `${topic.trim()}: the most important news, analyst views and material risks in the last two weeks`;
}

/** Strip provider formatting and cap at a complete sentence or word. */
export function cleanSummary(text: string): string {
  const stripped = plainText(text).replace(/\brevenues?\b/gi, (word) => (/^[A-Z]/.test(word) ? "Sales" : "sales"));
  if (stripped.length <= MAX_SUMMARY) return stripped;
  const cut = stripped.slice(0, MAX_SUMMARY + 1);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (lastStop >= 120) return cut.slice(0, lastStop + 1).trim();
  return truncateWords(stripped, MAX_SUMMARY);
}

/** A concise first-sentence treatment for the closed card face. */
export function contextPreview(summary: string): string {
  const clean = cleanSummary(summary);
  const firstStop = clean.search(/[.!?](?:\s|$)/);
  if (firstStop >= 0 && firstStop + 1 <= MAX_PREVIEW) return clean.slice(0, firstStop + 1);
  return truncateWords(clean, MAX_PREVIEW);
}

function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const citation of citations) {
    const url = citation.url?.trim();
    const host = url ? hostOf(url) : "";
    if (!url || !host || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title: plainText(citation.title || "") || host });
  }
  return out
    .map((citation, index) => ({
      citation,
      index,
      deferred: DEFERRED_SOURCE_HOSTS.has(hostOf(citation.url)) ? 1 : 0,
    }))
    .sort((a, b) => a.deferred - b.deferred || a.index - b.index)
    .slice(0, MAX_CITATIONS)
    .map(({ citation }) => citation);
}

/** Treat the API and session cache as untrusted before anything becomes a link. */
export function sanitizeInsightContext(value: unknown): InsightContext | null {
  if (!value || typeof value !== "object") return null;
  const context = value as Partial<InsightContext>;
  if (typeof context.summary !== "string" || !Array.isArray(context.citations) || typeof context.asOf !== "string") return null;
  if (context.via !== "perplexity" && context.via !== "exa" && context.via !== "demo") return null;
  const summary = cleanSummary(context.summary);
  const citations = dedupeCitations(context.citations);
  if (!summary || citations.length === 0) return null;
  return { summary, citations, asOf: context.asOf, via: context.via };
}

export function hasCitedContext(context: InsightContext | null | undefined): context is InsightContext {
  return sanitizeInsightContext(context) !== null;
}

export function contextSourceLine(context: InsightContext): string {
  const first = hostOf(context.citations[0]?.url ?? "");
  const more = context.citations.length - 1;
  return more > 0 ? `${first} +${more} ${more === 1 ? "source" : "sources"}` : first;
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

  const summary = cleanSummary(content);
  const citations = dedupeCitations(fromResults.length ? fromResults : fromUrls);
  if (!summary || citations.length === 0) return null;
  return { summary, citations, asOf, via: "perplexity" };
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

  const summary = snippet ? cleanSummary(snippet) : "";
  if (!summary || citations.length === 0) return null;
  return { summary, citations, asOf, via: "exa" };
}
