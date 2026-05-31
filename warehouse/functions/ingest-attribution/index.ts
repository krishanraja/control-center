// ingest-attribution: the single front door for attribution events from all six
// Mindmaker apps. Deployed on the OS warehouse project (gojpffsrxybbpbdzzrvs).
//
// Guarded by the x-attribution-secret header (the ONLY warehouse credential the
// six apps ever hold). Validates the event against the canonical contract and
// performs an idempotent insert via the public.ingest_attribution_event RPC, so
// the apps never touch the attribution schema or the service-role key directly.
//
// Deploy: supabase functions deploy ingest-attribution \
//           --project-ref gojpffsrxybbpbdzzrvs --no-verify-jwt
// Secret: supabase secrets set ATTRIBUTION_INGEST_SECRET=... --project-ref gojpffsrxybbpbdzzrvs

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-attribution-secret",
};

const APPS = new Set(["ctrl", "onalert", "gutted", "merciless", "circle", "pulse"]);
const EVENTS = new Set([
  "landed", "demo_played", "demo_stalled", "signed_up", "chart_calculated", "activated",
  "paywall_hit", "purchased", "refunded", "churned", "reactivated",
  "share_card_created", "verdict_viewed", "synastry_pair_minted", "recipient_unblurred",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Constant-time string compare to avoid leaking the secret via timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

// Normalize the two documented envelope conventions into the canonical flat shape
// the ingest_attribution_event RPC reads. The canonical apps (circle, merciless,
// ctrl, onalert, pulse) already send `event` / `dedupe_key` / flat `utm_*` /
// `amount_cents`, so every ?? fallback below is a no-op for them. gutted emits the
// `attribution.events/1` envelope (`event_name` / `idempotency_key` / nested
// `utm{}` / `value_cents`); these fallbacks map it without a gutted redeploy.
function normalizeEvent(raw: Record<string, unknown>): Record<string, unknown> {
  const ev: Record<string, unknown> = { ...raw };
  if (ev.event == null && typeof ev.event_name === "string") ev.event = ev.event_name;
  if (ev.dedupe_key == null && typeof ev.idempotency_key === "string") ev.dedupe_key = ev.idempotency_key;
  if (ev.amount_cents == null && ev.value_cents != null) ev.amount_cents = ev.value_cents;
  const utm = asObj(ev.utm);
  if (utm) {
    for (const k of ["source", "medium", "campaign", "content", "term"] as const) {
      const flat = `utm_${k}`;
      if (ev[flat] == null && typeof utm[k] === "string") ev[flat] = utm[k];
    }
  }
  // Defensive: synthesize a dedupe_key only if the app supplied neither key.
  // All six apps supply one today, so this is a belt-and-braces fallback.
  if (ev.dedupe_key == null || ev.dedupe_key === "") {
    const a = typeof ev.app === "string" ? ev.app : "app";
    const e = typeof ev.event === "string" ? ev.event : "event";
    const an = typeof ev.anonymous_id === "string" ? ev.anonymous_id : "anon";
    const oc = typeof ev.occurred_at === "string" ? ev.occurred_at : "";
    ev.dedupe_key = `${a}:${e}:${an}:${oc}`;
  }
  return ev;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = Deno.env.get("ATTRIBUTION_INGEST_SECRET");
  if (!secret) {
    console.error("[ingest-attribution] ATTRIBUTION_INGEST_SECRET not set");
    return json({ error: "Server not configured" }, 500);
  }
  const provided = req.headers.get("x-attribution-secret") ?? "";
  if (!safeEqual(provided, secret)) return json({ error: "Unauthorized" }, 401);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const events = Array.isArray(payload) ? payload : [payload];
  if (events.length === 0 || events.length > 50) return json({ error: "Send 1 to 50 events" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const results: Array<{ ok: boolean; id?: string | null; error?: string }> = [];
  for (const raw of events as Array<Record<string, unknown>>) {
    const ev = normalizeEvent(raw);
    const app = ev?.app, event = ev?.event;
    if (typeof app !== "string" || !APPS.has(app)) { results.push({ ok: false, error: "bad app" }); continue; }
    if (typeof event !== "string" || !EVENTS.has(event)) { results.push({ ok: false, error: "bad event" }); continue; }
    try {
      const { data, error } = await supabase.rpc("ingest_attribution_event", { p: ev });
      if (error) { console.error("[ingest-attribution] rpc error:", error.message); results.push({ ok: false, error: "insert failed" }); }
      else results.push({ ok: true, id: (data as string | null) ?? null });
    } catch (e) {
      console.error("[ingest-attribution] exception:", e);
      results.push({ ok: false, error: "insert failed" });
    }
  }

  const accepted = results.filter((r) => r.ok).length;
  return json({ ok: true, accepted, results });
});
