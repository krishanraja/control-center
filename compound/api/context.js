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

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function contextQuery(topic) {
  return `${topic.trim()}: the most important news, analyst views and risks in the last two weeks`;
}

function cleanSummary(text) {
  const stripped = text.replace(/\s*\[\d+\]/g, "").replace(/\s+/g, " ").trim();
  if (stripped.length <= MAX_SUMMARY) return stripped;
  const cut = stripped.slice(0, MAX_SUMMARY);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return (lastStop > 120 ? cut.slice(0, lastStop + 1) : cut).trim();
}

function dedupeCitations(citations) {
  const seen = new Set();
  const out = [];
  for (const citation of citations) {
    if (!citation.url || seen.has(citation.url)) continue;
    seen.add(citation.url);
    out.push({ url: citation.url, title: (citation.title || "").trim() || hostOf(citation.url) });
    if (out.length >= MAX_CITATIONS) break;
  }
  return out;
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
  return {
    summary: cleanSummary(content),
    citations: dedupeCitations(fromResults.length ? fromResults : fromUrls),
    asOf,
    via: "perplexity",
  };
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
  if (!snippet && !citations.length) return null;
  return {
    summary: snippet ? cleanSummary(snippet) : `Recent coverage from ${citations.map((c) => c.title).slice(0, 2).join(" and ")}.`,
    citations,
    asOf,
    via: "exa",
  };
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
            "You add real-world context to a private investor's dashboard. Answer in at most two plain sentences a non-expert can read. State only what reputable recent reporting says, note if views conflict, and never invent numbers. If there is nothing notable, say so briefly.",
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
