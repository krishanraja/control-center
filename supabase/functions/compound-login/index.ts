import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.103.0";

const approvedEmail = "hello@krishraja.com";
const redirectTo = "https://compound.krishraja.com/";
interface RequestBody {
  email?: unknown;
}

interface ResendDomain {
  name?: unknown;
  status?: unknown;
}

function json(message: string, status: number): Response {
  return Response.json({ message }, {
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function emailSender(apiKey: string): Promise<string> {
  const configured = Deno.env.get("COMPOUND_EMAIL_FROM")?.trim();
  if (configured) return configured;

  try {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) {
      const payload = await response.json() as { data?: ResendDomain[] };
      const verified = (payload.data ?? []).filter((domain) => domain.status === "verified" && typeof domain.name === "string");
      const preferred = verified.find((domain) => domain.name === "krishraja.com") ?? verified[0];
      if (typeof preferred?.name === "string") return `COMPOUND <login@${preferred.name}>`;
    }
  } catch {
    // Resend's test sender remains a safe fallback for the account owner.
  }

  return "COMPOUND <onboarding@resend.dev>";
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== "POST") return json("Use POST to request a sign-in email.", 405);
    if (!(await secretMatches(req.headers.get("x-compound-login-token"), Deno.env.get("COMPOUND_LOGIN_PROXY_SECRET")))) {
      return json("This sign-in request could not be verified.", 401);
    }

    let body: RequestBody;
    try {
      body = await req.json() as RequestBody;
    } catch {
      return json("Enter a valid email address.", 400);
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email.length > 254) return json("Enter a valid email address.", 400);

    // Return the same response for unknown addresses to avoid exposing membership.
    if (email !== approvedEmail) return json("If that address has access, its sign-in email is on the way.", 202);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!supabaseUrl || !serviceRoleKey || !resendApiKey) return json("Email is unavailable right now. Try again shortly.", 503);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const deliveries = admin.schema("compound").from("login_deliveries");
    const emailHash = await digest(email);
    const { data: reservationRows, error: reservationError } = await admin
      .schema("compound")
      .rpc("reserve_login_delivery", { p_email_hash: emailHash });
    const reservation = reservationRows?.[0] as { delivery_id?: unknown; outcome?: unknown } | undefined;
    if (reservationError || !reservation) return json("Email is unavailable right now. Try again shortly.", 503);
    if (reservation.outcome === "minute_limit") return json("A sign-in email was just sent. Wait one minute before trying again.", 429);
    if (reservation.outcome === "hour_limit") return json("Too many sign-in emails were requested. Try again in an hour.", 429);
    if (reservation.outcome !== "reserved" || typeof reservation.delivery_id !== "string") {
      return json("Email is unavailable right now. Try again shortly.", 503);
    }
    const reservationId = reservation.delivery_id;

    const fail = async (failureCode: string) => {
      await deliveries.update({ status: "failed", failure_code: failureCode }).eq("id", reservationId);
      return json("Email is unavailable right now. Try again shortly.", 503);
    };

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    const actionLink = link?.properties?.action_link;
    const emailOtp = link?.properties?.email_otp;
    if (linkError || !actionLink || !emailOtp) return await fail("link_generation");

    const sender = await emailSender(resendApiKey);
    const safeLink = escapeHtml(actionLink);
    const safeCode = escapeHtml(emailOtp);
    const providerResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: [email],
        subject: "Your COMPOUND sign-in",
        html: `<div style="background:#090b0d;color:#f2f3f5;font-family:Arial,sans-serif;padding:32px"><div style="max-width:560px;margin:0 auto"><p style="color:#ffb000;font-size:12px;font-weight:700;letter-spacing:2px">COMPOUND</p><h1 style="font-size:30px;margin:28px 0 14px">Open today's view</h1><p style="color:#c5cbd0;font-size:16px;line-height:1.6">Use the button below to sign in. This link works once and expires in one hour.</p><p style="margin:28px 0"><a href="${safeLink}" style="display:inline-block;background:#ffb000;color:#171006;font-weight:700;padding:16px 22px;text-decoration:none">Open COMPOUND</a></p><p style="color:#929ca5;font-size:14px">If the link does not open, enter this code on the sign-in screen:</p><p style="font-family:monospace;font-size:28px;font-weight:700;letter-spacing:6px">${safeCode}</p><p style="color:#626c75;font-size:12px;line-height:1.5">If you did not request this email, you can ignore it.</p></div></div>`,
        text: `Open COMPOUND: ${actionLink}\n\nOr enter this one-time code: ${emailOtp}\n\nThis sign-in expires in one hour.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    let providerId: string | null = null;
    try {
      const providerBody = await providerResponse.json() as { id?: unknown };
      if (typeof providerBody.id === "string") providerId = providerBody.id;
    } catch {
      // A missing provider body is handled by the HTTP status below.
    }
    if (!providerResponse.ok || !providerId) return await fail("provider_rejected");

    const { error: updateError } = await deliveries.update({
      status: "sent",
      delivered_at: new Date().toISOString(),
      provider_message_id: providerId,
      failure_code: null,
    }).eq("id", reservationId);
    if (updateError) return json("The email was sent, but its delivery receipt could not be saved.", 202);

    return json("Email sent. Check your inbox and spam folder.", 202);
  },
};
