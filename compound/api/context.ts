import { contextQuery, normalizeExa, normalizePerplexity, type InsightContext } from "../src/lib/context";

/**
 * Real-world context for one insight. Keeps the provider key server-side and the
 * calls small: one capped Perplexity `sonar` call, falling back to Exa, cached
 * at the CDN for the day so the same topic is never fetched twice. Returns an
 * empty object when nothing useful comes back, so the card falls back to its
 * numbers rather than showing an empty slot.
 */

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const EXA_URL = "https://api.exa.ai/search";
const PROVIDER_TIMEOUT_MS = 9_000;

interface VercelRequest {
  method?: string;
  url?: string;
  query?: Record<string, string | string[]>;
}
interface VercelResponse {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
}

function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function queryParam(req: VercelRequest, key: string): string {
  const fromQuery = req.query?.[key];
  if (typeof fromQuery === "string") return fromQuery;
  if (Array.isArray(fromQuery) && typeof fromQuery[0] === "string") return fromQuery[0];
  try {
    return new URL(req.url ?? "", "http://localhost").searchParams.get(key) ?? "";
  } catch {
    return "";
  }
}

async function fromPerplexity(query: string, apiKey: string, asOf: string): Promise<InsightContext | null> {
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

async function fromExa(query: string, apiKey: string, asOf: string): Promise<InsightContext | null> {
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method && req.method !== "GET") return sendJson(res, 405, { message: "Use GET." });

  const topic = queryParam(req, "q").trim();
  if (!topic || topic.length > 200) return sendJson(res, 400, { message: "A topic between 1 and 200 characters is required." });

  const asOf = new Date().toISOString().slice(0, 10);
  const query = contextQuery(topic);
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  const exaKey = process.env.EXA_API_KEY;

  // One day at the CDN, keyed by the full URL (topic), so a topic is fetched at
  // most once per day across every reader.
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=43200");

  let context: InsightContext | null = null;
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

  sendJson(res, 200, context ?? {});
}
