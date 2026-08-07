import { createHash } from "node:crypto";

const timeoutMs = 20_000;

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(body));
}

function originAllowed(origin) {
  if (!origin) return true;
  if (origin === "https://compound.krishraja.com") return true;
  if (/^https:\/\/compound(?:-[a-z0-9-]+)?-krish-rajas-projects\.vercel\.app$/.test(origin)) return true;
  return /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin);
}

export default async function handler(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { message: "Use POST to open COMPOUND." });
  if (!originAllowed(firstHeader(request.headers.origin))) return sendJson(response, 403, { message: "This sign-in request could not be verified." });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const proxySecret = process.env.COMPOUND_LOGIN_PROXY_SECRET;
  if (!supabaseUrl || !publishableKey || !proxySecret) return sendJson(response, 503, { message: "COMPOUND could not open right now. Try again shortly." });

  const forwardedFor = firstHeader(request.headers["x-forwarded-for"]) ?? request.socket?.remoteAddress ?? "unknown";
  const clientIp = forwardedFor.split(",")[0].trim();
  const fingerprint = createHash("sha256").update(`${proxySecret}:${clientIp}`).digest("hex");
  const magicWord = typeof request.body?.magicWord === "string" ? request.body.magicWord : "";

  try {
    const upstream = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/compound-login`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "Content-Type": "application/json",
        "X-Compound-Login-Token": proxySecret,
        "X-Compound-Client-Fingerprint": fingerprint,
      },
      body: JSON.stringify({ magicWord }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    let body = { message: "COMPOUND could not open right now. Try again shortly." };
    try {
      const upstreamBody = await upstream.json();
      if (typeof upstreamBody?.message === "string") body = { message: upstreamBody.message };
      if (typeof upstreamBody?.tokenHash === "string") body.tokenHash = upstreamBody.tokenHash;
    } catch {
      // Keep the safe fallback when the server response is unreadable.
    }
    return sendJson(response, upstream.status, body);
  } catch {
    return sendJson(response, 502, { message: "COMPOUND could not open right now. Try again shortly." });
  }
}
