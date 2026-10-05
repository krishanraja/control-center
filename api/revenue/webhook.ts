import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { STRIPE_ACCOUNTS, stripeAccount } from '../_stripe.js'
import { refusalStatus, VERIFY_REASON, verifyStripeWebhook, type VerifyFailure } from '../_stripeWebhook.js'

// POST /api/revenue/webhook?account=<key>
//
// A VERIFIED destination for Stripe events, so the fleet has one that is not
// forgeable. Until now the only Stripe-to-database path was the n8n workflow
// `Stripe | Revenue Intake`, whose three webhooks carry no credential and whose
// HMAC check only ran `if (secret && ...)` against a secret store that has
// never been populated. With no secret it skipped verification and upserted
// `customers` anyway, so a forged `invoice.payment_succeeded` from anyone would
// have been recorded as revenue. See api/_stripeWebhook.ts for the full
// finding and tests/api/stripeWebhook.test.ts for the forgeries it refuses.
//
// THIS ROUTE DOES NOT WRITE MONEY, deliberately. `revenue_events` and
// `revenue_subscriptions` have exactly one writer, the daily pull in
// ./sync.ts, because five mutually incompatible MRR sums is what the repo got
// last time two things wrote the same truth (api/_revenue.ts). A verified event
// is recorded in `audit_log` and answered; the pull reconciles the cash. The
// webhook's job here is to be the honest front door and to make a forgery
// visible, not to become a second ledger.
//
// There is no cookie or bearer gate on purpose: Stripe cannot send one. The
// signature IS the credential, which is why it must fail closed.

/** Max body we will even buffer. A real Stripe event is a few KB. */
const MAX_BODY_BYTES = 1_000_000

async function readRawBody(req: VercelRequest): Promise<string | null> {
  // Vercel parses JSON bodies by default, and a parsed-then-restringified body
  // does NOT reproduce the bytes Stripe signed (key order and whitespace both
  // change), so the HMAC would never match. Read the stream instead.
  if (typeof (req as unknown as { body?: unknown }).body === 'string') {
    return (req as unknown as { body: string }).body
  }
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of req as unknown as AsyncIterable<Uint8Array | string>) {
    const b = typeof chunk === 'string' ? new Uint8Array(Buffer.from(chunk, 'utf8')) : new Uint8Array(chunk)
    size += b.length
    if (size > MAX_BODY_BYTES) return null
    chunks.push(b)
  }
  if (chunks.length === 0) return null
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * The signing secret for one account. An env var first, because a secret in
 * Vercel is never readable back by anything that can also read the database;
 * then `system_config.stripe_webhook_signing_secrets`, which is the store the
 * n8n workflow used. Returns null when neither has it, and null means refuse.
 */
async function signingSecretFor(accountKey: string): Promise<string | null> {
  const fromEnv = process.env[`STRIPE_WEBHOOK_SECRET_${accountKey.toUpperCase()}`]
  if (fromEnv) return fromEnv
  try {
    const { data } = await supabase.from('system_config')
      .select('value').eq('key', 'stripe_webhook_signing_secrets').maybeSingle()
    const raw = (data as { value?: unknown } | null)?.value
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const v = parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)[accountKey]
      : null
    return typeof v === 'string' && v ? v : null
  } catch {
    return null
  }
}

/** An audit row that names what happened without ever naming the secret. */
async function audit(eventType: string, message: string, details: Record<string, unknown>) {
  try {
    await supabase.from('audit_log').insert({
      actor: 'system',
      event_type: eventType,
      display_message: message,
      details: JSON.stringify(details),
    })
  } catch {
    // An audit write failing must not turn a correct refusal into a 500.
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  // No CORS origin: a browser has no business calling this.
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'POST only' })
  }

  const accountKey = String(req.query.account || '')
  const account = stripeAccount(accountKey)
  if (!account) {
    return res.status(404).json({
      ok: false,
      error: `unknown account. One of: ${STRIPE_ACCOUNTS.map(a => a.key).join(', ')}`,
    })
  }

  const rawBody = await readRawBody(req)
  const signatureHeader = req.headers['stripe-signature']
  const secret = await signingSecretFor(account.key)

  const result = verifyStripeWebhook({
    rawBody,
    signatureHeader: Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader,
    secret,
  })

  // Pulled out of the union before the await: narrowing across an await inside
  // a branch is not something to rely on, and this is the security path.
  const refused: VerifyFailure | null = result.ok ? null : result.reason
  if (refused) {
    // Every refusal is recorded. An unsigned POST to a public URL is either a
    // misconfiguration or someone probing, and both are worth seeing.
    await audit('stripe-webhook-refused',
      `Stripe webhook refused for ${account.label}: ${VERIFY_REASON[refused]}.`,
      { account: account.key, reason: refused, had_signature: Boolean(signatureHeader), bytes: rawBody?.length ?? 0 })
    return res.status(refusalStatus(refused)).json({
      ok: false, refused, error: VERIFY_REASON[refused],
    })
  }

  let event: Record<string, unknown> | null = null
  try {
    event = JSON.parse(rawBody as string) as Record<string, unknown>
  } catch {
    // Signed by us and still not JSON should never happen; say so rather than
    // guess at it.
    await audit('stripe-webhook-refused',
      `Stripe webhook for ${account.label} carried a valid signature over a body that is not JSON.`,
      { account: account.key, reason: 'signed_body_not_json' })
    return res.status(400).json({ ok: false, refused: 'signed_body_not_json' })
  }

  await audit('stripe-webhook-verified',
    `Stripe webhook verified for ${account.label}: ${String(event.type || 'event')}.`,
    { account: account.key, type: event.type ?? null, event_id: event.id ?? null })

  // Accepted, not applied: ./sync.ts is the only writer of the money.
  return res.status(202).json({
    ok: true,
    verified: true,
    account: account.key,
    type: event.type ?? null,
    reconciled_by: 'the daily pull at /api/revenue/sync, which is the only writer of revenue_events and revenue_subscriptions',
  })
}
