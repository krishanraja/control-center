import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { runCheck, pingClassify, PROVIDERS } from '../../api/_connections.js'

// The ping check treats 400, 404 and 405 as a live key, reasoning that a
// rejected request shape still proved the key was accepted. That reasoning is
// false for an OAuth token endpoint. Measured on 2026-10-05 against the real
// Heartside store: Shopify answers a wrong client secret with
// "400 - Oauth error invalid_request" and a wrong client id with
// "400 - Oauth error application_cannot_be_found". Under the remap, a dead
// Shopify credential reads green for as long as nobody looks. These tests are
// what stops the `strict` flag being removed without anyone noticing.

const SHOPIFY_WRONG_SECRET = '<!DOCTYPE html><html><head><title>400 - Oauth error invalid_request</title></head></html>'
const SHOPIFY_WRONG_CLIENT = '<!DOCTYPE html><html><head><title>400 - Oauth error application_cannot_be_found</title></head></html>'

function stubFetch(status: number, body: string) {
  return mock.method(globalThis, 'fetch', async () => new Response(body, { status }))
}

test('the trap is real: without strict, a Shopify 400 would read as a live key', () => {
  assert.equal(pingClassify(400, SHOPIFY_WRONG_SECRET), 'ok')
})

test('Shopify and the Stripe org key both opt out of the ping remap', () => {
  assert.equal(PROVIDERS['shopify-heartside'].strict, true)
  assert.equal(PROVIDERS['stripe-org'].strict, true)
})

test('a wrong Shopify secret reads as auth_failed, not ok', async () => {
  const f = stubFetch(400, SHOPIFY_WRONG_SECRET)
  try {
    const r = await runCheck('shopify-heartside', 'shpss_wrong', 'ping')
    assert.equal(r.status, 'auth_failed')
    assert.equal(r.httpStatus, 400)
  } finally { f.mock.restore() }
})

test('a wrong Shopify client id reads as auth_failed, not ok', async () => {
  const f = stubFetch(400, SHOPIFY_WRONG_CLIENT)
  try {
    const r = await runCheck('shopify-heartside', 'shpss_wrong', 'ping')
    assert.equal(r.status, 'auth_failed')
  } finally { f.mock.restore() }
})

test('a minted Shopify token reads as ok', async () => {
  const f = stubFetch(200, JSON.stringify({ access_token: 'x', scope: 'read_orders', expires_in: 86399 }))
  try {
    const r = await runCheck('shopify-heartside', 'shpss_right', 'ping')
    assert.equal(r.status, 'ok')
  } finally { f.mock.restore() }
})

test('the Shopify check posts the client credentials grant to the Heartside store', () => {
  const { url, init } = PROVIDERS['shopify-heartside'].build('shpss_secret')
  assert.equal(url, 'https://bnf1em-ge.myshopify.com/admin/oauth/access_token')
  assert.equal(init?.method, 'POST')
  const body = new URLSearchParams(String(init?.body))
  assert.equal(body.get('grant_type'), 'client_credentials')
  assert.equal(body.get('client_secret'), 'shpss_secret')
})

test('the org key check carries both headers Stripe requires', () => {
  const headers = PROVIDERS['stripe-org'].build('sk_org_x').init?.headers as Record<string, string>
  assert.match(headers['Stripe-Context'], /^acct_/)
  assert.ok(headers['Stripe-Version'], 'without Stripe-Version every org-key v1 call is rejected')
})

test('a 400 on a non-strict provider still gets the ping remap', async () => {
  // The remap is right for ordinary APIs; strict must not have changed them.
  const f = stubFetch(400, '{"error":"bad shape"}')
  try {
    const r = await runCheck('openai', 'sk-x', 'ping')
    assert.equal(r.status, 'ok')
  } finally { f.mock.restore() }
})
