import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import {
  DEFAULT_TOLERANCE_SEC,
  parseStripeSignature,
  refusalStatus,
  verifyStripeWebhook,
} from '../../api/_stripeWebhook.ts'

// The attack these tests describe is the one the fleet was actually open to:
// the n8n Stripe intake verified a signature only `if (secret && ...)`, and the
// secret store has never been populated, so an unsigned POST from anyone fell
// through to an upsert into `customers`. Every test below is written from the
// forger's side first: the forgery must fail BEFORE the honest path passes,
// because a verifier that has never been seen to reject is a comment.

const SECRET = 'whsec_test_only_not_a_real_secret_value'
const NOW = 1_760_000_000

/** A real Stripe event body, the kind the forger would send. */
const FORGED_BODY = JSON.stringify({
  id: 'evt_forged',
  type: 'invoice.payment_succeeded',
  data: { object: { customer: 'cus_attacker', amount_paid: 99_900_00, customer_email: 'attacker@example.com' } },
})

function sign(body: string, secret: string, t = NOW): string {
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex')
  return `t=${t},v1=${v1}`
}

// ── the forgeries ──────────────────────────────────────────────────────────

test('a forged payload with NO signature header is rejected', () => {
  const r = verifyStripeWebhook({
    rawBody: FORGED_BODY, signatureHeader: null, secret: SECRET, nowSec: NOW,
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'missing_signature')
  assert.equal(refusalStatus('missing_signature'), 400)
})

test('a forged payload signed with the WRONG secret is rejected', () => {
  const r = verifyStripeWebhook({
    rawBody: FORGED_BODY,
    signatureHeader: sign(FORGED_BODY, 'whsec_the_forger_guessed_this'),
    secret: SECRET,
    nowSec: NOW,
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'bad_signature')
})

test('a real signature replayed onto a TAMPERED body is rejected', () => {
  // The forger captures one genuine event and edits the amount. The signature
  // still parses and the timestamp is still fresh; only the HMAC gives it away.
  const header = sign(FORGED_BODY, SECRET)
  const tampered = FORGED_BODY.replace('cus_attacker', 'cus_victim__')
  assert.equal(tampered.length, FORGED_BODY.length, 'same length, so only the HMAC can catch it')
  const r = verifyStripeWebhook({ rawBody: tampered, signatureHeader: header, secret: SECRET, nowSec: NOW })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'bad_signature')
})

test('a genuine event captured and replayed later is rejected', () => {
  const header = sign(FORGED_BODY, SECRET, NOW)
  const r = verifyStripeWebhook({
    rawBody: FORGED_BODY, signatureHeader: header, secret: SECRET,
    nowSec: NOW + DEFAULT_TOLERANCE_SEC + 1,
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'timestamp_outside_tolerance')
})

test('THE BUG: with no secret configured the event is REFUSED, never processed', () => {
  // This is the exact case the n8n workflow treated as "skip the check and
  // carry on". Both an undefined and an empty secret must refuse.
  for (const secret of [undefined, null, '']) {
    const r = verifyStripeWebhook({
      rawBody: FORGED_BODY, signatureHeader: sign(FORGED_BODY, SECRET), secret, nowSec: NOW,
    })
    assert.equal(r.ok, false, `secret ${JSON.stringify(secret)} must not verify`)
    assert.equal(r.reason, 'no_secret')
  }
  // And it is reported as our misconfiguration, not as the caller's forgery.
  assert.equal(refusalStatus('no_secret'), 503)
})

test('an empty body cannot be verified even with a well-formed header', () => {
  const r = verifyStripeWebhook({
    rawBody: '', signatureHeader: sign('', SECRET), secret: SECRET, nowSec: NOW,
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no_body')
})

test('a header with a timestamp but no v1, or v1 but no timestamp, is malformed', () => {
  for (const header of [`t=${NOW}`, 'v1=abc123', `t=notanumber,v1=abc123`, '', 'garbage']) {
    const r = verifyStripeWebhook({ rawBody: FORGED_BODY, signatureHeader: header, secret: SECRET, nowSec: NOW })
    assert.equal(r.ok, false)
    assert.ok(
      ['malformed_signature', 'missing_signature'].includes(r.reason as string),
      `${JSON.stringify(header)} gave ${r.reason ?? 'ok'}`,
    )
  }
})

test('a non-hex v1 is not accepted as a signature', () => {
  const r = verifyStripeWebhook({
    rawBody: FORGED_BODY, signatureHeader: `t=${NOW},v1=zzzz`, secret: SECRET, nowSec: NOW,
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'malformed_signature')
})

// ── the honest path ────────────────────────────────────────────────────────

test('a correctly signed event verifies', () => {
  const r = verifyStripeWebhook({
    rawBody: FORGED_BODY, signatureHeader: sign(FORGED_BODY, SECRET), secret: SECRET, nowSec: NOW,
  })
  assert.equal(r.ok, true)
  assert.equal(r.timestamp, NOW)
})

test('a secret roll is survived: several v1 values, one of them ours', () => {
  const t = NOW
  const mine = createHmac('sha256', SECRET).update(`${t}.${FORGED_BODY}`, 'utf8').digest('hex')
  const theirs = createHmac('sha256', 'whsec_the_old_one').update(`${t}.${FORGED_BODY}`, 'utf8').digest('hex')
  for (const header of [`t=${t},v1=${theirs},v1=${mine}`, `t=${t},v1=${mine},v1=${theirs}`]) {
    const r = verifyStripeWebhook({ rawBody: FORGED_BODY, signatureHeader: header, secret: SECRET, nowSec: NOW })
    assert.equal(r.ok, true, header.slice(0, 24))
  }
})

test('an uppercase v1 from a different client still matches', () => {
  const t = NOW
  const mine = createHmac('sha256', SECRET).update(`${t}.${FORGED_BODY}`, 'utf8').digest('hex').toUpperCase()
  const r = verifyStripeWebhook({
    rawBody: FORGED_BODY, signatureHeader: `t=${t},v1=${mine}`, secret: SECRET, nowSec: NOW,
  })
  assert.equal(r.ok, true)
})

test('a signature a little old, but inside the window, still verifies', () => {
  const r = verifyStripeWebhook({
    rawBody: FORGED_BODY, signatureHeader: sign(FORGED_BODY, SECRET, NOW),
    secret: SECRET, nowSec: NOW + DEFAULT_TOLERANCE_SEC,
  })
  assert.equal(r.ok, true)
})

test('the parser keeps every v1 and ignores schemes it does not know', () => {
  const p = parseStripeSignature(`t=123,v0=deadbeef,v1=aa,v1=bb,junk`)
  assert.equal(p.timestamp, 123)
  assert.deepEqual(p.v1, ['aa', 'bb'])
})
