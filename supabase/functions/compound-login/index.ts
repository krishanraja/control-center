import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.103.0";

const approvedEmail = "hello@krishraja.com";

function json(body: { message: string; tokenHash?: string }, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function secretMatches(received: string | null, expected: string | undefined): Promise<boolean> {
  if (!received || !expected) return false;
  const [receivedHash, expectedHash] = await Promise.all([digest(received), digest(expected)]);
  return receivedHash === expectedHash;
}

function normalizedWord(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function secureHexMatches(received: string, expected: string | undefined): boolean {
  if (!/^[0-9a-f]{64}$/.test(received) || !expected || !/^[0-9a-f]{64}$/.test(expected)) return false;
  let difference = 0;
  for (let index = 0; index < received.length; index += 1) {
    difference |= received.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== "POST") return json({ message: "Use POST to open COMPOUND." }, 405);
    if (!(await secretMatches(req.headers.get("x-compound-login-token"), Deno.env.get("COMPOUND_LOGIN_PROXY_SECRET")))) {
      return json({ message: "This sign-in request could not be verified." }, 401);
    }

    let magicWord = "";
    try {
      const body: unknown = await req.json();
      if (typeof body === "object" && body !== null && "magicWord" in body && typeof body.magicWord === "string") {
        magicWord = body.magicWord;
      }
    } catch {
      return json({ message: "Enter your magic word." }, 400);
    }
    if (!magicWord || magicWord.length > 128) return json({ message: "Enter your magic word." }, 400);

    const fingerprint = req.headers.get("x-compound-client-fingerprint") ?? "";
    if (!/^[0-9a-f]{64}$/.test(fingerprint)) return json({ message: "This sign-in request could not be verified." }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const expectedWordHash = Deno.env.get("COMPOUND_MAGIC_WORD_HASH")?.trim().toLowerCase();
    if (!supabaseUrl || !serviceRoleKey || !expectedWordHash) {
      return json({ message: "COMPOUND could not open right now. Try again shortly." }, 503);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: reservationRows, error: reservationError } = await admin
      .schema("compound")
      .rpc("reserve_access_attempt", { p_fingerprint_hash: fingerprint });
    const reservation = Array.isArray(reservationRows) ? reservationRows[0] : undefined;
    if (reservationError || !reservation) {
      return json({ message: "COMPOUND could not open right now. Try again shortly." }, 503);
    }
    if (reservation.outcome === "locked") {
      return json({ message: "Too many tries. Wait 15 minutes, then try again." }, 429);
    }
    if (reservation.outcome !== "reserved" || typeof reservation.attempt_id !== "string") {
      return json({ message: "COMPOUND could not open right now. Try again shortly." }, 503);
    }
    const attemptId = reservation.attempt_id;
    const attempts = admin.schema("compound").from("access_attempts");

    const receivedWordHash = await digest(normalizedWord(magicWord));
    if (!secureHexMatches(receivedWordHash, expectedWordHash)) {
      await attempts.update({ outcome: "rejected" }).eq("id", attemptId);
      return json({ message: "That magic word did not work." }, 401);
    }

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: approvedEmail,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || typeof tokenHash !== "string" || !tokenHash) {
      await attempts.update({ outcome: "error" }).eq("id", attemptId);
      return json({ message: "COMPOUND could not open right now. Try again shortly." }, 503);
    }

    await attempts.update({ outcome: "accepted" }).eq("id", attemptId);
    return json({ message: "Opening COMPOUND.", tokenHash }, 200);
  },
};
