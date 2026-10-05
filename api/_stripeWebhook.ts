/**
 * Stripe webhook signature verification that FAILS CLOSED.
 *
 * The hole this closes, measured on 2026-10-05 rather than assumed. The one
 * Stripe-to-`customers` writer in the fleet is the n8n workflow
 * `Stripe | Revenue Intake` (3 webhook triggers, no credential on any of them,
 * reachable by anyone who knows the path). Its HMAC check was written
 * `if (secret && raw) { ...verify... }` against
 * `system_config.stripe_webhook_signing_secrets`, which has never been
 * populated. With no secret the whole check was SKIPPED and execution fell
 * straight through to an upsert into `customers`. So a forged
 * `invoice.payment_succeeded` from anyone would have been recorded as revenue.
 *
 * Two accidents are the only reason it was never exploitable: all three code
 * nodes are `disabled: true`, and their Supabase headers were blanked on
 * 2026-10-03. Neither is a security control. Re-enabling one node would have
 * reopened the hole with no warning, so the shape of the check is the bug, not
 * its current reachability.
 *
 * The rule here is the opposite one: NO SECRET MEANS NO PROCESSING. A missing
 * secret is a refusal, never a pass. Everything below is pure so it can be
 * tested against forged input without a network or a database.
 *
 * Stripe's scheme (`stripe-signature` header): `t=<unix>,v1=<hex>,v1=<hex>`,
 * where each `v1` is HMAC-SHA256 of `"<t>.<raw body>"` under the signing
 * secret. Several `v1` values appear while a secret is being rolled. The
 * comparison must be constant time, and the timestamp must be inside a
 * tolerance window or a captured-and-replayed real event stays valid forever.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Stripe's own default replay window, in seconds. */
export const DEFAULT_TOLERANCE_SEC = 300

export type VerifyFailure =
  | 'no_secret'
  | 'no_body'
  | 'missing_signature'
  | 'malformed_signature'
  | 'bad_signature'
  | 'timestamp_outside_tolerance'

/**
 * One flat shape rather than a discriminated union, deliberately.
 * `tsconfig.api.json` sets `strict: false`, so `strictNullChecks` is off, and
 * with it off TypeScript does not narrow a union on a boolean discriminant:
 * `if (!r.ok)` left `r.reason` an error on every reference. A union that cannot
 * be narrowed is worse than no union, so the result always carries both fields
 * and `reason` is null exactly when `ok` is true.
 */
export interface VerifyResult {
  ok: boolean
  reason: VerifyFailure | null
  /** The signature timestamp, when there was a usable one. */
  timestamp: number | null
}

const fail = (reason: VerifyFailure): VerifyResult => ({ ok: false, reason, timestamp: null })

function constantTimeEquals(a: string, b: string): boolean {
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length, so hash both sides to a fixed width before comparing.
  const ab = new Uint8Array(Buffer.from(a, 'utf8'))
  const bb = new Uint8Array(Buffer.from(b, 'utf8'))
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export interface ParsedSignature {
  timestamp: number | null
  v1: string[]
}

/** Parse `t=...,v1=...,v1=...`. Unknown schemes are ignored, not trusted. */
export function parseStripeSignature(header: string): ParsedSignature {
  let timestamp: number | null = null
  const v1: string[] = []
  for (const part of String(header || '').split(',')) {
    const i = part.indexOf('=')
    if (i < 1) continue
    const k = part.slice(0, i).trim()
    const v = part.slice(i + 1).trim()
    if (k === 't' && /^\d+$/.test(v)) timestamp = Number(v)
    else if (k === 'v1' && /^[a-f0-9]+$/i.test(v)) v1.push(v.toLowerCase())
  }
  return { timestamp, v1 }
}

/**
 * Verify a raw Stripe webhook body. `secret` may be undefined, and that is a
 * REFUSAL: this function never returns ok for an unconfigured endpoint.
 */
export function verifyStripeWebhook(opts: {
  rawBody: string | null | undefined
  signatureHeader: string | null | undefined
  secret: string | null | undefined
  nowSec?: number
  toleranceSec?: number
}): VerifyResult {
  const { rawBody, signatureHeader, secret } = opts
  // Fail closed. This single line is the whole fix: the n8n version made the
  // absence of a secret the condition for skipping the check.
  if (!secret) return fail('no_secret')
  if (typeof rawBody !== 'string' || rawBody.length === 0) return fail('no_body')
  if (!signatureHeader) return fail('missing_signature')

  const { timestamp, v1 } = parseStripeSignature(signatureHeader)
  if (timestamp == null || v1.length === 0) return fail('malformed_signature')

  const tolerance = opts.toleranceSec ?? DEFAULT_TOLERANCE_SEC
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > tolerance) return fail('timestamp_outside_tolerance')

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex')
  // Compare against every offered v1 in constant time. `.includes()` would be
  // a plain string compare, which is what the n8n version used.
  let matched = false
  for (const candidate of v1) if (constantTimeEquals(candidate, expected)) matched = true
  return matched ? { ok: true, reason: null, timestamp } : fail('bad_signature')
}

/** Plain English for an audit row and the HTTP body. Never names the secret. */
export const VERIFY_REASON: Record<VerifyFailure, string> = {
  no_secret: 'no signing secret is configured for this account, so the event was refused rather than trusted',
  no_body: 'the request had no body to verify',
  missing_signature: 'the request carried no stripe-signature header',
  malformed_signature: 'the stripe-signature header had no usable timestamp and v1 pair',
  bad_signature: 'the signature did not match this account signing secret',
  timestamp_outside_tolerance: 'the signature timestamp is outside the replay window',
}

/**
 * The status to answer a refusal with. A forged or unsigned event gets 400:
 * Stripe retries a 5xx, and an unconfigured endpoint answering 5xx forever
 * would bury the real reason in a retry storm. `no_secret` is the one case
 * that IS our fault, so it answers 503 and says so.
 */
export function refusalStatus(reason: VerifyFailure): number {
  return reason === 'no_secret' ? 503 : 400
}
