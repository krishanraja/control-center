import { latestSuccessfulSnapshot, markAlertSent, memberEmail } from "./supabase.ts";

export function failureAlertIdempotencyKey(userId: string, snapshotDate: string): string {
  return `compound-daily-failure-${userId}-${snapshotDate}`;
}

export async function sendFinalFailureAlert(options: {
  runId: string;
  userId: string;
  snapshotDate: string;
  failedFeeds: string[];
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const from = Deno.env.get("COMPOUND_ALERT_FROM")?.trim();
  if (!apiKey || !from) return false;
  const to = await memberEmail(options.userId);
  if (!to) throw new Error("The COMPOUND member has no email address");
  const last = await latestSuccessfulSnapshot(options.userId);
  const lastSuccess = last?.snapshot_date ?? "none";
  const failed = options.failedFeeds.length ? options.failedFeeds.join(", ") : "unknown feeds";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": failureAlertIdempotencyKey(options.userId, options.snapshotDate),
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `COMPOUND brief delayed for ${options.snapshotDate}`,
      html:
        `<div style="background:#0b0d10;color:#f5f2ea;padding:32px;font-family:Arial,sans-serif"><p style="color:#fab219;letter-spacing:.08em;text-transform:uppercase">COMPOUND</p><h1 style="font-size:26px">The daily market brief is delayed.</h1><p>Three attempts did not produce a safely supported snapshot for ${options.snapshotDate}.</p><p><strong>Feeds:</strong> ${failed}</p><p><strong>Last successful snapshot:</strong> ${lastSuccess}</p><p>The last successful brief remains available and has not been overwritten.</p></div>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
  await markAlertSent(options.runId);
  return true;
}
