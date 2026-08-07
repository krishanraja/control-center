const timeoutMs = 45_000;

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(response, status, message) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify({ message }));
}

export default async function handler(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, "Use POST to ask a COMPOUND question.");

  const authorization = firstHeader(request.headers.authorization);
  if (!authorization?.startsWith("Bearer ")) return sendJson(response, 401, "Please sign in before asking a question.");

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const gatewayToken = process.env.VERCEL_OIDC_TOKEN ?? firstHeader(request.headers["x-vercel-oidc-token"]);
  if (!supabaseUrl || !publishableKey) return sendJson(response, 503, "COMPOUND is not connected to its private data yet.");
  if (!gatewayToken) return sendJson(response, 503, "Live answers are not connected yet.");

  try {
    const upstream = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/compound-ask`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        apikey: publishableKey,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-Compound-Gateway-Token": gatewayToken,
      },
      body: JSON.stringify(request.body ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
    });

    response.statusCode = upstream.status;
    response.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");

    if (!upstream.body) {
      response.end();
      return;
    }

    for await (const chunk of upstream.body) response.write(Buffer.from(chunk));
    response.end();
  } catch {
    if (!response.headersSent) return sendJson(response, 502, "COMPOUND could not answer right now.");
    response.end();
  }
}
