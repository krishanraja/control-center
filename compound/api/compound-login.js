const timeoutMs = 20_000;

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(response, status, message) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify({ message }));
}

function originAllowed(origin) {
  if (!origin) return true;
  if (origin === "https://compound.krishraja.com") return true;
  if (/^https:\/\/compound(?:-[a-z0-9-]+)?-krish-rajas-projects\.vercel\.app$/.test(origin)) return true;
  return /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin);
}

export default async function handler(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, "Use POST to request a sign-in email.");
  if (!originAllowed(firstHeader(request.headers.origin))) return sendJson(response, 403, "This sign-in request could not be verified.");

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const proxySecret = process.env.COMPOUND_LOGIN_PROXY_SECRET;
  if (!supabaseUrl || !publishableKey || !proxySecret) return sendJson(response, 503, "Email is unavailable right now. Try again shortly.");

  try {
    const upstream = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/compound-login`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "Content-Type": "application/json",
        "X-Compound-Login-Token": proxySecret,
      },
      body: JSON.stringify(request.body ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    let message = "Email is unavailable right now. Try again shortly.";
    try {
      const body = await upstream.json();
      if (typeof body?.message === "string") message = body.message;
    } catch {
      // Keep the safe fallback when the provider response is unreadable.
    }
    return sendJson(response, upstream.status, message);
  } catch {
    return sendJson(response, 502, "Email is unavailable right now. Try again shortly.");
  }
}
