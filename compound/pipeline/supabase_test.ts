import { beginRun } from "./supabase.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("snapshot run writes declare a JSON request body", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = Deno.env.get("SUPABASE_URL");
  const originalKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

  globalThis.fetch = async (_input, init) => {
    const request = init as unknown as { headers?: HeadersInit; method?: string };
    const headers = new Headers(request?.headers);
    assert(headers.get("Content-Type") === "application/json", "PostgREST writes must declare JSON");
    assert(request?.method === "POST", "beginRun must write with POST");
    return new Response(JSON.stringify([{ id: "00000000-0000-0000-0000-000000000001", status: "running" }]), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const run = await beginRun({
      userId: "00000000-0000-0000-0000-000000000002",
      snapshotDate: "2026-08-11",
      mode: "manual",
      attempt: 1,
    });
    assert(run.status === "running", "beginRun must return the created run");
  } finally {
    globalThis.fetch = originalFetch;
    originalUrl == null ? Deno.env.delete("SUPABASE_URL") : Deno.env.set("SUPABASE_URL", originalUrl);
    originalKey == null
      ? Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY")
      : Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", originalKey);
  }
});
