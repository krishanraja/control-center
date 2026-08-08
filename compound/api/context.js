// Real-world context for one insight. Kept as plain JS to match the other
// COMPOUND API functions: the project pins TypeScript 7, which Vercel's Node
// builder cannot compile for a .ts function, so a .ts entrypoint fails the
// deploy. The normalization here mirrors src/lib/context.ts, which holds the
// same logic under unit test as the reference contract.

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const EXA_URL = "https://api.exa.ai/search";
const PROVIDER_TIMEOUT_MS = 9000;
const MAX_CITATIONS = 4;
const MAX_SUMMARY = 360;
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

function plainText(text) {
  return text
    .replace(/\[([^\]]+)\]\([^\s)]+\)/g, "$1")
    .replace(/\s*\[\d+\]/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hostOf(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function contextQuery(topic) {
  return `${topic.trim()}: the most important news, analyst views and material risks in the last two weeks`;
}

function truncateWords(text, limit) {
  const clean = text.trim();
  if (clean.length <= limit) return clean;
  const contentLimit = Math.max(1, limit - 1);
  const boundary = clean.slice(0, contentLimit + 1).search(/\s+\S*$/);
  if (boundary <= 0) return "";
  return `${clean.slice(0, boundary).trim()}…`;
}

function cleanSummary(text) {
  const stripped = plainText(text).replace(/\brevenues?\b/gi, (word) => (/^[A-Z]/.test(word) ? "Sales" : "sales"));
  if (stripped.length <= MAX_SUMMARY) return stripped;
  const cut = stripped.slice(0, MAX_SUMMARY + 1);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (lastStop >= 120) return cut.slice(0, lastStop + 1).trim();
  return truncateWords(stripped, MAX_SUMMARY);
}

function dedupeCitations(citations) {
  const seen = new Set();
  const out = [];
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

function normalizePerplexity(payload, asOf) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) return null;
  const results = Array.isArray(payload.search_results) ? payload.search_results : [];
  const fromResults = results
    .filter((item) => item && typeof item.url === "string")
    .map((item) => ({ title: typeof item.title === "string" ? item.title : "", url: item.url }));
  const fromUrls = Array.isArray(payload.citations)
    ? payload.citations.filter((url) => typeof url === "string").map((url) => ({ title: "", url }))
    : [];
  const summary = cleanSummary(content);
  const citations = dedupeCitations(fromResults.length ? fromResults : fromUrls);
  if (!summary || citations.length === 0) return null;
  return { summary, citations, asOf, via: "perplexity" };
}

function normalizeExa(payload, asOf) {
  const results = payload?.results;
  if (!Array.isArray(results) || !results.length) return null;
  const citations = dedupeCitations(
    results
      .filter((item) => item && typeof item.url === "string")
      .map((item) => ({ title: typeof item.title === "string" ? item.title : "", url: item.url })),
  );
  const snippet = results
    .map((item) => {
      if (typeof item.summary === "string") return item.summary;
      if (Array.isArray(item.highlights)) return item.highlights.filter((h) => typeof h === "string").join(" ");
      return typeof item.text === "string" ? item.text : "";
    })
    .find((text) => text.trim().length > 0);
  const summary = snippet ? cleanSummary(snippet) : "";
  if (!summary || citations.length === 0) return null;
  return { summary, citations, asOf, via: "exa" };
}

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

async function fromPerplexity(query, apiKey, asOf) {
  const response = await fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar",
      temperature: 0,
      max_tokens: 160,
      messages: [
        {
          role: "system",
          content:
            "Add current context to a private investor dashboard. Return at most two plain-text sentences with no Markdown. Use plain language, including sales instead of revenue. Prefer primary sources and established financial or business reporting. State only what recent reporting supports, note material disagreement, and never invent numbers. If there is nothing notable, say so briefly.",
        },
        { role: "user", content: query },
      ],
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return normalizePerplexity(await response.json(), asOf);
}

async function fromExa(query, apiKey, asOf) {
  const response = await fetch(EXA_URL, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      numResults: 4,
      type: "auto",
      contents: { highlights: { numSentences: 2, highlightsPerUrl: 1 } },
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return normalizeExa(await response.json(), asOf);
}

export default async function handler(request, response) {
  if (request.method && request.method !== "GET") return sendJson(response, 405, { message: "Use GET." });

  let topic = "";
  try {
    topic = (new URL(request.url, "http://localhost").searchParams.get("q") || "").trim();
  } catch {
    topic = "";
  }
  if (!topic || topic.length > 200) return sendJson(response, 400, { message: "A topic between 1 and 200 characters is required." });

  const asOf = new Date().toISOString().slice(0, 10);
  const query = contextQuery(topic);
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  const exaKey = process.env.EXA_API_KEY;

  // One day at the CDN, keyed by the full URL (topic), so a topic is fetched at
  // most once per day across every reader.
  response.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=43200");

  let context = null;
  try {
    if (perplexityKey) context = await fromPerplexity(query, perplexityKey, asOf);
  } catch {
    context = null;
  }
  if (!context) {
    try {
      if (exaKey) context = await fromExa(query, exaKey, asOf);
    } catch {
      context = null;
    }
  }

  sendJson(response, 200, context || {});
}
